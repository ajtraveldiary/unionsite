// Kerala Service in the admin (plan, sections 10 and 11; approved wireframe "Kerala Service").
// Only the state office manages issues. The month's PDF is uploaded; its cover is drawn from page
// 1 in the browser (src/lib/admin/pdf-read.ts); year and month are guessed from the file name and
// checked by the editor; a few contents lines are optional. Replacing a PDF keeps the issue's
// address (/kerala-service/{year}/{month}), so shared links keep working.
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { getDb } from '~/db/client';
import { magazineIssues, media, revisions, users } from '~/db/schema';
import { purgeTags } from '~/lib/cache';
import { fileUrl } from '~/lib/content';
import { audit } from './audit';
import { AdminError, purge } from './publish';
import { isState, type AdminUser } from './roles';

export type IssueStatus = 'draft' | 'published';
export interface TocLine { title: string; author?: string; page?: number }

export interface IssueRow {
  id: number;
  year: number;
  month: number;
  status: IssueStatus;
  pdfMediaId: number | null;
  coverMediaId: number | null;
  pageCount: number | null;
  toc: TocLine[];
  pdfUrl: string | null;
  coverUrl: string | null;
  pdfBytes: number | null;
  updatedAt: string;
  updatedBy: string | null;
}

export function mustBeState(user: AdminUser) {
  if (!isState(user)) throw new AdminError('Kerala Service is managed by the state office.', 403);
}

const pdf = alias(media, 'pdf');
type Db = Awaited<ReturnType<typeof getDb>>;
const select = (db: Db) => db
  .select({
    id: magazineIssues.id, year: magazineIssues.year, month: magazineIssues.month, status: magazineIssues.status,
    pdfMediaId: magazineIssues.pdfMediaId, coverMediaId: magazineIssues.coverMediaId, pageCount: magazineIssues.pageCount, toc: magazineIssues.toc,
    pdfR2: pdf.r2Key, pdfSrc: pdf.sourceUrl, pdfBytes: pdf.bytes, coverR2: media.r2Key, coverSrc: media.sourceUrl,
    updatedAt: magazineIssues.updatedAt, updatedBy: users.name,
  })
  .from(magazineIssues)
  .leftJoin(pdf, eq(pdf.id, magazineIssues.pdfMediaId))
  .leftJoin(media, eq(media.id, magazineIssues.coverMediaId))
  .leftJoin(users, eq(users.id, magazineIssues.updatedBy))
  .$dynamic();
type Raw = NonNullable<Awaited<ReturnType<ReturnType<typeof select>['get']>>>;
const toRow = ({ pdfR2, pdfSrc, coverR2, coverSrc, toc, ...r }: Raw): IssueRow => ({
  ...r, toc: toc ?? [], pdfUrl: fileUrl(pdfR2, pdfSrc) ?? null, coverUrl: fileUrl(coverR2, coverSrc) ?? null,
});

/** The newest issues (drafts included), for the screen's grid */
export async function recentIssues(user: AdminUser, limit = 18) {
  mustBeState(user);
  const rows = await select(await getDb()).orderBy(desc(magazineIssues.year), desc(magazineIssues.month)).limit(limit);
  return rows.map(toRow);
}

export async function loadIssue(user: AdminUser, id: number) {
  mustBeState(user);
  const r = await select(await getDb()).where(eq(magazineIssues.id, id)).get();
  return r ? toRow(r) : null;
}

const int = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export function cleanToc(lines: unknown): TocLine[] {
  if (!Array.isArray(lines)) return [];
  return lines
    .map((l) => (l && typeof l === 'object' ? (l as Record<string, unknown>) : {}))
    .map((l) => ({
      title: String(l.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 200),
      author: String(l.author ?? '').replace(/\s+/g, ' ').trim().slice(0, 120) || undefined,
      page: int(l.page) ?? undefined,
    }))
    .filter((l) => l.title)
    .slice(0, 60);
}

interface IssueInput {
  year: unknown;
  month: unknown;
  pdfMediaId?: unknown;
  coverMediaId?: unknown;
  pageCount?: unknown;
  toc?: unknown;
}

/**
 * Adds an issue, or saves an existing one. Publishing needs the PDF. Only one issue per month:
 * a second upload for the same month is refused, so the editor replaces that issue's PDF instead.
 */
export async function saveIssue(user: AdminUser, id: number | null, input: IssueInput, status?: IssueStatus) {
  mustBeState(user);
  const db = await getDb();
  const prev = id ? await loadIssue(user, id) : null;
  if (id && !prev) throw new AdminError('This issue could not be found.', 404);
  const year = int(input.year);
  const month = int(input.month);
  const thisYear = new Date().getFullYear();
  if (!year || year < 2000 || year > thisYear + 1) throw new AdminError('Pick the year.');
  if (!month || month > 12) throw new AdminError('Pick the month.');
  const taken = await db.select({ id: magazineIssues.id }).from(magazineIssues)
    .where(and(eq(magazineIssues.year, year), eq(magazineIssues.month, month), id ? ne(magazineIssues.id, id) : undefined)).get();
  if (taken) throw new AdminError('There is already an issue for that month. Open it and replace its PDF instead.');
  const pdfMediaId = input.pdfMediaId === undefined ? prev?.pdfMediaId ?? null : int(input.pdfMediaId);
  const next: IssueStatus = status ?? prev?.status ?? 'draft';
  if (next === 'published' && !pdfMediaId) throw new AdminError('Upload the PDF before publishing.');
  const values = {
    year, month, status: next, pdfMediaId,
    coverMediaId: input.coverMediaId === undefined ? prev?.coverMediaId ?? null : int(input.coverMediaId),
    pageCount: input.pageCount === undefined ? prev?.pageCount ?? null : int(input.pageCount),
    toc: input.toc === undefined ? prev?.toc ?? [] : cleanToc(input.toc),
    updatedBy: user.id, updatedAt: sql`(datetime('now'))`,
  };
  let issueId = id;
  if (issueId) await db.update(magazineIssues).set(values).where(eq(magazineIssues.id, issueId));
  else issueId = (await db.insert(magazineIssues).values({ ...values, createdBy: user.id }).returning({ id: magazineIssues.id }).get()).id;
  if (next === 'published') await db.insert(revisions).values({ entity: 'issue', entityId: issueId, doc: values, note: prev?.status === 'published' ? 'Updated' : 'Published', userId: user.id });
  if (next === 'published' || prev?.status === 'published') await purge(purgeTags.issue());
  const label = `Kerala Service ${year}-${String(month).padStart(2, '0')}`;
  const diff: Record<string, [unknown, unknown]> = {};
  if (prev) {
    if (prev.year !== year || prev.month !== month) diff.month = [`${prev.year}-${prev.month}`, `${year}-${month}`];
    if (prev.pdfMediaId !== pdfMediaId) diff.pdf = [prev.pdfMediaId, pdfMediaId];
    if (prev.status !== next) diff.status = [prev.status, next];
  }
  await audit(user, !prev ? (next === 'published' ? 'publish' : 'create') : prev.status !== next ? (next === 'published' ? 'publish' : 'unpublish') : 'update', 'issue', issueId, { summary: label, diff });
  return issueId;
}

/** Month names for forms */
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
