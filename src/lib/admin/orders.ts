// Government orders in the admin (plan, sections 10 and 11; approved wireframe "Orders upload").
// Only the state office (super admin, state editors) manages them. The browser reads each PDF's
// text, page count, GO number and date (src/lib/admin/pdf-read.ts); the editor checks them and
// picks the subject. Duplicates are caught by GO number and by the file itself. Publishing
// writes the order's search entry (its PDF text included) and purges the Orders pages.
import { and, count, desc, eq, like, ne, or, sql } from 'drizzle-orm';
import { getDb } from '~/db/client';
import { media, orders, revisions, users } from '~/db/schema';
import { orderEntry } from '~/lib/search-entries';
import { purgeTags } from '~/lib/cache';
import { slugify } from '~/lib/slug';
import { goCore } from '~/lib/search';
import { fileUrl } from '~/lib/content';
import { subjectBySlug } from '~/data/orders';
import { audit } from './audit';
import { AdminError, purge, setSearch, todayIst } from './publish';
import { isState, type AdminUser } from './roles';

export type OrderStatus = 'draft' | 'published' | 'archived';
export type OrderGroup = 'govt' | 'nps' | 'pension';

/** The order form's fields */
export interface OrderDoc {
  goNumber: string;
  /** ISO date of the GO */
  goDate: string;
  department: string;
  subject: string;
  /** The title as printed (usually English); shown on both sites unless a Malayalam one is given */
  title: string;
  titleMl: string;
  summaryMl: string;
  summaryEn: string;
  important: boolean;
  pdfMediaId: number | null;
  pageCount: number | null;
  /** Text read from the PDF, for search; empty for scanned PDFs */
  pdfText: string;
}

export interface OrderRow extends OrderDoc {
  id: number;
  slug: string;
  status: OrderStatus;
  group: OrderGroup;
  pdfUrl: string | null;
  pdfBytes: number | null;
  updatedAt: string;
  updatedBy: string | null;
  legacyUrl: string | null;
}

export function mustBeState(user: AdminUser) {
  if (!isState(user)) throw new AdminError('Orders are managed by the state office.', 403);
}

const columns = {
  id: orders.id, slug: orders.slug, status: orders.status, group: orders.group, goNumber: orders.goNumber, goDate: orders.goDate,
  department: orders.department, subject: orders.subject, titleEn: orders.titleEn, titleMl: orders.titleMl, summaryMl: orders.summaryMl,
  summaryEn: orders.summaryEn, important: orders.isImportant, pdfMediaId: orders.pdfMediaId, pageCount: orders.pageCount, pdfText: orders.pdfText,
  r2Key: media.r2Key, sourceUrl: media.sourceUrl, pdfBytes: media.bytes, updatedAt: orders.updatedAt, updatedBy: users.name, legacyUrl: orders.legacyUrl,
};
type Db = Awaited<ReturnType<typeof getDb>>;
const select = (db: Db) => db.select(columns).from(orders).leftJoin(media, eq(media.id, orders.pdfMediaId)).leftJoin(users, eq(users.id, orders.updatedBy)).$dynamic();
type Raw = NonNullable<Awaited<ReturnType<ReturnType<typeof select>['get']>>>;

const toRow = ({ titleEn, titleMl, r2Key, sourceUrl, ...r }: Raw): OrderRow => ({
  ...r,
  title: titleEn,
  titleMl: titleMl === titleEn ? '' : titleMl,
  department: r.department ?? '',
  summaryMl: r.summaryMl ?? '',
  summaryEn: r.summaryEn ?? '',
  pdfText: r.pdfText ?? '',
  pdfUrl: fileUrl(r2Key, sourceUrl) ?? null,
});

export interface OrderFilter {
  q?: string;
  group?: OrderGroup;
  subject?: string;
  status?: OrderStatus;
  offset?: number;
  limit?: number;
}

