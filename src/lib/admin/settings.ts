// Settings in the admin (plan, sections 6 and 10; approved wireframe "Settings"). Everyone who
// translates keeps their own Gemini key in their browser (src/lib/admin/translate.ts); what lives
// here is shared: the site's contact details and social links (super admin), AI translation for
// the whole site (super admin: on or off, the model), the glossary (state roles), and how long
// done inbox messages are kept (super admin). Changing site details purges every cached page,
// since the footer and Contact show them.
import { asc, eq, sql } from 'drizzle-orm';
import { getDb } from '~/db/client';
import { glossary, siteSettings } from '~/db/schema';
import { siteDetails, type SiteDetails } from '~/lib/content';
import { audit } from './audit';
import { AdminError, purge } from './publish';
import { DEFAULT_MODEL } from './translate';
import { isState, type AdminUser } from './roles';

export const MODELS = [
  { id: 'gemini-2.5-flash', label: 'Gemini Flash (fast, default)' },
  { id: 'gemini-2.5-pro', label: 'Gemini Pro (slower, more careful)' },
];

export interface AiSettings { enabled: boolean; model: string }
export interface InboxSettings { keepMonths: number }

async function read<T>(key: string, fallback: T): Promise<T> {
  const db = await getDb();
  const row = await db.select({ value: siteSettings.value }).from(siteSettings).where(eq(siteSettings.key, key)).get();
  return { ...fallback, ...((row?.value as Partial<T> | undefined) ?? {}) };
}
async function write(key: string, value: unknown) {
  const db = await getDb();
  await db.insert(siteSettings).values({ key, value }).onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedAt: sql`(datetime('now'))` } });
}

export const aiSettings = () => read<AiSettings>('ai', { enabled: true, model: DEFAULT_MODEL });
export const inboxSettings = () => read<InboxSettings>('inbox', { keepMonths: 12 });

function mustSuper(user: AdminUser) {
  if (user.role !== 'super_admin') throw new AdminError('Only the super admin changes this.', 403);
}
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export async function saveSiteDetails(user: AdminUser, input: Record<string, unknown>) {
  mustSuper(user);
  const phone = str(input.phone, 30);
  if (phone && !/^[+\d][\d\s-]{5,}$/.test(phone)) throw new AdminError('The phone number could not be read.');
  const email = str(input.email, 120);
  if (email && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) throw new AdminError('The email address could not be read.');
  const link = (v: unknown, host: RegExp, label: string) => {
    const s = str(v, 300);
    if (s && !(/^https:\/\//.test(s) && host.test(s))) throw new AdminError(`The ${label} link must be an https:// address on that site.`);
    return s;
  };
  const value: SiteDetails = {
    addressMl: typeof input.addressMl === 'string' ? input.addressMl.trim().slice(0, 300) : '',
    addressEn: typeof input.addressEn === 'string' ? input.addressEn.trim().slice(0, 300) : '',
    phone, email,
    facebook: link(input.facebook, /facebook\.com/, 'Facebook'),
    youtube: link(input.youtube, /youtube\.com/, 'YouTube'),
  };
  if (!value.addressMl) throw new AdminError('The address in Malayalam is needed.');
  await write('site_details', value);
  await purge(['site']);
  await audit(user, 'settings', 'settings', null, { summary: 'Site details' });
}

export async function saveAi(user: AdminUser, input: Record<string, unknown>) {
  mustSuper(user);
  const model = MODELS.some((m) => m.id === input.model) ? String(input.model) : DEFAULT_MODEL;
  await write('ai', { enabled: input.enabled === 'on' || input.enabled === true, model });
  await audit(user, 'settings', 'settings', null, { summary: `AI translation ${input.enabled ? 'on' : 'off'}, ${model}` });
}

export async function saveInbox(user: AdminUser, input: Record<string, unknown>) {
  mustSuper(user);
  const months = Number(input.keepMonths);
  if (!(Number.isInteger(months) && months >= 1 && months <= 60)) throw new AdminError('Keep messages between 1 and 60 months.');
  await write('inbox', { keepMonths: months });
  await audit(user, 'settings', 'settings', null, { summary: `Inbox messages kept ${months} months` });
}

// ── Glossary ────────────────────────────────────────────────────────────────────────────

export async function listGlossary() {
  const db = await getDb();
  return db.select({ id: glossary.id, ml: glossary.ml, en: glossary.en, note: glossary.note }).from(glossary).orderBy(asc(glossary.ml));
}

export async function saveTerm(user: AdminUser, id: number | null, input: Record<string, unknown>) {
  if (!isState(user)) throw new AdminError('The state office keeps the glossary.', 403);
  const db = await getDb();
  const ml = str(input.ml, 120), en = str(input.en, 120);
  if (!ml || !en) throw new AdminError('Type the term in both Malayalam and English.');
  const clash = await db.select({ id: glossary.id }).from(glossary).where(eq(glossary.ml, ml)).get();
  if (clash && clash.id !== id) throw new AdminError('That Malayalam term is already in the glossary. Edit it instead.');
  if (id) await db.update(glossary).set({ ml, en, note: str(input.note, 200) || null, updatedBy: user.id, updatedAt: sql`(datetime('now'))` }).where(eq(glossary.id, id));
  else await db.insert(glossary).values({ ml, en, note: str(input.note, 200) || null, updatedBy: user.id });
  await audit(user, id ? 'update_term' : 'add_term', 'glossary', id, { summary: `${ml} → ${en}` });
}

export async function deleteTerm(user: AdminUser, id: number) {
  if (!isState(user)) throw new AdminError('The state office keeps the glossary.', 403);
  const db = await getDb();
  await db.delete(glossary).where(eq(glossary.id, id));
  await audit(user, 'delete_term', 'glossary', id, { summary: `Term ${id}` });
}

/** What the browser needs to draft English: on or off, the model, the glossary */
export async function aiForBrowser() {
  const [ai, terms] = await Promise.all([aiSettings(), listGlossary()]);
  return { ...ai, glossary: terms.map((t) => [t.ml, t.en] as [string, string]) };
}

export { siteDetails };
