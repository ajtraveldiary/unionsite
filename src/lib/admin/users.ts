// Users (plan, section 10; approved wireframe "Users"). Only invited emails get in: Cloudflare
// Access sends the one-time code, and src/lib/admin/auth.ts lets in only active users listed
// here, so switching someone off ends their access on their next click, even mid-session. The
// super admin invites anyone with any role; a district admin invites editors for their own
// district only. Switched-off people stay listed, so their past work still shows who did it.
import { and, asc, count, eq, ne } from 'drizzle-orm';
import { getDb } from '~/db/client';
import { users, ROLES, type Role } from '~/db/schema';
import { districtBySlug } from '~/data/districts';
import { audit } from './audit';
import { AdminError } from './publish';
import { roleLabels, type AdminUser } from './roles';

export const mayManage = (user: AdminUser) => user.role === 'super_admin' || user.role === 'district_admin';

/** Whether this person may change that user: the super admin anyone; a district admin their district's editors */
const mayChange = (user: AdminUser, target: { role: Role; district: string | null }) =>
  user.role === 'super_admin' || (user.role === 'district_admin' && target.role === 'district_editor' && target.district === user.district);

export async function listUsers(user: AdminUser) {
  if (!mayManage(user)) throw new AdminError('Users are managed by the super admin.', 403);
  const db = await getDb();
  const rows = await db.select().from(users)
    .where(user.role === 'super_admin' ? undefined : eq(users.district, user.district ?? '__none__'))
    .orderBy(asc(users.role), asc(users.district), asc(users.name));
  return rows.map((u) => ({ ...u, canChange: mayChange(user, u) && u.id !== user.id }));
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

function cleanRole(user: AdminUser, input: Record<string, unknown>): { role: Role; district: string | null } {
  if (user.role !== 'super_admin') return { role: 'district_editor', district: user.district };
  const role = ROLES.find((r) => r === input.role);
  if (!role) throw new AdminError('Choose a role.');
  const district = str(input.district, 40) || null;
  if (role === 'district_admin' || role === 'district_editor') {
    if (!district || !districtBySlug[district]) throw new AdminError('Choose the district for a district role.');
    return { role, district };
  }
  return { role, district: null };
}

export async function inviteUser(user: AdminUser, input: Record<string, unknown>) {
  if (!mayManage(user)) throw new AdminError('Users are managed by the super admin.', 403);
  const email = str(input.email, 160).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) throw new AdminError('The email address could not be read.');
  const name = str(input.name, 120) || email.split('@')[0];
  const { role, district } = cleanRole(user, input);
  const db = await getDb();
  const existing = await db.select({ id: users.id, active: users.active }).from(users).where(eq(users.email, email)).get();
  if (existing) throw new AdminError(existing.active ? 'That email is already on the list.' : 'That email is on the list but switched off. Switch it on instead.');
  const row = await db.insert(users).values({ email, name, role, district, invitedBy: user.id }).returning({ id: users.id }).get();
  await audit(user, 'invite_user', 'user', row.id, { district, summary: `${email} · ${roleLabels[role]}${district ? ` · ${districtBySlug[district].name.en}` : ''}` });
  return row.id;
}

/** Keeps at least one active super admin, so nobody can lock the union out */
async function lastSuper(id: number) {
  const db = await getDb();
  const [{ n }] = await db.select({ n: count() }).from(users).where(and(eq(users.role, 'super_admin'), eq(users.active, true), ne(users.id, id)));
  return n === 0;
}

export async function updateUser(user: AdminUser, id: number, input: Record<string, unknown>) {
  const db = await getDb();
  const target = await db.select().from(users).where(eq(users.id, id)).get();
  if (!target || !mayChange(user, target)) throw new AdminError('You can’t change this person.', 403);
  if (id === user.id) throw new AdminError('Ask another super admin to change your own role.');
  const { role, district } = cleanRole(user, { role: target.role, district: target.district, ...input });
  if (target.role === 'super_admin' && role !== 'super_admin' && (await lastSuper(id))) throw new AdminError('There must be at least one super admin.');
  await db.update(users).set({ name: str(input.name, 120) || target.name, role, district }).where(eq(users.id, id));
  await audit(user, 'update_user', 'user', id, { district, summary: `${target.email}`, diff: { role: [target.role, role], district: [target.district, district] } });
}

export async function setActive(user: AdminUser, id: number, active: boolean) {
  const db = await getDb();
  const target = await db.select().from(users).where(eq(users.id, id)).get();
  if (!target || !mayChange(user, target)) throw new AdminError('You can’t change this person.', 403);
  if (id === user.id) throw new AdminError('You can’t switch yourself off.');
  if (!active && target.role === 'super_admin' && (await lastSuper(id))) throw new AdminError('There must be at least one active super admin.');
  await db.update(users).set({ active }).where(eq(users.id, id));
  await audit(user, active ? 'switch_on' : 'switch_off', 'user', id, { district: target.district, summary: target.email });
}
