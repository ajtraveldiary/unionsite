// Content queries. Pages and components get content only from here. Posts, orders, Kerala Service
// issues, events and the home banner come from D1 (src/db/schema.ts), each query reading only what
// its page shows.
// The URL helpers at the top are plain functions and safe to use anywhere.
import { and, asc, desc, eq, exists, gte, inArray, isNotNull, isNull, lt, ne, notInArray, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { getDb } from '~/db/client';
import { albumItems, albums as albumsT, areaCommittees, conferences as conferencesT, districts as districtsT, documents as documentsT, events as eventsT, magazineIssues, media, offices as officesT, orders as ordersT, pages as pagesT, people, positions, posts as postsT, postTranslations, siteSettings, videos as videosT } from '~/db/schema';
import { subjectBySlug } from '~/data/orders';
import { site } from '~/data/site';
import { districts } from '~/data/districts';
import type { AboutPage, Album, AlbumPhoto, Conference, Cover, L10n, Lang, MagazineIssue, Order, Person, Post, UnionDocument, UnionEvent, Video } from './types';
import type { Body } from './richtext';
import { href } from './i18n';
import { newsMatching } from './search-db';
import { postPath, orderPath, issuePath } from './paths';

export { postPath, orderPath, issuePath };
export const postUrl = (p: Pick<Post, 'date' | 'slug'>, lang: Lang) => href(lang, postPath(p));
export const orderUrl = (o: Pick<Order, 'id' | 'slug'>, lang: Lang) => href(lang, orderPath(o));
export const districtUrl = (slug: string, lang: Lang) => href(lang, `/districts/${slug}`);
export const subjectName = (slug: string) => subjectBySlug[slug]?.name;
export const sortedDistricts = () => [...districts].sort((a, b) => a.sortOrder - b.sortOrder);

/** Files in R2 are served by the Worker at /media/… until media.keralangounion.in is connected at
 * launch (plan, section 4); crawled ones still come from the old site */
export const MEDIA_BASE = '/media';
export const fileUrl = (r2Key: string | null, sourceUrl: string | null) => (r2Key ? `${MEDIA_BASE}/${r2Key}` : sourceUrl ?? undefined);
/** Uploaded photos keep their sizes as R2 keys ("images/2026/10/12/320.webp 320w, …"); crawled ones as full URLs */
export const srcsetUrls = (srcset: string, r2Key: string | null) =>
  r2Key ? srcset.split(',').map((s) => { const [key, w] = s.trim().split(/\s+/); return `${MEDIA_BASE}/${key} ${w}`; }).join(', ') : srcset;

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
type PostRow = { [K in keyof typeof postColumns]: (typeof postColumns)[K]['_']['data'] | null } & { bodyMl?: Body | null; bodyEn?: Body | null };

const l10n = (mlText: string | null, enText: string | null): L10n => ({ ml: mlText ?? '', ...(enText && { en: enText }) });

function toPost(r: PostRow): Post {
  const src = fileUrl(r.coverR2, r.coverSrc);
  const cover: Cover = src
    ? { kind: 'photo', src, ...(r.coverSrcset && { srcset: srcsetUrls(r.coverSrcset, r.coverR2) }), alt: l10n(r.coverAltMl, r.coverAltEn) }
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

async function selectPosts(where: (SQL | undefined)[], opts: { limit?: number; offset?: number; body?: boolean } = {}) {
  const db = await getDb();
  const columns = opts.body ? { ...postColumns, bodyMl: ml.body, bodyEn: en.body } : postColumns;
  const query = db
    .select(columns)
    .from(postsT)
    .innerJoin(ml, and(eq(ml.postId, postsT.id), eq(ml.lang, 'ml')))
    // English shows only once a person wrote or approved it, never as an AI draft (plan, section 6)
    .leftJoin(en, and(eq(en.postId, postsT.id), eq(en.lang, 'en'), inArray(en.source, ['human', 'ai_reviewed'])))
    .leftJoin(media, eq(media.id, postsT.coverMediaId))
    .where(and(eq(postsT.status, 'published'), ...where))
    .orderBy(desc(postsT.publishedAt), desc(postsT.id))
    .$dynamic();
  const rows = (await (opts.limit ? query.limit(opts.limit).offset(opts.offset ?? 0) : query)) as PostRow[];
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

export interface NewsQuery {
  topic?: string;
  /** A district slug, or 'state' for posts without a district */
  district?: string;
  /** Search words (D1's full-text index, src/lib/search-db.ts) */
  q?: string;
  /** Leave out this post (the lead, when the page shows it above the list) */
  skip?: number;
  offset: number;
  limit: number;
}

/** One page of the News list for its filters, newest first, with how many match in all */
export async function newsPage({ topic, district, q, skip, offset, limit }: NewsQuery) {
  const where = [
    topic ? eq(postsT.topic, topic) : undefined,
    district === 'state' ? isNull(postsT.district) : district ? eq(postsT.district, district) : undefined,
    q?.trim() ? newsMatching(q, postsT.id) : undefined,
    skip ? ne(postsT.id, skip) : undefined,
  ];
  const db = await getDb();
  const [posts, [{ n }]] = await Promise.all([
    selectPosts(where, { limit, offset }),
    db.select({ n: sql<number>`count(*)` }).from(postsT).where(and(eq(postsT.status, 'published'), ...where)),
  ]);
  return { total: n, posts };
}

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
      ...(r.pdfR2 && r.pdfBytes && { pdfBytes: r.pdfBytes }),
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
    .select({ year: magazineIssues.year, month: magazineIssues.month, legacyUrl: magazineIssues.legacyUrl, coverR2: media.r2Key, coverSrc: media.sourceUrl, pdfR2: pdf.r2Key, pdfSrc: pdf.sourceUrl, pdfBytes: pdf.bytes })
    .from(magazineIssues)
    .leftJoin(media, eq(media.id, magazineIssues.coverMediaId))
    .leftJoin(pdf, eq(pdf.id, magazineIssues.pdfMediaId))
    .where(eq(magazineIssues.status, 'published'))
    .orderBy(desc(magazineIssues.year), desc(magazineIssues.month));
  return rows.map((r) => ({
    year: r.year,
    month: r.month,
    ...(fileUrl(r.pdfR2, r.pdfSrc) && { pdfUrl: fileUrl(r.pdfR2, r.pdfSrc) }),
    ...(r.pdfR2 && r.pdfBytes && { pdfBytes: r.pdfBytes }),
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
  const event = await eventBySlug(banner.event);
  return event ? { kind: 'event', event, headline: banner.headline } : null;
}

// ── Events ───────────────────────────────────────────────────────────────────────────────

/** Now in India, in the form event times are stored ("2026-10-24T09:30:00+05:30"), so they compare as text */
export const nowIst = () => `${new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 19)}+05:30`;
/** An event is upcoming until it ends (or, without an end time, until it starts) */
export const isUpcoming = (e: { start: string; end?: string }) => new Date(e.end ?? e.start) >= new Date();
const ends = sql<string>`coalesce(${eventsT.endAt}, ${eventsT.startAt})`;

const eventColumns = {
  slug: eventsT.slug, titleMl: eventsT.titleMl, titleEn: eventsT.titleEn, venueMl: eventsT.venueMl, venueEn: eventsT.venueEn,
  descriptionMl: eventsT.descriptionMl, descriptionEn: eventsT.descriptionEn, enSource: eventsT.enSource, start: eventsT.startAt,
  end: eventsT.endAt, district: eventsT.district, mapUrl: eventsT.mapUrl, registrationUrl: eventsT.registrationUrl, sample: eventsT.sample,
  reportId: postsT.id, reportSlug: postsT.slug, reportDate: postsT.publishedAt, reportTitleMl: ml.title, reportTitleEn: en.title,
};

async function selectEvents(where: (SQL | undefined)[], order: 'asc' | 'desc', limit: number): Promise<UnionEvent[]> {
  const db = await getDb();
  const rows = await db
    .select(eventColumns)
    .from(eventsT)
    // The news report, once the event is over, and only while that post is on the site
    .leftJoin(postsT, and(eq(postsT.id, eventsT.reportPostId), eq(postsT.status, 'published')))
    .leftJoin(ml, and(eq(ml.postId, postsT.id), eq(ml.lang, 'ml')))
    .leftJoin(en, and(eq(en.postId, postsT.id), eq(en.lang, 'en'), inArray(en.source, ['human', 'ai_reviewed'])))
    .where(and(eq(eventsT.status, 'published'), ...where))
    .orderBy(order === 'asc' ? asc(eventsT.startAt) : desc(eventsT.startAt))
    .limit(limit);
  return rows.map((r) => {
    // English shows only once a person wrote or approved it (plan, section 6)
    const enOk = r.enSource !== 'ai_draft';
    return {
      slug: r.slug,
      title: l10n(r.titleMl, enOk ? r.titleEn : null),
      start: r.start,
      ...(r.end && { end: r.end }),
      venue: l10n(r.venueMl, enOk ? r.venueEn : null),
      ...(r.district && { district: r.district }),
      ...(r.descriptionMl && { description: l10n(r.descriptionMl, enOk ? r.descriptionEn : null) }),
      ...(r.mapUrl && { mapUrl: r.mapUrl }),
      ...(r.registrationUrl && { registrationUrl: r.registrationUrl }),
      ...(r.reportId && r.reportSlug && r.reportDate && { report: { title: l10n(r.reportTitleMl, r.reportTitleEn), path: postPath({ date: r.reportDate, slug: r.reportSlug }) } }),
      ...(r.sample && { sample: true }),
    };
  });
}

/** Events that haven't ended, soonest first */
export const upcomingEvents = (n = 3) => selectEvents([gte(ends, nowIst())], 'asc', n);
/** Events that are over, latest first */
export const pastEvents = (n = 30) => selectEvents([lt(ends, nowIst())], 'desc', n);
/** One district's upcoming events */
export const eventsForDistrict = (slug: string, n = 20) => selectEvents([eq(eventsT.district, slug), gte(ends, nowIst())], 'asc', n);
export const eventBySlug = async (slug: string) => (await selectEvents([eq(eventsT.slug, slug)], 'asc', 1))[0];

/** Upcoming district events, keyed by district slug, for the Districts page: one query */
export async function upcomingEventsByDistrict() {
  const list = await selectEvents([isNotNull(eventsT.district), gte(ends, nowIst())], 'asc', 300);
  const out: Record<string, UnionEvent[]> = {};
  for (const e of list) (out[e.district!] ??= []).push(e);
  return out;
}

// ── Committees, offices, videos ──────────────────────────────────────────────────────────

/** The smallest listed size at least `min` px wide (srcset "url 320w, …"), else the main file */
function sized(srcset: string | null, r2Key: string | null, src: string | undefined, min: number) {
  if (!src) return undefined;
  const sizes = (srcset ? srcsetUrls(srcset, r2Key) : '').split(',').map((s) => s.trim().split(/\s+/)).filter(([, w]) => w?.endsWith('w')).map(([url, w]) => ({ url, w: parseInt(w) }));
  return sizes.filter((s) => s.w >= min).sort((a, b) => a.w - b.w)[0]?.url ?? src;
}

/**
 * The members a committee has now (published), in the order the state office set: the state
 * committee, the women's sub-committee, a district committee or an area committee.
 */
export async function committee(body: 'state' | 'women_subcommittee' | 'district' | 'area', where: { district?: string; area?: number } = {}): Promise<Person[]> {
  const db = await getDb();
  const rows = await db
    .select({ ml: people.nameMl, en: people.nameEn, role: positions.role, body: positions.body, district: positions.district, phone: people.phone, r2Key: media.r2Key, src: media.sourceUrl, srcset: media.srcset })
    .from(positions)
    .innerJoin(people, eq(people.id, positions.personId))
    .leftJoin(media, eq(media.id, people.photoMediaId))
    .where(and(
      eq(positions.body, body),
      // Area committees keep their district too, so they are found by the area alone
      where.area ? eq(positions.areaCommitteeId, where.area) : isNull(positions.areaCommitteeId),
      where.area ? undefined : where.district ? eq(positions.district, where.district) : isNull(positions.district),
      eq(positions.status, 'published'),
    ))
    .orderBy(asc(positions.sortOrder), asc(positions.id));
  return rows.map((r) => ({
    name: { ml: r.ml, en: r.en || r.ml },
    role: r.role,
    body: r.body,
    ...(r.district && { district: r.district }),
    ...(r.phone && { phone: r.phone }),
    ...(fileUrl(r.r2Key, r.src) && { photo: sized(r.srcset, r.r2Key, fileUrl(r.r2Key, r.src), 160) }),
  }));
}

export interface Office {
  kind: 'state' | 'district' | 'area';
  area?: L10n;
  address: L10n;
  phone?: string;
  email?: string;
  /** A link that opens directions in the phone's map app */
  directions?: string;
}

/** A district's office addresses: the district office first, then the area offices in order */
export async function districtOffices(slug: string): Promise<Office[]> {
  const db = await getDb();
  const rows = await db
    .select({ kind: officesT.kind, addressMl: officesT.addressMl, addressEn: officesT.addressEn, phone: officesT.phone, email: officesT.email, lat: officesT.lat, lng: officesT.lng, mapUrl: officesT.mapUrl, areaMl: areaCommittees.nameMl, areaEn: areaCommittees.nameEn })
    .from(officesT)
    .leftJoin(areaCommittees, eq(areaCommittees.id, officesT.areaCommitteeId))
    .where(eq(officesT.district, slug))
    .orderBy(sql`${officesT.kind} = 'area'`, asc(officesT.sortOrder), asc(officesT.id));
  return rows.map((r) => ({
    kind: r.kind,
    ...(r.areaMl && { area: l10n(r.areaMl, r.areaEn) }),
    address: l10n(r.addressMl, r.addressEn),
    ...(r.phone && { phone: r.phone }),
    ...(r.email && { email: r.email }),
    ...((r.lat != null && r.lng != null) ? { directions: `https://www.google.com/maps/dir/?api=1&destination=${r.lat / 1e6},${r.lng / 1e6}` } : r.mapUrl ? { directions: r.mapUrl } : {}),
  }));
}

/** The newest videos that aren't hidden */
export async function latestVideos(n = 12): Promise<Video[]> {
  const db = await getDb();
  const rows = await db.select({ id: videosT.youtubeId, ml: videosT.titleMl, en: videosT.titleEn, date: videosT.publishedAt })
    .from(videosT).where(eq(videosT.hidden, false)).orderBy(desc(videosT.publishedAt), desc(videosT.id)).limit(n);
  return rows.map((r) => ({ id: r.id, title: l10n(r.ml, r.en), date: r.date }));
}

// ── About pages, documents, conferences, albums (Admin → Pages & documents, Media) ───────

/** A published About page or district history by its path ("/about/history"); English only once approved */
export async function aboutPage(path: string): Promise<AboutPage | null> {
  const db = await getDb();
  const r = await db.select({ path: pagesT.path, titleMl: pagesT.titleMl, titleEn: pagesT.titleEn, summaryMl: pagesT.summaryMl, summaryEn: pagesT.summaryEn, bodyMl: pagesT.bodyMl, bodyEn: pagesT.bodyEn, enSource: pagesT.enSource, updatedAt: pagesT.updatedAt })
    .from(pagesT).where(and(eq(pagesT.path, path), eq(pagesT.status, 'published'))).get();
  if (!r) return null;
  const en = r.titleEn && r.enSource && r.enSource !== 'ai_draft';
  return {
    path: r.path,
    title: l10n(r.titleMl, en ? r.titleEn : null),
    summary: l10n(r.summaryMl, en ? r.summaryEn : null),
    body: { ml: r.bodyMl ?? [], ...(en && r.bodyEn && { en: r.bodyEn }) },
    updatedAt: r.updatedAt,
  };
}

/** Which About sections have something on the site, for the About hub's cards and the district hub's history link */
export async function aboutAvailability() {
  const db = await getDb();
  const [paths, docs, confs] = await Promise.all([
    db.select({ path: pagesT.path }).from(pagesT).where(eq(pagesT.status, 'published')),
    db.select({ n: sql<number>`count(*)` }).from(documentsT).where(eq(documentsT.status, 'published')).get(),
    db.select({ n: sql<number>`count(*)` }).from(conferencesT).where(eq(conferencesT.status, 'published')).get(),
  ]);
  return { paths: new Set(paths.map((p) => p.path)), documents: docs?.n ?? 0, conferences: confs?.n ?? 0 };
}

const docColumns = {
  slug: documentsT.slug, kind: documentsT.kind, year: documentsT.year, titleMl: documentsT.titleMl, titleEn: documentsT.titleEn, summaryMl: documentsT.summaryMl,
  pages: documentsT.pageCount, updatedAt: documentsT.updatedAt, r2Key: media.r2Key, src: media.sourceUrl, bytes: media.bytes,
};
type DocRow = { slug: string; kind: UnionDocument['kind']; year: number | null; titleMl: string; titleEn: string | null; summaryMl: string | null; pages: number | null; updatedAt: string; r2Key: string | null; src: string | null; bytes: number | null };
const toDocument = (r: DocRow): UnionDocument => ({
  slug: r.slug, kind: r.kind, title: l10n(r.titleMl, r.titleEn), updatedAt: r.updatedAt,
  ...(r.year && { year: r.year }), ...(r.summaryMl && { summary: r.summaryMl }), ...(r.pages && { pages: r.pages }),
  ...(fileUrl(r.r2Key, r.src) && { pdfUrl: fileUrl(r.r2Key, r.src) }), ...(r.bytes && { kb: Math.round(r.bytes / 1024) }), ...(r.r2Key && r.bytes && { bytes: r.bytes }),
});

/** The organisation's published documents: the Bye-Law first, then resolutions and jubilee volumes, newest first */
export async function publishedDocuments(): Promise<UnionDocument[]> {
  const db = await getDb();
  const rows = await db.select(docColumns).from(documentsT).leftJoin(media, eq(media.id, documentsT.pdfMediaId))
    .where(eq(documentsT.status, 'published'))
    .orderBy(sql`case ${documentsT.kind} when 'bye_law' then 0 when 'resolution' then 1 when 'jubilee' then 2 else 3 end`, desc(documentsT.year), asc(documentsT.id));
  return rows.map(toDocument);
}

export async function documentBySlug(slug: string): Promise<UnionDocument | null> {
  const db = await getDb();
  const r = await db.select(docColumns).from(documentsT).leftJoin(media, eq(media.id, documentsT.pdfMediaId))
    .where(and(eq(documentsT.slug, slug), eq(documentsT.status, 'published'))).get();
  return r ? toDocument(r) : null;
}

type ConfRow = { number: number; year: number | null; start: string | null; end: string | null; placeMl: string | null; placeEn: string | null; report: string | null; albumSlug: string | null; eventSlug: string | null };
const confColumns = {
  number: conferencesT.number, year: conferencesT.year, start: conferencesT.startDate, end: conferencesT.endDate, placeMl: conferencesT.placeMl, placeEn: conferencesT.placeEn,
  report: conferencesT.reportMl, albumSlug: albumsT.slug, eventSlug: conferencesT.eventSlug,
};
const toConference = (r: ConfRow): Conference => ({
  number: r.number,
  ...(r.year && { year: r.year }), ...(r.start && { start: r.start }), ...(r.end && { end: r.end }),
  ...(r.placeMl && { place: l10n(r.placeMl, r.placeEn) }), ...(r.report && { report: r.report }),
  ...(r.albumSlug && { albumSlug: r.albumSlug }), ...(r.eventSlug && { eventSlug: r.eventSlug }),
});
// Only an album that is on the site counts
const confAlbum = and(eq(albumsT.id, conferencesT.albumId), eq(albumsT.status, 'published'));

/** Every published state conference (about 64 rows), newest first */
export async function publishedConferences(): Promise<Conference[]> {
  const db = await getDb();
  const rows = await db.select(confColumns).from(conferencesT).leftJoin(albumsT, confAlbum)
    .where(eq(conferencesT.status, 'published')).orderBy(desc(conferencesT.number));
  return rows.map(toConference);
}

/** One conference, with the published ones either side and the leaders it elected */
export async function conferenceByNumber(n: number) {
  const db = await getDb();
  const r = await db.select(confColumns).from(conferencesT).leftJoin(albumsT, confAlbum)
    .where(and(eq(conferencesT.number, n), eq(conferencesT.status, 'published'))).get();
  if (!r) return null;
  const published = and(eq(conferencesT.status, 'published'));
  const [older, newer] = await Promise.all([
    db.select({ number: conferencesT.number }).from(conferencesT).where(and(published, lt(conferencesT.number, n))).orderBy(desc(conferencesT.number)).limit(1).get(),
    db.select({ number: conferencesT.number }).from(conferencesT).where(and(published, gte(conferencesT.number, n + 1))).orderBy(asc(conferencesT.number)).limit(1).get(),
  ]);
  // The newest conference elected today's committee; an older one, the past term named after it ("62nd conference")
  const ordinal = `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
  const leaders = (newer ? await committeeTerm(ordinal) : await committee('state')).filter((p) => ['president', 'general_secretary', 'treasurer'].includes(p.role));
  return { conference: toConference(r), older: older?.number, newer: newer?.number, leaders, photos: r.albumSlug ? (await albumPhotos(r.albumSlug, 7)) : [] };
}

/** A past state committee whose term mentions this conference ("62nd conference", "2022–2025 · 62nd") */
async function committeeTerm(ordinal: string): Promise<Person[]> {
  const db = await getDb();
  const rows = await db.select({ ml: people.nameMl, en: people.nameEn, role: positions.role, r2Key: media.r2Key, src: media.sourceUrl, srcset: media.srcset })
    .from(positions).innerJoin(people, eq(people.id, positions.personId)).leftJoin(media, eq(media.id, people.photoMediaId))
    .where(and(eq(positions.body, 'state'), isNull(positions.district), eq(positions.status, 'past'), sql`lower(${positions.term}) like ${`%${ordinal.toLowerCase()}%`}`))
    .orderBy(asc(positions.sortOrder), asc(positions.id));
  return rows.map((r) => ({ name: { ml: r.ml, en: r.en || r.ml }, role: r.role, body: 'state' as const, ...(fileUrl(r.r2Key, r.src) && { photo: sized(r.srcset, r.r2Key, fileUrl(r.r2Key, r.src), 160) }) }));
}

const albumCount = sql<number>`(select count(*) from album_items where album_items.album_id = "albums"."id")`;

/** Published albums, newest first: all of them (Media) or one district's (its hub's Gallery tab) */
export async function publishedAlbums({ district, limit = 24 }: { district?: string; limit?: number } = {}): Promise<Album[]> {
  const db = await getDb();
  const rows = await db.select({ slug: albumsT.slug, ml: albumsT.titleMl, en: albumsT.titleEn, district: albumsT.district, date: albumsT.eventDate, r2Key: media.r2Key, src: media.sourceUrl, srcset: media.srcset, count: albumCount })
    .from(albumsT).leftJoin(media, eq(media.id, albumsT.coverMediaId))
    .where(and(eq(albumsT.status, 'published'), district ? eq(albumsT.district, district) : undefined))
    .orderBy(desc(albumsT.eventDate), desc(albumsT.id)).limit(limit);
  return rows.map((r) => ({
    slug: r.slug, title: l10n(r.ml, r.en), count: r.count,
    ...(r.district && { district: r.district }), ...(r.date && { date: r.date }),
    ...(fileUrl(r.r2Key, r.src) && { cover: sized(r.srcset, r.r2Key, fileUrl(r.r2Key, r.src), 480) }),
  }));
}

export async function albumBySlug(slug: string) {
  const db = await getDb();
  const r = await db.select({ slug: albumsT.slug, ml: albumsT.titleMl, en: albumsT.titleEn, district: albumsT.district, date: albumsT.eventDate, count: albumCount })
    .from(albumsT).where(and(eq(albumsT.slug, slug), eq(albumsT.status, 'published'))).get();
  if (!r) return null;
  const album: Album = { slug: r.slug, title: l10n(r.ml, r.en), count: r.count, ...(r.district && { district: r.district }), ...(r.date && { date: r.date }) };
  const conference = await db.select({ number: conferencesT.number }).from(conferencesT).innerJoin(albumsT, eq(albumsT.id, conferencesT.albumId))
    .where(and(eq(albumsT.slug, slug), eq(conferencesT.status, 'published'))).get();
  return { album, photos: await albumPhotos(slug), conference: conference?.number };
}

/** An album's photos in the order the admin set (the first few for a conference page) */
async function albumPhotos(slug: string, limit = 500): Promise<AlbumPhoto[]> {
  const db = await getDb();
  const rows = await db.select({ r2Key: media.r2Key, src: media.sourceUrl, srcset: media.srcset, width: media.width, height: media.height, captionMl: albumItems.captionMl, captionEn: albumItems.captionEn, altMl: media.altMl, altEn: media.altEn })
    .from(albumItems).innerJoin(albumsT, eq(albumsT.id, albumItems.albumId)).innerJoin(media, eq(media.id, albumItems.mediaId))
    .where(eq(albumsT.slug, slug)).orderBy(asc(albumItems.sortOrder), asc(albumItems.mediaId)).limit(limit);
  return rows.flatMap((r) => {
    const src = fileUrl(r.r2Key, r.src);
    if (!src) return [];
    return [{
      src, caption: l10n(r.captionMl ?? r.altMl ?? '', r.captionEn ?? r.altEn),
      ...(r.srcset && { srcset: srcsetUrls(r.srcset, r.r2Key) }), ...(r.width && { width: r.width }), ...(r.height && { height: r.height }),
    }];
  });
}

// ── Site details (Admin → Settings) ─────────────────────────────────────────────────────

export interface SiteDetails { addressMl: string; addressEn: string; phone: string; email: string; facebook: string; youtube: string }

export const defaultSiteDetails = (): SiteDetails => ({
  addressMl: site.address.ml, addressEn: site.address.en, phone: site.phone, email: site.email, facebook: site.social.facebook, youtube: site.social.youtube,
});

/** The State Centre's address, phone, email and social links, as set in Settings (site.ts until then).
 * Pages built ahead of time, and any page when the database can't be read, use the site.ts values. */
export async function siteDetails(): Promise<SiteDetails> {
  try {
    const db = await getDb();
    const row = await db.select({ value: siteSettings.value }).from(siteSettings).where(eq(siteSettings.key, 'site_details')).get();
    return { ...defaultSiteDetails(), ...((row?.value as Partial<SiteDetails> | undefined) ?? {}) };
  } catch {
    return defaultSiteDetails();
  }
}

/** The same details in the shape of `site` in src/data/site.ts, for the views that show them */
export async function siteInfo() {
  const d = await siteDetails();
  return { address: { ml: d.addressMl, en: d.addressEn || d.addressMl }, phone: d.phone, email: d.email, social: { facebook: d.facebook, youtube: d.youtube } };
}
