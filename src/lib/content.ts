// Content queries. Pages and components get content only from here. Posts, orders, Kerala Service
// issues and the home banner come from D1 (src/db/schema.ts), each query reading only what its
// page shows; events stay hand-written in src/data/site.ts until the admin panel manages them.
// The URL helpers at the top are plain functions and safe to use anywhere.
import { and, desc, eq, exists, isNotNull, ne, notInArray, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { getDb } from '~/db/client';
import { districts as districtsT, magazineIssues, media, orders as ordersT, posts as postsT, postTranslations, siteSettings } from '~/db/schema';
import { subjectBySlug } from '~/data/orders';
import { districts } from '~/data/districts';
import { events } from '~/data/site';
import type { Cover, L10n, Lang, MagazineIssue, Order, Post, UnionEvent } from './types';
import { href } from './i18n';

export const postPath = (p: Pick<Post, 'date' | 'slug'>) => `/news/${p.date.slice(0, 4)}/${p.slug}`;
export const postUrl = (p: Pick<Post, 'date' | 'slug'>, lang: Lang) => href(lang, postPath(p));
export const orderPath = (o: Pick<Order, 'id' | 'slug'>) => `/orders/${o.id}-${o.slug}`;
export const orderUrl = (o: Pick<Order, 'id' | 'slug'>, lang: Lang) => href(lang, orderPath(o));
export const issuePath = (year: number, month: number) => `/kerala-service/${year}/${String(month).padStart(2, '0')}`;
export const districtUrl = (slug: string, lang: Lang) => href(lang, `/districts/${slug}`);
export const subjectName = (slug: string) => subjectBySlug[slug]?.name;
export const sortedDistricts = () => [...districts].sort((a, b) => a.sortOrder - b.sortOrder);

/** Files in R2 are served from the media domain; crawled ones still from the old site */
const MEDIA_BASE = 'https://media.keralangounion.in';
const fileUrl = (r2Key: string | null, sourceUrl: string | null) => (r2Key ? `${MEDIA_BASE}/${r2Key}` : sourceUrl ?? undefined);

// ── Posts ────────────────────────────────────────────────────────────────────────────────

const ml = alias(postTranslations, 'ml');
const en = alias(postTranslations, 'en');

const postColumns = {
  id: postsT.id,
  slug: postsT.slug,
  date: postsT.publishedAt,
  topic: postsT.topic,
  district: postsT.district,
  featured: postsT.featuredOnHome,
  legacyUrl: postsT.legacyUrl,
  titleMl: ml.title,
  summaryMl: ml.summary,
  titleEn: en.title,
  summaryEn: en.summary,
  coverR2: media.r2Key,
  coverSrc: media.sourceUrl,
  coverSrcset: media.srcset,
  coverAltMl: media.altMl,
  coverAltEn: media.altEn,
};
type PostRow = { [K in keyof typeof postColumns]: (typeof postColumns)[K]['_']['data'] | null } & { bodyMl?: string[] | null; bodyEn?: string[] | null };

const l10n = (mlText: string | null, enText: string | null): L10n => ({ ml: mlText ?? '', ...(enText && { en: enText }) });

function toPost(r: PostRow): Post {
  const src = fileUrl(r.coverR2, r.coverSrc);
  const cover: Cover = src
    ? { kind: 'photo', src, ...(r.coverSrcset && { srcset: r.coverSrcset }), alt: l10n(r.coverAltMl, r.coverAltEn) }
    : { kind: 'none' };
  return {
    id: r.id!,
    slug: r.slug!,
    date: r.date!,
    topic: r.topic!,
    ...(r.district && { district: r.district }),
    title: l10n(r.titleMl, r.titleEn),
    summary: l10n(r.summaryMl, r.summaryEn),
    ...(r.bodyMl && { body: { ml: r.bodyMl, ...(r.bodyEn && { en: r.bodyEn }) } }),
    cover,
    ...(r.featured && { featured: true }),
    ...(r.legacyUrl && { legacyUrl: r.legacyUrl }),
  };
}

async function selectPosts(where: (SQL | undefined)[], opts: { limit?: number; body?: boolean } = {}) {
  const db = await getDb();
  const columns = opts.body ? { ...postColumns, bodyMl: ml.body, bodyEn: en.body } : postColumns;
  const query = db
    .select(columns)
    .from(postsT)
    .innerJoin(ml, and(eq(ml.postId, postsT.id), eq(ml.lang, 'ml')))
    .leftJoin(en, and(eq(en.postId, postsT.id), eq(en.lang, 'en')))
    .leftJoin(media, eq(media.id, postsT.coverMediaId))
    .where(and(eq(postsT.status, 'published'), ...where))
    .orderBy(desc(postsT.publishedAt), desc(postsT.id))
    .$dynamic();
  const rows = (await (opts.limit ? query.limit(opts.limit) : query)) as PostRow[];
  return rows.map(toPost);
}

interface PostFilter {
  limit: number;
  topic?: string;
  /** Leave out these topics */
  notTopics?: string[];
  district?: string;
  /** Leave out these posts (already shown higher up the page) */
  exclude?: number[];
}

/** The newest published posts, optionally narrowed; never the whole archive in one go */
export const latestPosts = (filter: PostFilter) => selectPosts(filterWhere(filter), { limit: filter.limit });

const filterWhere = ({ topic, notTopics, district, exclude }: PostFilter) => [
  topic ? eq(postsT.topic, topic) : undefined,
  notTopics?.length ? notInArray(postsT.topic, notTopics) : undefined,
  district ? eq(postsT.district, district) : undefined,
  exclude?.length ? notInArray(postsT.id, exclude) : undefined,
];

/** The newest post editors featured on the home page */
export const featuredPost = async () => (await selectPosts([eq(postsT.featuredOnHome, true)], { limit: 1 }))[0];

export const postById = async (id: number) => (await selectPosts([eq(postsT.id, id)], { limit: 1, body: true }))[0];

/** The post at /news/{year}/{slug}, with its body */
export const postByPath = async (year: string, slug: string) =>
  (await selectPosts([eq(postsT.slug, slug), sql`substr(${postsT.publishedAt}, 1, 4) = ${year}`], { limit: 1, body: true }))[0];

/** Newest posts on the same topic, then the newest others to make up `n` */
export async function relatedPosts(post: Post, n = 3) {
  const same = await latestPosts({ limit: n, topic: post.topic, exclude: [post.id] });
  if (same.length >= n) return same;
  return [...same, ...(await latestPosts({ limit: n - same.length, notTopics: [post.topic], exclude: [post.id] }))];
}

/** Every published post without its body, for the News page's index and site search */
export const postSummaries = () => selectPosts([]);

/** The newest `n` posts of every district, keyed by district slug. One small query per district,
 * each reading only its `n` rows through the index, run in parallel. (Not `db.batch`: it reads
 * rows by column name, and the two translation joins share names.) */
export async function latestPerDistrict(n: number, exclude?: number[]) {
  const lists = await Promise.all(sortedDistricts().map((d) => latestPosts({ limit: n, district: d.slug, exclude })));
  return Object.fromEntries(sortedDistricts().map((d, i) => [d.slug, lists[i]])) as Record<string, Post[]>;
}

/** How many published posts one district has (reads only that district's index entries) */
export async function districtPostCount(slug: string) {
  const db = await getDb();
  const row = await db
    .select({ n: sql<number>`count(*)` })
    .from(postsT)
    .where(and(eq(postsT.status, 'published'), eq(postsT.district, slug)))
    .get();
  return row?.n ?? 0;
}

/** Districts with at least one published post, for the map's tint: one index probe per district */
export async function districtsWithNews() {
  const db = await getDb();
  const has = db
    .select({ one: sql`1` })
    .from(postsT)
    .where(and(eq(postsT.status, 'published'), eq(postsT.district, districtsT.slug)));
  const rows = await db.select({ slug: districtsT.slug }).from(districtsT).where(exists(has));
  return rows.map((r) => r.slug);
}

/** How many published posts each district has (reads every district post's index entry) */
export async function districtPostCounts() {
  const db = await getDb();
  const rows = await db
    .select({ district: postsT.district, n: sql<number>`count(*)` })
    .from(postsT)
    .where(and(eq(postsT.status, 'published'), isNotNull(postsT.district)))
    .groupBy(postsT.district);
  return Object.fromEntries(rows.map((r) => [r.district!, r.n])) as Record<string, number>;
}

/** How many published posts each topic has (topics without posts are left out) */
export async function topicPostCounts() {
  const db = await getDb();
  const rows = await db
    .select({ topic: postsT.topic, n: sql<number>`count(*)` })
    .from(postsT)
    .where(eq(postsT.status, 'published'))
    .groupBy(postsT.topic);
  return Object.fromEntries(rows.map((r) => [r.topic, r.n])) as Record<string, number>;
}

// ── Orders ───────────────────────────────────────────────────────────────────────────────

const orderColumns = {
  id: ordersT.id,
  slug: ordersT.slug,
  goNumber: ordersT.goNumber,
  goDate: ordersT.goDate,
  dateIsUpload: ordersT.dateIsUpload,
  department: ordersT.department,
  group: ordersT.group,
  subject: ordersT.subject,
  titleMl: ordersT.titleMl,
  titleEn: ordersT.titleEn,
  summaryMl: ordersT.summaryMl,
  summaryEn: ordersT.summaryEn,
  important: ordersT.isImportant,
  pages: ordersT.pageCount,
  legacyUrl: ordersT.legacyUrl,
  pdfR2: media.r2Key,
  pdfSrc: media.sourceUrl,
  pdfBytes: media.bytes,
};

async function selectOrders(where: (SQL | undefined)[], limit?: number) {
  const db = await getDb();
  const query = db
    .select(orderColumns)
    .from(ordersT)
    .leftJoin(media, eq(media.id, ordersT.pdfMediaId))
    .where(and(eq(ordersT.status, 'published'), ...where))
    .orderBy(desc(ordersT.goDate), desc(ordersT.id))
    .$dynamic();
  const rows = await (limit ? query.limit(limit) : query);
  return rows.map(
    (r): Order => ({
      id: r.id,
      slug: r.slug,
      goNumber: r.goNumber,
      goDate: r.goDate,
      ...(r.dateIsUpload && { dateIsUpload: true }),
      ...(r.department && { department: r.department }),
      group: r.group,
      subject: r.subject,
      title: { ml: r.titleMl, en: r.titleEn },
      ...(r.summaryMl && { summary: l10n(r.summaryMl, r.summaryEn) }),
      ...(r.important && { important: true }),
      pdfKb: r.pdfBytes ? Math.round(r.pdfBytes / 1024) : 0,
      ...(r.pages && { pages: r.pages }),
      ...(fileUrl(r.pdfR2, r.pdfSrc) && { pdfUrl: fileUrl(r.pdfR2, r.pdfSrc) }),
      ...(r.legacyUrl && { legacyUrl: r.legacyUrl }),
    }),
  );
}

/** Every published order, newest first: the Orders page filters them in the browser */
export const allOrders = () => selectOrders([]);
export const latestOrders = (n = 5) => selectOrders([], n);
export const orderById = async (id: number) => (await selectOrders([eq(ordersT.id, id)], 1))[0];

/** Newest orders on the same subject, then others in the same group */
export async function relatedOrders(o: Order, n = 4) {
  const same = await selectOrders([eq(ordersT.subject, o.subject), ne(ordersT.id, o.id)], n);
  if (same.length >= n) return same;
  return [...same, ...(await selectOrders([eq(ordersT.group, o.group), ne(ordersT.subject, o.subject)], n - same.length))];
}

// ── Kerala Service ───────────────────────────────────────────────────────────────────────

const pdf = alias(media, 'pdf');

/** Kerala Service issues, newest first */
export async function allIssues(): Promise<MagazineIssue[]> {
  const db = await getDb();
  const rows = await db
    .select({ year: magazineIssues.year, month: magazineIssues.month, legacyUrl: magazineIssues.legacyUrl, coverR2: media.r2Key, coverSrc: media.sourceUrl, pdfR2: pdf.r2Key, pdfSrc: pdf.sourceUrl })
    .from(magazineIssues)
    .leftJoin(media, eq(media.id, magazineIssues.coverMediaId))
    .leftJoin(pdf, eq(pdf.id, magazineIssues.pdfMediaId))
    .orderBy(desc(magazineIssues.year), desc(magazineIssues.month));
  return rows.map((r) => ({
    year: r.year,
    month: r.month,
    ...(fileUrl(r.pdfR2, r.pdfSrc) && { pdfUrl: fileUrl(r.pdfR2, r.pdfSrc) }),
    ...(fileUrl(r.coverR2, r.coverSrc) && { coverUrl: fileUrl(r.coverR2, r.coverSrc) }),
    ...(r.legacyUrl && { legacyUrl: r.legacyUrl }),
  }));
}

// ── Home banner ──────────────────────────────────────────────────────────────────────────

export type ActiveBanner =
  | { kind: 'post'; post: Post; headline?: L10n }
  | { kind: 'event'; event: UnionEvent; headline?: L10n };
type BannerSetting = ({ post: number } | { event: string }) & { headline?: L10n };

/** The home-page banner's post or event, or null when there's none (or it no longer exists). */
export async function activeBanner(): Promise<ActiveBanner | null> {
  const db = await getDb();
  const row = await db.select({ value: siteSettings.value }).from(siteSettings).where(eq(siteSettings.key, 'home_banner')).get();
  const banner = row?.value as BannerSetting | null | undefined;
  if (!banner) return null;
  if ('post' in banner) {
    const [post] = await selectPosts([eq(postsT.id, banner.post)], { limit: 1 });
    return post ? { kind: 'post', post, headline: banner.headline } : null;
  }
  const slug = banner.event;
  const event = events.find((e) => e.slug === slug);
  return event ? { kind: 'event', event, headline: banner.headline } : null;
}

// ── Events (hand-written for now) ────────────────────────────────────────────────────────

const NOW = () => new Date();
export const allEvents = () => [...events].sort((a, b) => a.start.localeCompare(b.start));
export const isUpcoming = (e: { start: string; end?: string }) => new Date(e.end ?? e.start) >= NOW();
export const upcomingEvents = (n = 3) => allEvents().filter(isUpcoming).slice(0, n);
export const eventsForDistrict = (slug: string) => allEvents().filter((e) => e.district === slug && isUpcoming(e));