/** The admin's Orders list, newest GO first, 50 a page. Searches titles and GO numbers. */
export async function listOrders(user: AdminUser, f: OrderFilter) {
  mustBeState(user);
  const db = await getDb();
  const q = f.q?.trim();
  const where = and(
    f.status ? eq(orders.status, f.status) : ne(orders.status, 'archived'),
    f.group ? eq(orders.group, f.group) : undefined,
    f.subject ? eq(orders.subject, f.subject) : undefined,
    q ? or(like(orders.titleEn, `%${q}%`), like(orders.titleMl, `%${q}%`), like(orders.goNumber, `%${q}%`)) : undefined,
  );
  const [rows, total] = await Promise.all([
    select(db).where(where).orderBy(desc(orders.goDate), desc(orders.id)).limit(f.limit ?? 50).offset(f.offset ?? 0),
    db.select({ n: count() }).from(orders).where(where).get(),
  ]);
  return { rows: rows.map(toRow), total: total?.n ?? 0 };
}

export async function loadOrder(user: AdminUser, id: number) {
  mustBeState(user);
  const r = await select(await getDb()).where(eq(orders.id, id)).get();
  return r ? toRow(r) : null;
}

/**
 * Orders that look like the same GO: the same number ("116/2021" in "G.O.(P) No.116/2021/Fin"),
 * or the same PDF file. Checked as each file is read, before anything is saved.
 */
export async function findDuplicates(user: AdminUser, goNumber: string, pdfMediaId: number | null, exceptId?: number) {
  mustBeState(user);
  const db = await getDb();
  const core = goCore(goNumber);
  const matches: { id: number; goNumber: string; title: string; status: OrderStatus }[] = [];
  if (core) {
    // goNumber has an index; the LIKE narrows to rows holding the number, then goCore decides
    const rows = await db.select({ id: orders.id, goNumber: orders.goNumber, title: orders.titleEn, status: orders.status }).from(orders)
      .where(and(like(orders.goNumber, `%${core.split('/')[0]}%${core.split('/')[1]}%`), exceptId ? ne(orders.id, exceptId) : undefined)).limit(20);
    matches.push(...rows.filter((r) => goCore(r.goNumber) === core && sameKind(r.goNumber, goNumber)));
  }
  if (pdfMediaId) {
    const rows = await db.select({ id: orders.id, goNumber: orders.goNumber, title: orders.titleEn, status: orders.status }).from(orders)
      .where(and(eq(orders.pdfMediaId, pdfMediaId), exceptId ? ne(orders.id, exceptId) : undefined)).limit(5);
    for (const r of rows) if (!matches.some((m) => m.id === r.id)) matches.push(r);
  }
  return matches;
}

/** A circular and a GO can share a number; only the same kind counts as a duplicate */
const kindOf = (go: string) => (/circular/i.test(go) ? 'circular' : 'go');
const sameKind = (a: string, b: string) => kindOf(a) === kindOf(b);

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export function cleanOrder(input: Record<string, unknown>): OrderDoc {
  const title = str(input.title, 300);
  if (!title) throw new AdminError('Give the order a title.');
  const goDate = str(input.goDate, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(goDate)) throw new AdminError('Give the date of the order.');
  const subject = str(input.subject, 40);
  if (!subjectBySlug[subject]) throw new AdminError('Choose a subject.');
  const media = Number(input.pdfMediaId);
  const pages = Number(input.pageCount);
  return {
    goNumber: str(input.goNumber, 80),
    goDate,
    department: str(input.department, 120),
    subject,
    title,
    titleMl: str(input.titleMl, 300),
    summaryMl: str(input.summaryMl, 600),
    summaryEn: str(input.summaryEn, 600),
    important: input.important === true || input.important === 'on',
    pdfMediaId: Number.isInteger(media) && media > 0 ? media : null,
    pageCount: Number.isInteger(pages) && pages > 0 ? pages : null,
    // PDF text feeds search only; a long GO is kept to its first 60,000 characters
    pdfText: typeof input.pdfText === 'string' ? input.pdfText.replace(/\s+/g, ' ').trim().slice(0, 60_000) : '',
  };
}

