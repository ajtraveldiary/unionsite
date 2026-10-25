// The Analytics screen's numbers (plan, section 14; approved wireframe "Analytics"), read from the
// daily tables the hourly roll-up writes (src/lib/analytics.ts). A period (today, 7 or 30 days, 12
// months) is compared with the one before. State roles see the whole site; a district admin their
// district's hub and posts, with site-wide totals for scale; a district editor their own posts.
// Visitors over several days add up each day's visitors (the code changes daily, by design).
import { and, between, eq, inArray, like, or, sql } from 'drizzle-orm';
import { getDb } from '~/db/client';
import { contentDaily, orders, posts, postTranslations, searchDaily, siteDaily } from '~/db/schema';
import { istDate } from '~/lib/analytics';
import { districts } from '~/data/districts';
import { isState, type AdminUser } from './roles';

export const PERIODS = { 1: 'Today', 7: '7 days', 30: '30 days', 365: '12 months' } as const;
export type Period = keyof typeof PERIODS;

const day = (offset: number) => istDate(new Date(Date.now() - offset * 86400_000));
export function range(days: Period) {
  return { from: day(days - 1), to: day(0), prevFrom: day(days * 2 - 1), prevTo: day(days) };
}

/** A news path without /en, and its year and slug: /news/2026/slug */
const postKey = (path: string) => path.replace(/^\/en(?=\/)/, '').match(/^\/news\/(\d{4})\/([^/?#]+)$/);
const orderKey = (path: string) => path.replace(/^\/en(?=\/)/, '').match(/^\/orders\/(\d+)-/);

type Db = Awaited<ReturnType<typeof getDb>>;

/** The posts behind some news paths: title, district and author, to name and scope the rows */
async function postsFor(db: Db, keys: [string, string][]) {
  if (!keys.length) return new Map<string, { id: number; title: string; district: string | null; createdBy: number | null }>();
  const rows = await db.select({ id: posts.id, slug: posts.slug, date: posts.publishedAt, district: posts.district, createdBy: posts.createdBy, title: postTranslations.title })
    .from(posts).innerJoin(postTranslations, and(eq(postTranslations.postId, posts.id), eq(postTranslations.lang, 'ml')))
    .where(inArray(posts.slug, [...new Set(keys.map(([, s]) => s))]));
  return new Map(rows.map((r) => [`${r.date.slice(0, 4)}/${r.slug}`, r]));
}

async function sums(db: Db, from: string, to: string) {
  const s = await db.select({ visitors: sql<number>`coalesce(sum(${siteDaily.visitors}),0)`, pageviews: sql<number>`coalesce(sum(${siteDaily.pageviews}),0)` }).from(siteDaily).where(between(siteDaily.date, from, to)).get();
  const c = await db.select({ reads: sql<number>`coalesce(sum(${contentDaily.reads}),0)`, opens: sql<number>`coalesce(sum(${contentDaily.opens}),0)`, shares: sql<number>`coalesce(sum(${contentDaily.shares}),0)` }).from(contentDaily).where(between(contentDaily.date, from, to)).get();
  const q = await db.select({ searches: sql<number>`coalesce(sum(${searchDaily.count}),0)` }).from(searchDaily).where(between(searchDaily.date, from, to)).get();
  return { visitors: s?.visitors ?? 0, pageviews: s?.pageviews ?? 0, reads: c?.reads ?? 0, opens: c?.opens ?? 0, shares: c?.shares ?? 0, searches: q?.searches ?? 0 };
}

export async function dashboard(user: AdminUser, days: Period) {
  const db = await getDb();
  const r = range(days);
  const [now, before, daily, contentRows, searchRows, siteRows] = await Promise.all([
    sums(db, r.from, r.to),
    sums(db, r.prevFrom, r.prevTo),
    db.select({ date: siteDaily.date, visitors: siteDaily.visitors, pageviews: siteDaily.pageviews }).from(siteDaily).where(between(siteDaily.date, r.from, r.to)).orderBy(siteDaily.date),
    db.select({ path: contentDaily.path, views: sql<number>`sum(${contentDaily.views})`, reads: sql<number>`sum(${contentDaily.reads})`, opens: sql<number>`sum(${contentDaily.opens})`, shares: sql<number>`sum(${contentDaily.shares})` })
      .from(contentDaily).where(and(between(contentDaily.date, r.from, r.to), or(like(contentDaily.path, '/news/%'), like(contentDaily.path, '/en/news/%'), like(contentDaily.path, '/orders/%'), like(contentDaily.path, '/en/orders/%'), like(contentDaily.path, '/districts/%'), like(contentDaily.path, '/en/districts/%'), like(contentDaily.path, '/kerala-service/%'))))
      .groupBy(contentDaily.path),
    isState(user) ? db.select({ term: searchDaily.term, count: sql<number>`sum(${searchDaily.count})`, zero: sql<number>`sum(${searchDaily.zero})` }).from(searchDaily).where(between(searchDaily.date, r.from, r.to)).groupBy(searchDaily.term).orderBy(sql`2 desc`).limit(200) : [],
    db.select({ devices: siteDaily.devices, sources: siteDaily.sources, langs: siteDaily.langs, regions: siteDaily.regions, notFound: siteDaily.notFound }).from(siteDaily).where(between(siteDaily.date, r.from, r.to)),
  ]);

  // Posts: both languages count for the same post
  const postViews = new Map<string, { views: number; reads: number; shares: number }>();
  const orderViews = new Map<number, { views: number; opens: number }>();
  const hubViews: Record<string, number> = {};
  for (const c of contentRows) {
    const pk = postKey(c.path);
    if (pk) {
      const k = `${pk[1]}/${pk[2]}`;
      const v = postViews.get(k) ?? { views: 0, reads: 0, shares: 0 };
      v.views += c.views; v.reads += c.reads; v.shares += c.shares;
      postViews.set(k, v);
      continue;
    }
    const ok = orderKey(c.path);
    if (ok) {
      const id = Number(ok[1]);
      const v = orderViews.get(id) ?? { views: 0, opens: 0 };
      v.views += c.views; v.opens += c.opens;
      orderViews.set(id, v);
      continue;
    }
    const hub = c.path.replace(/^\/en(?=\/)/, '').match(/^\/districts\/([a-z-]+)$/);
    if (hub) hubViews[hub[1]] = (hubViews[hub[1]] ?? 0) + c.views;
  }
  const meta = await postsFor(db, [...postViews.keys()].map((k) => k.split('/') as [string, string]));
  // Who sees which posts: state everything, a district admin their district, an editor their own
  const visible = (m: { district: string | null; createdBy: number | null } | undefined) =>
    !!m && (isState(user) || (user.role === 'district_admin' ? m.district === user.district : m.createdBy === user.id));
  const topPosts = [...postViews].map(([k, v]) => ({ key: k, ...v, post: meta.get(k) })).filter((x) => visible(x.post))
    .sort((a, b) => b.views - a.views).slice(0, 15)
    .map((x) => ({ id: x.post!.id, title: x.post!.title, district: x.post!.district, views: x.views, reads: x.reads, shares: x.shares, path: `/news/${x.key}` }));

  let topOrders: { id: number; title: string; views: number; opens: number }[] = [];
  if (isState(user) && orderViews.size) {
    const ids = [...orderViews.entries()].sort((a, b) => b[1].views + b[1].opens - (a[1].views + a[1].opens)).slice(0, 15).map(([id]) => id);
    const rows = await db.select({ id: orders.id, title: orders.titleEn }).from(orders).where(inArray(orders.id, ids));
    const names = new Map(rows.map((o) => [o.id, o.title]));
    topOrders = ids.map((id) => ({ id, title: names.get(id) ?? `Order ${id}`, ...orderViews.get(id)! }));
  }

  // Districts compared: hub views, article views and posts this month (the success measure of 4+)
  let districtsCompared: { slug: string; name: string; hub: number; articles: number; postsThisMonth: number }[] = [];
  if (isState(user) || user.role === 'district_admin') {
    const month = istDate().slice(0, 7);
    const monthCounts = await db.select({ district: posts.district, n: sql<number>`count(*)` }).from(posts)
      .where(and(eq(posts.status, 'published'), like(posts.publishedAt, `${month}%`))).groupBy(posts.district);
    const per = Object.fromEntries(monthCounts.map((m) => [m.district, m.n]));
    const articles: Record<string, number> = {};
    for (const [k, v] of postViews) { const d = meta.get(k)?.district; if (d) articles[d] = (articles[d] ?? 0) + v.views; }
    districtsCompared = [...districts].sort((a, b) => a.sortOrder - b.sortOrder)
      .filter((d) => isState(user) || d.slug === user.district)
      .map((d) => ({ slug: d.slug, name: d.name.en, hub: hubViews[d.slug] ?? 0, articles: articles[d.slug] ?? 0, postsThisMonth: per[d.slug] ?? 0 }));
  }

  const merge = (key: 'devices' | 'sources' | 'langs' | 'regions' | 'notFound') => {
    const out: Record<string, number> = {};
    for (const row of siteRows) for (const [k, v] of Object.entries(row[key] ?? {})) out[k] = (out[k] ?? 0) + v;
    return Object.entries(out).sort((a, b) => b[1] - a[1]);
  };

  // Every day of the period, with zeros where nothing was counted
  const series: { date: string; visitors: number; pageviews: number }[] = [];
  const byDate = new Map(daily.map((d) => [d.date, d]));
  if (days <= 31) for (let i = days - 1; i >= 0; i--) { const d = day(i); series.push(byDate.get(d) ?? { date: d, visitors: 0, pageviews: 0 }); }
  else {
    // A year shows months
    const months = new Map<string, { visitors: number; pageviews: number }>();
    for (const d of daily) { const m = d.date.slice(0, 7); const v = months.get(m) ?? { visitors: 0, pageviews: 0 }; v.visitors += d.visitors; v.pageviews += d.pageviews; months.set(m, v); }
    for (let i = 11; i >= 0; i--) { const dt = new Date(); dt.setMonth(dt.getMonth() - i); const m = istDate(dt).slice(0, 7); series.push({ date: m, ...(months.get(m) ?? { visitors: 0, pageviews: 0 }) }); }
  }

  return {
    range: r, now, before, series, topPosts, topOrders, districtsCompared,
    searches: searchRows.map((s) => ({ term: s.term, count: s.count, zero: s.zero })),
    zeroSearches: searchRows.filter((s) => s.zero > 0).sort((a, b) => b.zero - a.zero).slice(0, 15),
    sources: merge('sources'), devices: merge('devices'), langs: merge('langs'), regions: merge('regions').slice(0, 15), notFound: merge('notFound').slice(0, 15),
    hasData: daily.length > 0,
  };
}

/** One table of the dashboard as CSV, for "Download CSV" */
export function toCsv(rows: (string | number | null)[][]) {
  return rows.map((r) => r.map((v) => { const s = v === null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\n');
}
