// Pages, documents and conferences in the admin (plan, sections 5 and 10; approved wireframe
// "Pages & documents"). Pages are the About pages (History, Struggles …) and each district's
// history, written in the same rich-text editor as posts, Malayalam first; English shows on the
// site only once approved. Documents are the organisation's PDFs (Bye-Law, resolutions, jubilee
// volumes); a new version replaces the file and keeps the address. Conferences list the state
// conferences behind the timeline. The state office manages all of it; district admins write
// their own district's history (district editors save drafts of it).
import { and, asc, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import { getDb } from '~/db/client';
import { albums, conferences, documents, events, media, pages, revisions, users } from '~/db/schema';
import { purgeTags } from '~/lib/cache';
import { slugify } from '~/lib/slug';
import { fileUrl } from '~/lib/content';
import { isRich, toRichDoc, type RichDoc } from '~/lib/richtext';
import { districtBySlug } from '~/data/districts';
import { audit } from './audit';
import { emptyBody, textHash } from './post-doc';
import { AdminError, purge } from './publish';
import { isState, type AdminUser } from './roles';

type EnSource = 'human' | 'ai_draft' | 'ai_reviewed';

export function mustBeState(user: AdminUser) {
  if (!isState(user)) throw new AdminError('The About pages and documents are managed by the state office.', 403);
}

/** About pages the plan names, offered when adding a page */
export const ABOUT_PAGES = [
  { slug: 'history', title: 'ചരിത്രം', titleEn: 'History', template: 'history' as const },
  { slug: 'struggles', title: 'പ്രക്ഷോഭങ്ങൾ', titleEn: 'Struggles', template: 'default' as const },
  { slug: 'fseto', title: 'എഫ്.എസ്.ഇ.ടി.ഒ', titleEn: 'FSETO', template: 'default' as const },
];

// ── Pages ───────────────────────────────────────────────────────────────────────────────

export interface PageRow {
  id: number;
  path: string;
  template: 'default' | 'history' | 'district_history';
  district: string | null;
  titleMl: string;
  titleEn: string;
  summaryMl: string;
  summaryEn: string;
  bodyMl: RichDoc;
  bodyEn: RichDoc | null;
  enSource: EnSource | null;
  enBasedOn: string | null;
  status: 'draft' | 'published' | 'archived';
  updatedAt: string;
  updatedBy: string | null;
}

const mayEdit = (user: AdminUser, p: { template: string; district: string | null }) =>
  isState(user) || (p.template === 'district_history' && !!p.district && p.district === user.district);
const mayPublish = (user: AdminUser, p: { template: string; district: string | null }) => mayEdit(user, p) && user.role !== 'district_editor';

export async function listPages(user: AdminUser) {
  const db = await getDb();
  return db.select({ id: pages.id, path: pages.path, template: pages.template, district: pages.district, titleMl: pages.titleMl, titleEn: pages.titleEn, status: pages.status, enSource: pages.enSource, updatedAt: pages.updatedAt })
    .from(pages)
    .where(isState(user) ? ne(pages.status, 'archived') : and(eq(pages.template, 'district_history'), eq(pages.district, user.district ?? '')))
    .orderBy(asc(pages.template), asc(pages.path));
}

export async function loadPage(user: AdminUser, id: number): Promise<PageRow | null> {
  const db = await getDb();
  const r = await db.select({ ...pageColumns, updatedBy: users.name }).from(pages).leftJoin(users, eq(users.id, pages.updatedBy)).where(eq(pages.id, id)).get();
  if (!r || !mayEdit(user, r)) return null;
  return {
    ...r, titleEn: r.titleEn ?? '', summaryMl: r.summaryMl ?? '', summaryEn: r.summaryEn ?? '',
    bodyMl: toRichDoc(r.bodyMl), bodyEn: r.bodyEn ? toRichDoc(r.bodyEn) : null,
  };
}
const pageColumns = {
  id: pages.id, path: pages.path, template: pages.template, district: pages.district, titleMl: pages.titleMl, titleEn: pages.titleEn,
  summaryMl: pages.summaryMl, summaryEn: pages.summaryEn, bodyMl: pages.bodyMl, bodyEn: pages.bodyEn, enSource: pages.enSource,
  enBasedOn: pages.enBasedOn, status: pages.status, updatedAt: pages.updatedAt,
};

/** A new About page (one of ABOUT_PAGES, or another name) or a district's history page */
export async function createPage(user: AdminUser, input: Record<string, unknown>) {
  const db = await getDb();
  let path: string, template: PageRow['template'], district: string | null = null, titleMl: string, titleEn: string | null = null;
  if (input.kind === 'district_history') {
    district = String(input.district ?? '');
    if (!districtBySlug[district]) throw new AdminError('Unknown district.');
    if (!mayEdit(user, { template: 'district_history', district })) throw new AdminError('You can only write your own district’s history.', 403);
    path = `/districts/${district}/history`;
    template = 'district_history';
    titleMl = `${districtBySlug[district].name.ml} ജില്ലാ കമ്മിറ്റിയുടെ ചരിത്രം`;
    titleEn = `History of the ${districtBySlug[district].name.en} district committee`;
  } else {
    mustBeState(user);
    const known = ABOUT_PAGES.find((p) => p.slug === input.slug);
    const slug = known?.slug ?? (slugify(String(input.title ?? ''), 5) || '');
    if (!slug) throw new AdminError('Give the page a name.');
    path = `/about/${slug}`;
    template = known?.template ?? 'default';
    titleMl = known?.title ?? String(input.title ?? '').trim().slice(0, 200);
    titleEn = known?.titleEn ?? null;
  }
  const taken = await db.select({ id: pages.id }).from(pages).where(eq(pages.path, path)).get();
  if (taken) return taken.id;
  const row = await db.insert(pages).values({ path, template, district, titleMl, titleEn, bodyMl: emptyBody(), status: 'draft', createdBy: user.id, updatedBy: user.id }).returning({ id: pages.id }).get();
  await audit(user, 'create', 'page', row.id, { district, summary: titleMl });
  return row.id;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const body = (v: unknown): RichDoc | null => (isRich(v as RichDoc) && JSON.stringify(v).length < 600_000 ? (v as RichDoc) : null);

export type PageAction = 'save' | 'publish' | 'unpublish' | 'approve_english';

/**
 * Saves the page (the editor sends all of it). `publish` puts it live, `unpublish` takes it back to
 * draft. English edits make the English a draft again unless `approve_english` (by someone allowed).
 */
export async function savePage(user: AdminUser, id: number, input: Record<string, unknown>, action: PageAction) {
  const db = await getDb();
  const prev = await loadPage(user, id);
  if (!prev) throw new AdminError('This page could not be found.', 404);
  if (user.role === 'district_editor' && prev.status === 'published') throw new AdminError('Your district admin changes the history once it is on the site.', 403);
  if ((action === 'publish' || action === 'unpublish' || action === 'approve_english') && !mayPublish(user, prev)) throw new AdminError('Your district admin publishes it.', 403);
  const ml = { title: str(input.titleMl, 200), summary: str(input.summaryMl, 600), body: body(input.bodyMl) ?? prev.bodyMl };
  if (!ml.title) throw new AdminError('Give the page a title in Malayalam.');
  const enBody = body(input.bodyEn);
  const en = { title: str(input.titleEn, 200), summary: str(input.summaryEn, 600), body: enBody ?? emptyBody() };
  const hasEn = !!en.title;
  const sameEn = hasEn && prev.titleEn === en.title && prev.summaryEn === en.summary && JSON.stringify(prev.bodyEn ?? emptyBody()) === JSON.stringify(en.body);
  let enSource: EnSource | null = hasEn ? (sameEn && prev.enSource ? prev.enSource : 'ai_draft') : null;
  let enBasedOn = hasEn ? (typeof input.enBasedOn === 'string' ? input.enBasedOn.slice(0, 16) : prev.enBasedOn) : null;
  if (action === 'approve_english') {
    if (!hasEn) throw new AdminError('There is no English to approve yet.');
    enSource = 'ai_reviewed';
    enBasedOn = textHash(ml);
  }
  const status = action === 'publish' ? 'published' : action === 'unpublish' ? 'draft' : prev.status;
  await db.update(pages).set({
    titleMl: ml.title, summaryMl: ml.summary || null, bodyMl: ml.body, titleEn: hasEn ? en.title : null, summaryEn: hasEn ? en.summary || null : null,
    bodyEn: hasEn ? en.body : null, enSource, enBasedOn, status, updatedBy: user.id, updatedAt: sql`(datetime('now'))`,
  }).where(eq(pages.id, id));
  if (status === 'published') await db.insert(revisions).values({ entity: 'page', entityId: id, doc: { ml, en: hasEn ? en : null }, note: action === 'publish' && prev.status !== 'published' ? 'Published' : 'Updated', userId: user.id });
  if (status === 'published' || prev.status === 'published') await purge(purgeTags.pages());
  await audit(user, action === 'save' ? 'update' : action, 'page', id, { district: prev.district, summary: ml.title });
  return { status, enSource };
}

// ── Documents ───────────────────────────────────────────────────────────────────────────

export const DOC_KINDS = { bye_law: 'Bye-Law', resolution: 'Resolution', jubilee: 'Jubilee', other: 'Other' } as const;
export type DocKind = keyof typeof DOC_KINDS;

export async function listDocuments(user: AdminUser) {
  mustBeState(user);
  const db = await getDb();
  return db.select({ id: documents.id, slug: documents.slug, kind: documents.kind, year: documents.year, titleMl: documents.titleMl, titleEn: documents.titleEn, status: documents.status, pdfMediaId: documents.pdfMediaId, pageCount: documents.pageCount, summaryMl: documents.summaryMl, r2Key: media.r2Key, src: media.sourceUrl })
    .from(documents).leftJoin(media, eq(media.id, documents.pdfMediaId))
    .where(ne(documents.status, 'archived')).orderBy(asc(documents.kind), desc(documents.year))
    .then((rows) => rows.map(({ r2Key, src, ...r }) => ({ ...r, pdfUrl: fileUrl(r2Key, src) ?? null })));
}

export async function saveDocument(user: AdminUser, id: number | null, input: Record<string, unknown>, status?: 'draft' | 'published' | 'archived') {
  mustBeState(user);
  const db = await getDb();
  const titleMl = str(input.titleMl, 200);
  if (!titleMl) throw new AdminError('Give the document a title in Malayalam.');
  const kind = (Object.keys(DOC_KINDS) as DocKind[]).find((k) => k === input.kind) ?? 'other';
  const year = Number(input.year);
  const pdf = Number(input.pdfMediaId);
  const pages_ = Number(input.pageCount);
  const values = {
    titleMl, titleEn: str(input.titleEn, 200) || null, kind, year: Number.isInteger(year) && year > 1900 && year < 2100 ? year : null,
    summaryMl: str(input.summaryMl, 1000) || null, pdfMediaId: Number.isInteger(pdf) && pdf > 0 ? pdf : null,
    pageCount: Number.isInteger(pages_) && pages_ > 0 ? pages_ : null, updatedBy: user.id, updatedAt: sql`(datetime('now'))`,
  };
  const prev = id ? await db.select({ status: documents.status, pdf: documents.pdfMediaId }).from(documents).where(eq(documents.id, id)).get() : null;
  if (id && !prev) throw new AdminError('That document could not be found.', 404);
  const next = status ?? prev?.status ?? 'draft';
  if (next === 'published' && !values.pdfMediaId) throw new AdminError('Upload the PDF before publishing.');
  let docId = id;
  if (docId) await db.update(documents).set({ ...values, status: next }).where(eq(documents.id, docId));
  else {
    const base = slugify(values.titleEn || titleMl, 6) || `document-${Date.now()}`;
    let slug = base;
    for (let n = 2; await db.select({ id: documents.id }).from(documents).where(eq(documents.slug, slug)).get(); n++) slug = `${base}-${n}`;
    docId = (await db.insert(documents).values({ ...values, slug, status: next, createdBy: user.id }).returning({ id: documents.id }).get()).id;
  }
  // The old file stays in History when a new version replaces it
  if (prev?.pdf && prev.pdf !== values.pdfMediaId) await db.insert(revisions).values({ entity: 'document', entityId: docId, doc: { pdfMediaId: prev.pdf }, note: 'Earlier file', userId: user.id });
  if (next === 'published' || prev?.status === 'published') await purge(purgeTags.pages());
  await audit(user, !prev ? 'create' : prev.status !== next ? (next === 'published' ? 'publish' : next) : 'update', 'document', docId, { summary: titleMl });
  return docId;
}

// ── Conferences ─────────────────────────────────────────────────────────────────────────

export async function listConferences(user: AdminUser) {
  mustBeState(user);
  const db = await getDb();
  return db.select().from(conferences).orderBy(desc(conferences.number));
}

export async function conferenceChoices() {
  const db = await getDb();
  const [a, e] = await Promise.all([
    db.select({ id: albums.id, title: albums.titleMl }).from(albums).where(and(ne(albums.status, 'archived'), isNull(albums.district))).orderBy(desc(albums.id)).limit(60),
    db.select({ slug: events.slug, title: events.titleMl, start: events.startAt }).from(events).where(and(eq(events.status, 'published'), isNull(events.district))).orderBy(desc(events.startAt)).limit(60),
  ]);
  return { albums: a, events: e };
}

export async function saveConference(user: AdminUser, id: number | null, input: Record<string, unknown>) {
  mustBeState(user);
  const db = await getDb();
  const number = Number(input.number);
  if (!(Number.isInteger(number) && number > 0 && number < 500)) throw new AdminError('Give the conference’s number (1st, 2nd … 64th).');
  const taken = await db.select({ id: conferences.id }).from(conferences).where(and(eq(conferences.number, number), id ? ne(conferences.id, id) : undefined)).get();
  if (taken) throw new AdminError(`The ${number}${ord(number)} conference is already listed. Open it instead.`);
  const date = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const startDate = date(input.startDate), endDate = date(input.endDate);
  if (startDate && endDate && endDate < startDate) throw new AdminError('It must end on or after the day it starts.');
  const year = Number(input.year) || (startDate ? Number(startDate.slice(0, 4)) : null);
  const album = Number(input.albumId);
  const values = {
    number, year: year && year > 1900 ? year : null, startDate, endDate,
    placeMl: str(input.placeMl, 200) || null, placeEn: str(input.placeEn, 200) || null,
    reportMl: typeof input.reportMl === 'string' ? input.reportMl.replace(/\r\n/g, '\n').trim().slice(0, 8000) || null : null,
    albumId: Number.isInteger(album) && album > 0 ? album : null, eventSlug: str(input.eventSlug, 120) || null,
    status: input.status === 'draft' ? 'draft' as const : 'published' as const, updatedBy: user.id, updatedAt: sql`(datetime('now'))`,
  };
  let confId = id;
  if (confId) await db.update(conferences).set(values).where(eq(conferences.id, confId));
  else confId = (await db.insert(conferences).values(values).returning({ id: conferences.id }).get()).id;
  await purge(purgeTags.pages());
  await audit(user, id ? 'update' : 'create', 'conference', confId, { summary: `${number}${ord(number)} state conference` });
  return confId;
}

export const ord = (n: number) => (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');

