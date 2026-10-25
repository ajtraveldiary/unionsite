// Who is signed in to the admin (plan, section 10, "How an admin logs in"). On the real site
// Cloudflare Access sits in front of /admin: the admin types their email, gets a one-time code, and
// Access sends a signed token with every request. We check that token's signature against Access's
// public keys (never just trust an email header), then look the email up in `users`: only active
// users get in, with the role and district stored there. Without Access (`astro dev`, or a preview
// with ADMIN_DEV_LOGIN=1) a stand-in login at /admin/login picks one of the users instead.
import type { AstroCookies } from 'astro';
import { and, count, eq } from 'drizzle-orm';
import { getDb } from '~/db/client';
import { users } from '~/db/schema';
import { audit } from './audit';
import type { AdminUser } from './roles';

export const DEV_COOKIE = 'admin_user';

async function env() {
  return (await import('cloudflare:workers')).env;
}

/** Access in front of the admin, when its team domain and audience are configured */
export async function accessConfigured() {
  const e = await env();
  return !!(e.ACCESS_TEAM_DOMAIN && e.ACCESS_AUD);
}

/** The stand-in login: always in `astro dev`, elsewhere only when switched on and Access isn't */
export async function devLoginAllowed() {
  if (await accessConfigured()) return false;
  return import.meta.env.DEV || (await env()).ADMIN_DEV_LOGIN === '1';
}

// ── Cloudflare Access token ──────────────────────────────────────────────────────────────

interface Jwk extends JsonWebKey { kid: string }
let certs: { keys: Jwk[]; at: number } | undefined;

const b64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
const json = (s: string) => JSON.parse(new TextDecoder().decode(b64url(s)));

async function accessKeys(team: string, refresh = false) {
  if (!certs || refresh || Date.now() - certs.at > 60 * 60 * 1000) {
    const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
    certs = { keys: ((await res.json()) as { keys: Jwk[] }).keys, at: Date.now() };
  }
  return certs.keys;
}

/** The email in a valid Access token for our admin application, or null */
async function accessEmail(token: string, team: string, aud: string): Promise<string | null> {
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return null;
  try {
    const header = json(h);
    const claims = json(p);
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes(aud) || claims.iss !== `https://${team}` || !(claims.exp > Date.now() / 1000)) return null;
    let jwk = (await accessKeys(team)).find((k) => k.kid === header.kid);
    if (!jwk) jwk = (await accessKeys(team, true)).find((k) => k.kid === header.kid); // keys rotated
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(s), new TextEncoder().encode(`${h}.${p}`));
    return ok && typeof claims.email === 'string' ? claims.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

// ── Signed-in user ───────────────────────────────────────────────────────────────────────

const columns = { id: users.id, email: users.email, name: users.name, role: users.role, district: users.district, lastLoginAt: users.lastLoginAt };

/** The admin making this request, or null when nobody (allowed) is signed in */
export async function currentUser(request: Request, cookies: AstroCookies): Promise<AdminUser | null> {
  const e = await env();
  const db = await getDb();
  let row: (AdminUser & { lastLoginAt: string | null }) | undefined;

  if (e.ACCESS_TEAM_DOMAIN && e.ACCESS_AUD) {
    const token = request.headers.get('Cf-Access-Jwt-Assertion') ?? cookies.get('CF_Authorization')?.value;
    const email = token ? await accessEmail(token, e.ACCESS_TEAM_DOMAIN, e.ACCESS_AUD) : null;
    if (!email) return null;
    row = await db.select(columns).from(users).where(and(eq(users.email, email), eq(users.active, true))).get();
    // The very first sign-in: the bootstrap email becomes the super admin, who then invites everyone
    if (!row && e.ADMIN_BOOTSTRAP_EMAIL && email === e.ADMIN_BOOTSTRAP_EMAIL.toLowerCase()) {
      const [{ n }] = await db.select({ n: count() }).from(users);
      if (n === 0) row = await db.insert(users).values({ email, name: email, role: 'super_admin' }).returning(columns).get();
    }
  } else if (await devLoginAllowed()) {
    const id = Number(cookies.get(DEV_COOKIE)?.value);
    if (!id) return null;
    row = await db.select(columns).from(users).where(and(eq(users.id, id), eq(users.active, true))).get();
  }
  if (!row) return null;

  const { lastLoginAt, ...user } = row;
  // Access sessions last 24 hours, so a sign-in is a request at least 12 hours after the last one
  const now = new Date();
  if (!lastLoginAt || now.getTime() - new Date(`${lastLoginAt}Z`).getTime() > 12 * 60 * 60 * 1000) {
    await db.update(users).set({ lastLoginAt: now.toISOString().replace('T', ' ').slice(0, 19) }).where(eq(users.id, user.id));
    await audit(user, 'login', 'user', user.id, { summary: user.email });
  }
  return user;
}

/** Where "Log out" goes: Access's own logout, or the stand-in login */
export async function logoutUrl() {
  return (await accessConfigured()) ? '/cdn-cgi/access/logout' : '/admin/login?logout=1';
}