async function syncOrder(db: Db, id: number) {
  const r = await select(db).where(eq(orders.id, id)).get();
  if (!r || r.status !== 'published') return setSearch('order', id, null);
  await setSearch('order', id, orderEntry({
    id: r.id, slug: r.slug, goNumber: r.goNumber, goDate: r.goDate, subject: r.subject, important: r.important, group: r.group,
    title: { ml: r.titleMl, en: r.titleEn },
    summary: r.summaryMl ? { ml: r.summaryMl, ...(r.summaryEn && { en: r.summaryEn }) } : undefined,
    pdfText: r.pdfText,
  }));
}

const values = (doc: OrderDoc, user: AdminUser) => ({
  goNumber: doc.goNumber, goDate: doc.goDate, dateIsUpload: false, department: doc.department || null,
  group: subjectBySlug[doc.subject].group, subject: doc.subject, titleEn: doc.title, titleMl: doc.titleMl || doc.title,
  summaryMl: doc.summaryMl || null, summaryEn: doc.summaryEn || null, isImportant: doc.important, pdfMediaId: doc.pdfMediaId,
  pageCount: doc.pageCount, pdfText: doc.pdfText || null, updatedBy: user.id, updatedAt: sql`(datetime('now'))`,
});

/** A new order, published or as a draft; the address is made from its title */
export async function createOrder(user: AdminUser, input: Record<string, unknown>, publish: boolean) {
  mustBeState(user);
  const db = await getDb();
  const doc = cleanOrder(input);
  if (publish && !doc.pdfMediaId) throw new AdminError('Upload the PDF before publishing.');
  const row = await db.insert(orders).values({ ...values(doc, user), slug: 'new', status: publish ? 'published' : 'draft', createdBy: user.id }).returning({ id: orders.id }).get();
  await db.update(orders).set({ slug: slugify(doc.title, 8) || `order-${row.id}` }).where(eq(orders.id, row.id));
  if (publish) {
    await db.insert(revisions).values({ entity: 'order', entityId: row.id, doc, note: 'Published', userId: user.id });
    await syncOrder(db, row.id);
    await purge(purgeTags.order(row.id));
  }
  await audit(user, publish ? 'publish' : 'create', 'order', row.id, { summary: `${doc.goNumber} ${doc.title}`.trim() });
  return row.id;
}

/** Saves changes; `status` publishes a draft, or archives or restores. The address keeps its id, so links never break. */
export async function updateOrder(user: AdminUser, id: number, input: Record<string, unknown>, status?: OrderStatus) {
  const prev = await loadOrder(user, id);
  if (!prev) throw new AdminError('This order could not be found.', 404);
  const db = await getDb();
  // Fields the form doesn't send (the PDF's text, unless a new PDF came) stay as they are
  const doc = cleanOrder({ ...prev, ...input });
  const next = status ?? prev.status;
  if (next === 'published' && !doc.pdfMediaId) throw new AdminError('Upload the PDF before publishing.');
  await db.update(orders).set({ ...values(doc, user), status: next, slug: slugify(doc.title, 8) || prev.slug }).where(eq(orders.id, id));
  if (next === 'published') await db.insert(revisions).values({ entity: 'order', entityId: id, doc, note: prev.status === 'published' ? 'Updated' : 'Published', userId: user.id });
  if (next === 'published' || prev.status === 'published') {
    await syncOrder(db, id);
    await purge(purgeTags.order(id));
  }
  const diff: Record<string, [unknown, unknown]> = {};
  for (const k of ['goNumber', 'goDate', 'subject', 'title', 'important', 'pdfMediaId'] as const) if (prev[k] !== doc[k]) diff[k] = [prev[k], doc[k]];
  if (prev.status !== next) diff.status = [prev.status, next];
  const action = prev.status !== next ? (next === 'published' ? 'publish' : next === 'archived' ? 'archive' : 'unpublish') : 'update';
  await audit(user, action, 'order', id, { summary: `${doc.goNumber} ${doc.title}`.trim(), diff });
}

/** Archive or bring back without touching the details */
export async function setOrderStatus(user: AdminUser, id: number, status: OrderStatus) {
  const prev = await loadOrder(user, id);
  if (!prev) throw new AdminError('This order could not be found.', 404);
  return updateOrder(user, id, {}, status);
}

/** What the Orders library shows by default for a new order's date: today, India time */
export const defaultDate = todayIst;
