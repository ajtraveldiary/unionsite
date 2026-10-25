// The Contact page's form (plan, sections 8 and 13): messages are saved for the admin's Inbox.
// Spam is kept out by a hidden field that people never fill, Cloudflare Turnstile when its keys
// are set (TURNSTILE_SITE_KEY, TURNSTILE_SECRET), and a limit of five messages a day from one
// sender. The sender is recognised by a hash of their address and the day, never the address itself.
import { and, count, eq, gte } from 'drizzle-orm';
import { getDb } from '~/db/client';
import { contactMessages } from '~/db/schema';
import { districtBySlug } from '~/data/districts';

export const TOPICS = ['General', 'Membership', 'Government orders', 'Kerala Service', 'Website'];
const PER_DAY = 5;

export class ContactError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

async function env() {
  return (await import('cloudflare:workers')).env as { TURNSTILE_SITE_KEY?: string; TURNSTILE_SECRET?: string };
}

/** The Turnstile site key, when spam protection is switched on (the page shows the check then) */
export const turnstileKey = async () => (await env()).TURNSTILE_SITE_KEY ?? null;

const hex = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : '');

export async function saveMessage(request: Request, input: Record<string, unknown>) {
  // People never see this field; form-filling robots do
  if (str(input.website, 200)) return;
  const name = str(input.name, 120).replace(/\s+/g, ' ');
  const email = str(input.email, 160);
  const message = str(input.message, 5000);
  if (!name || !message) throw new ContactError('Fill in your name and the message.');
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) throw new ContactError('The email address could not be read.');
  const phone = str(input.phone, 30);
  const district = str(input.district, 40);
  const topic = TOPICS.includes(String(input.topic)) ? String(input.topic) : 'General';

  const e = await env();
  const ip = request.headers.get('CF-Connecting-IP') ?? '';
  if (e.TURNSTILE_SECRET) {
    const token = str(input['cf-turnstile-response'], 2048);
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body: new URLSearchParams({ secret: e.TURNSTILE_SECRET, response: token, ...(ip && { remoteip: ip }) }),
    });
    if (!((await r.json()) as { success?: boolean }).success) throw new ContactError('The spam check didn’t pass. Try again.');
  }
  const day = new Date().toISOString().slice(0, 10);
  const senderHash = await hex(`${ip}|${request.headers.get('User-Agent') ?? ''}|${day}|contact`);
  const db = await getDb();
  const [{ n }] = await db.select({ n: count() }).from(contactMessages).where(and(eq(contactMessages.senderHash, senderHash), gte(contactMessages.createdAt, `${day} 00:00:00`)));
  if (n >= PER_DAY) throw new ContactError('You have sent several messages today. Please wait until tomorrow, or phone the office.', 429);
  await db.insert(contactMessages).values({ name, email, phone: phone || null, district: districtBySlug[district] ? district : null, topic, message, senderHash });
}
