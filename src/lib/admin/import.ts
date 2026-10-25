// The WordPress import (plan, sections 3 and 10; approved wireframe "Import"), for the super admin.
// The browser reads the WordPress export (WXR .xml), maps its categories to a district and topic
// and sends the posts here 25 at a time; each run is an `import_jobs` row with a line per post.
// A post is matched by its old address first, then by its WordPress id (crawled posts keep it as
// their id), so running the same export twice updates instead of duplicating. A post changed in
// the admin since it came over is kept as it is: the import never overwrites an editor's work.
// Every write updates the search index and purges the pages that show the post.
import { and, desc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { getDb } from '~/db/client';
import { importJobs, media, posts, postTranslations, topics } from '~/db/schema';
import { districtBySlug } from '~/data/districts';
import { postEntry } from '~/lib/search-entries';
import { purgeTags, tags } from '~/lib/cache';
import { slugify } from '~/lib/slug';
import { cleanText, cutText, htmlParagraphs } from '~/lib/wp-map';
import { audit } from './audit';
import { AdminError, purge, setSearch } from './publish';
import type { AdminUser } from './roles';

type Db = Awaited<ReturnType<typeof getDb>>;
export const BATCH = 25;

/** One post as the browser sends it, already mapped */
export interface ImportItem {
  wpId: number;
  link: string;
  title: string;
  html: string;
  /** YYYY-MM-DD, the date WordPress shows */
  date: string;
  status: 'published' | 'draft';
  topic: string;
  district: string | null;
  cover?: { url: string; alt?: string } | null;
}

export type Outcome = 'created' | 'updated' | 'kept' | 'skipped' | 'failed';
export interface ItemResult { wpId: number; title: string; outcome: Outcome; note: string; id?: number }

export const mayImport = (u: AdminUser) => u.role === 'super_admin';
const mustImport = (u: AdminUser) => { if (!mayImport(u)) throw new AdminError('Only the super admin can import.', 403); };

function clean(raw: unknown): ImportItem | string {
  const r = (raw ?? {}) as Record<string, unknown>;
  const wpId = Number(r.wpId);
  const title = cleanText(String(r.title ?? '')).slice(0, 300);
  const date = String(r.date ?? '').slice(0, 10);
  if (!Number.isInteger(wpId) || wpId <= 0) return 'no WordPress id';
  if (!title) return 'no title';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'no date';
  const district = r.district ? String(r.district) : null;
  if (district && !districtBySlug[district]) return `unknown district “${district}”`;
  const cover = r.cover && typeof r.cover === 'object' ? (r.cover as Record<string, unknown>) : null;
  const coverUrl = cover && /^https?:\/\//.test(String(cover.url)) ? String(cover.url).slice(0, 1000) : null;
  return {
    wpId, title, date, district,
    link: /^https?:\/\//.test(String(r.link ?? '')) ? decodeURI(String(r.link)).slice(0, 1000) : '',
    html: String(r.html ?? '').slice(0, 400_000),
    status: r.status === 'draft' ? 'draft' : 'published',
    topic: String(r.topic ?? 'organisation'),
    cover: coverUrl ? { url: coverUrl, alt: cleanText(String(cover!.alt ?? '')).slice(0, 300) || undefined } : null,
  };
}

/** The post this item is: same old address, or the same WordPress id on a post that came from WordPress */
async function existing(db: Db, item: ImportItem) {
  const cols = { id: posts.id, slug: posts.slug, legacyUrl: posts.legacyUrl, createdBy: posts.createdBy, updatedBy: posts.updatedBy, coverMediaId: posts.coverMediaId };
  if (item.link) {
    const byUrl = await db.select(cols).from(posts).where(eq(posts.legacyUrl, item.link)).get();
    if (byUrl) return byUrl;
  }
  return (await db.select(cols).from(posts).where(and(eq(posts.id, item.wpId), isNull(posts.createdBy))).get()) ?? null;
}

async function freeSlug(db: Db, base: string, year: string, id: number | null) {
  for (let n = 1, slug = base; ; slug = `${base}-${++n}`) {
    const taken = await db.select({ id: posts.id }).from(posts).where(and(eq(posts.slug, slug), sql`substr(${posts.publishedAt}, 1, 4) = ${year}`)).get();
    if (!taken || taken.id === id) return slug;
  }
}

async function topicSet(db: Db) {
  return new Set((await db.select({ slug: topics.slug }).from(topics)).map((t) => t.slug));
}

/** The dry run: what would happen to each of these posts, and what looks wrong, writing nothing */
export async function checkItems(user: AdminUser, raw: unknown[]) {
  mustImport(user);
  const db = await getDb();
  const known = await topicSet(db);
  const out: (ItemResult & { problems: string[]; paragraphs: number })[] = [];
  for (const r of raw.slice(0, 50)) {
    const item = clean(r);
    if (typeof item === 'string') { out.push({ wpId: Number((r as { wpId?: unknown })?.wpId) || 0, title: String((r as { title?: unknown })?.title ?? ''), outcome: 'skipped', note: item, problems: [item], paragraphs: 0 }); continue; }
    const problems: string[] = [];
    const body = htmlParagraphs(item.html);
    if (!body.length) problems.push('no text');
    if (!known.has(item.topic)) problems.push(`unknown topic “${item.topic}”`);
    if (!item.link) problems.push('no old address (no redirect possible)');
    if (/<img/i.test(item.html)) problems.push('photos inside the text are left out; only the featured photo comes over');
    const was = await existing(db, item);
    const outcome: Outcome = was && (was.createdBy || was.updatedBy) ? 'kept' : was ? 'updated' : 'created';
    out.push({ wpId: item.wpId, title: item.title, outcome, note: outcome === 'kept' ? 'changed in the admin; kept as it is' : outcome === 'updated' ? `post ${was!.id} updated` : 'new post', problems, paragraphs: body.length, id: was?.id });
  }
  return out;
}

export async function startJob(user: AdminUser, fileName: string, total: number) {
  mustImport(user);
  const db = await getDb();
  const running = await db.select({ id: importJobs.id }).from(importJobs).where(and(eq(importJobs.status, 'running'), sql`${importJobs.createdAt} > datetime('now', '-30 minutes')`)).get();
  if (running) throw new AdminError('Another import is running. Wait for it to finish.', 409);
  const row = await db.insert(importJobs).values({ source: 'wxr', fileName: fileName.slice(0, 200), startedBy: user.id, counts: { total, created: 0, updated: 0, kept: 0, skipped: 0, failed: 0 }, log: '' }).returning({ id: importJobs.id }).get();
  return row.id;
}

async function job(db: Db, id: number) {
  const j = await db.select().from(importJobs).where(eq(importJobs.id, id)).get();
  if (!j) throw new AdminError('This import no longer exists.', 404);
  if (j.status !== 'running') throw new AdminError('This import has already finished.', 409);
  return j;
}

/** One batch of up to 25 posts */
export async function importBatch(user: AdminUser, jobId: number, raw: unknown[]) {
  mustImport(user);
  if (raw.length > BATCH) throw new AdminError(`At most ${BATCH} posts at a time.`);
  const db = await getDb();
  const j = await job(db, jobId);
  const known = await topicSet(db);
  const results: ItemResult[] = [];
  const touched: number[] = [];

  for (const r of raw) {
    const item = clean(r);
    if (typeof item === 'string') { results.push({ wpId: Number((r as { wpId?: unknown })?.wpId) || 0, title: '', outcome: 'skipped', note: item }); continue; }
    try {
      if (!known.has(item.topic)) item.topic = 'organisation';
      const was = await existing(db, item);
      if (was && (was.createdBy || was.updatedBy)) { results.push({ wpId: item.wpId, title: item.title, outcome: 'kept', note: 'changed in the admin; kept as it is', id: was.id }); continue; }
      const body = htmlParagraphs(item.html);
      const summary = cutText(body.join(' '), 220);
      const year = item.date.slice(0, 4);
      const slug = was?.slug ?? (await freeSlug(db, slugify(item.title) || `post-${item.wpId}`, year, null));

      let cover = was?.coverMediaId ?? null;
      if (item.cover && !cover) {
        const same = await db.select({ id: media.id }).from(media).where(eq(media.sourceUrl, item.cover.url)).get();
        cover = same?.id ?? (await db.insert(media).values({ kind: 'image', sourceUrl: item.cover.url, altMl: item.cover.alt ?? item.title, uploadedBy: user.id }).returning({ id: media.id }).get()).id;
      }

      const fields = { slug, topic: item.topic, district: item.district, status: item.status, publishedAt: item.date, coverMediaId: cover, legacyUrl: item.link || null };
      let id: number;
      if (was) {
        id = was.id;
        await db.update(posts).set({ ...fields, updatedAt: sql`(datetime('now'))` }).where(eq(posts.id, id));
      } else {
        // Keep the WordPress id when it's free, so old "?p=123" links still find the post
        const idTaken = await db.select({ id: posts.id }).from(posts).where(eq(posts.id, item.wpId)).get();
        id = (await db.insert(posts).values({ ...(idTaken ? {} : { id: item.wpId }), ...fields }).returning({ id: posts.id }).get()).id;
      }
      const ml = { title: item.title, summary, body: body.length ? body : null, source: 'human' as const };
      await db.insert(postTranslations).values({ postId: id, lang: 'ml', ...ml }).onConflictDoUpdate({ target: [postTranslations.postId, postTranslations.lang], set: ml });

      await setSearch('news', id, item.status === 'published'
        ? postEntry({ slug, date: item.date, topic: item.topic, district: item.district, title: { ml: item.title }, summary: { ml: summary }, body: { ml: body } })
        : null);
      touched.push(id);
      results.push({ wpId: item.wpId, title: item.title, outcome: was ? 'updated' : 'created', note: `${item.status === 'draft' ? 'draft ' : ''}/news/${year}/${slug}`, id });
    } catch (err) {
      console.error(err);
      results.push({ wpId: item.wpId, title: item.title, outcome: 'failed', note: 'could not be saved' });
    }
  }

  const counts = { ...(j.counts ?? {}) };
  for (const r of results) counts[r.outcome] = (counts[r.outcome] ?? 0) + 1;
  const lines = results.map((r) => `${r.outcome}\t${r.wpId}\t${r.id ?? ''}\t${r.title.replace(/\s+/g, ' ')}\t${r.note}\n`).join('');
  await db.update(importJobs).set({ counts, log: sql`coalesce(${importJobs.log}, '') || ${lines}`, updatedAt: sql`(datetime('now'))` }).where(eq(importJobs.id, jobId));
  if (touched.length) await purge([...new Set(touched.flatMap((id) => purgeTags.post(id)))]);
  return { results, counts };
}

export async function finishJob(user: AdminUser, jobId: number, failed = false) {
  mustImport(user);
  const db = await getDb();
  const j = await job(db, jobId);
  await db.update(importJobs).set({ status: failed ? 'failed' : 'done', updatedAt: sql`(datetime('now'))` }).where(eq(importJobs.id, jobId));
  await purge([tags.posts]);
  const c = j.counts ?? {};
  await audit(user, 'import', 'import', jobId, { summary: `${j.fileName ?? 'WordPress export'}: ${c.created ?? 0} new, ${c.updated ?? 0} updated, ${c.kept ?? 0} kept` });
  return { counts: c };
}

export async function listJobs(user: AdminUser) {
  mustImport(user);
  const db = await getDb();
  const [jobs, crawled] = await Promise.all([
    db.select({ id: importJobs.id, source: importJobs.source, status: importJobs.status, fileName: importJobs.fileName, counts: importJobs.counts, createdAt: importJobs.createdAt })
      .from(importJobs).orderBy(desc(importJobs.id)).limit(20),
    db.select({ n: sql<number>`count(*)` }).from(posts).where(and(isNull(posts.createdBy), isNotNull(posts.legacyUrl))).get(),
  ]);
  return { jobs, crawled: crawled?.n ?? 0 };
}

/** A run's lines, for its report and CSV */
export async function jobLog(user: AdminUser, jobId: number) {
  mustImport(user);
  const db = await getDb();
  const j = await db.select().from(importJobs).where(eq(importJobs.id, jobId)).get();
  if (!j) return null;
  const rows = (j.log ?? '').split('\n').filter(Boolean).map((l) => { const [outcome, wpId, id, title, note] = l.split('\t'); return { outcome: outcome as Outcome, wpId, id, title, note }; });
  return { job: j, rows };
}

/** Which of these WordPress ids are already on the site, for the scan's "already here" count */
export async function alreadyHere(user: AdminUser, ids: number[], links: string[]) {
  mustImport(user);
  const db = await getDb();
  let n = 0;
  for (let i = 0; i < Math.max(ids.length, links.length); i += 90) {
    const idPart = ids.slice(i, i + 90), linkPart = links.slice(i, i + 90);
    const rows = await db.select({ id: posts.id }).from(posts)
      .where(or(idPart.length ? and(inArray(posts.id, idPart), isNull(posts.createdBy)) : undefined, linkPart.length ? inArray(posts.legacyUrl, linkPart) : undefined));
    n += rows.length;
  }
  return n;
}
