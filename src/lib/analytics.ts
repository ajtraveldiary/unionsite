// The site's own cookie-less analytics (plan, section 14). A tiny script on every public page
// sends a beacon to /api/e: a page view, and a few actions (reading past 75 % of an article, opening
// a PDF, sharing, searching, a page not found). Here each event is checked, robots are dropped, and
// the visitor becomes an anonymous code that changes every day (a hash of address, browser and
// the date, never stored or shown). On Cloudflare the event goes to Workers Analytics Engine (the
// ANALYTICS binding); until that is set up, and on a laptop, to the `analytics_raw` table. The
// hourly roll-up (rollupDay) turns either into the daily tables the dashboard reads.
import { and, gte, lt, sql } from 'drizzle-orm';
import { getD1, getDb } from '~/db/client';
import { analyticsRaw, contentDaily, searchDaily, siteDaily } from '~/db/schema';

export const EVENT_TYPES = ['view', 'read', 'pdf', 'share', 'search', 'notfound'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

interface AnalyticsEngine { writeDataPoint(p: { blobs?: string[]; doubles?: number[]; indexes?: string[] }): void }
interface Env { ANALYTICS?: AnalyticsEngine; ANALYTICS_SALT?: string; CF_ACCOUNT_ID?: string; CF_API_TOKEN?: string; ANALYTICS_DATASET?: string }
const env = async () => (await import('cloudflare:workers')).env as unknown as Env;

const BOTS = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp\/|curl|wget|python|headless|lighthouse|pingdom|uptime/i;

const device = (ua: string) => (/ipad|tablet|(android(?!.*mobile))/i.test(ua) ? 'tablet' : /mobi|iphone|android/i.test(ua) ? 'mobile' : 'desktop');

/** Where the visitor came from, by the referring site: WhatsApp, Facebook, Google, direct or other */
export function sourceOf(referrer: string, ownHost: string) {
  if (!referrer) return 'direct';
  let host = '';
  try { host = new URL(referrer).hostname; } catch { return 'other'; }
  if (host === ownHost || host.endsWith(`.${ownHost}`)) return 'internal';
  if (/whatsapp|wa\.me/.test(host)) return 'whatsapp';
  if (/facebook|fb\.com|fb\.me/.test(host)) return 'facebook';
  if (/google\./.test(host)) return 'google';
  if (/bing\.|duckduckgo|yahoo\./.test(host)) return 'other search';
  return 'other';
}

const hex = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
/** "2026-10-25" in India */
export const istDate = (d = new Date()) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);

/** Records one beacon; quietly drops anything that isn't a real visitor's event */
export async function record(request: Request, body: unknown) {
  const ua = request.headers.get('User-Agent') ?? '';
  if (!ua || BOTS.test(ua)) return;
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const type = EVENT_TYPES.find((t) => t === b.t);
  const path = typeof b.p === 'string' ? b.p.slice(0, 300) : '';
  if (!type || !path.startsWith('/') || path.startsWith('/admin')) return;
  const url = new URL(request.url);
  const e = await env();
  const ip = request.headers.get('CF-Connecting-IP') ?? '';
  const visitor = await hex(`${ip}|${ua}|${istDate()}|${e.ANALYTICS_SALT ?? 'kerala-ngo-union'}`);
  const cf = (request as Request & { cf?: { country?: string; region?: string } }).cf;
  const detail = typeof b.d === 'string' ? b.d.slice(0, type === 'search' ? 100 : 300) : '';
  const row = {
    type, path, visitor, at: new Date().toISOString(),
    source: type === 'view' ? sourceOf(typeof b.r === 'string' ? b.r : '', url.hostname) : '',
    device: device(ua), lang: path === '/en' || path.startsWith('/en/') ? 'en' : 'ml',
    country: cf?.country ?? '', region: cf?.region ?? '',
    detail: type === 'search' ? detail.toLowerCase().replace(/\s+/g, ' ').trim() : detail,
    value: Number.isFinite(Number(b.v)) ? Math.max(0, Math.round(Number(b.v))) : 0,
  };
  if (e.ANALYTICS) {
    e.ANALYTICS.writeDataPoint({ blobs: [row.type, row.path, row.source, row.device, row.lang, row.country, row.region, row.detail], doubles: [row.value], indexes: [row.visitor] });
    return;
  }
  const db = await getDb();
  await db.insert(analyticsRaw).values(row);
}

// ── Roll-up: raw events → daily tables ─────────────────────────────────────────────────

interface Ev { type: string; path: string; visitor: string; source: string; device: string; lang: string; country: string; region: string; detail: string; value: number }

/** A day's raw events from Analytics Engine's SQL API (needs CF_ACCOUNT_ID and CF_API_TOKEN) */
async function fromEngine(e: Env, date: string): Promise<Ev[]> {
  const ds = e.ANALYTICS_DATASET ?? 'union_events';
  const start = new Date(`${date}T00:00:00+05:30`).toISOString().replace('T', ' ').slice(0, 19);
  const end = new Date(new Date(`${date}T00:00:00+05:30`).getTime() + 86400_000).toISOString().replace('T', ' ').slice(0, 19);
  const q = `SELECT blob1 AS type, blob2 AS path, index1 AS visitor, blob3 AS source, blob4 AS device, blob5 AS lang, blob6 AS country, blob7 AS region, blob8 AS detail, double1 AS value
    FROM ${ds} WHERE timestamp >= toDateTime('${start}') AND timestamp < toDateTime('${end}') FORMAT JSON`;
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${e.CF_ACCOUNT_ID}/analytics_engine/sql`, { method: 'POST', headers: { Authorization: `Bearer ${e.CF_API_TOKEN}` }, body: q });
  if (!r.ok) throw new Error(`Analytics Engine answered ${r.status}`);
  return ((await r.json()) as { data: Ev[] }).data;
}

/** The same day's events from the fallback table */
async function fromTable(date: string): Promise<Ev[]> {
  const d1 = await getD1();
  const r = await d1.prepare(`SELECT type, path, visitor, coalesce(source,'') AS source, coalesce(device,'') AS device, coalesce(lang,'') AS lang, coalesce(country,'') AS country, coalesce(region,'') AS region, coalesce(detail,'') AS detail, coalesce(value,0) AS value
    FROM analytics_raw WHERE at >= ? AND at < ?`).bind(new Date(`${date}T00:00:00+05:30`).toISOString(), new Date(new Date(`${date}T00:00:00+05:30`).getTime() + 86400_000).toISOString()).all<Ev>();
  return r.results;
}

const bump = (o: Record<string, number>, k: string, n = 1) => { if (k) o[k] = (o[k] ?? 0) + n; };

/** Rewrites one day's rows in the daily tables from that day's events (it can run any number of times) */
export async function rollupDay(date: string) {
  const e = await env();
  const events = e.ANALYTICS && e.CF_ACCOUNT_ID && e.CF_API_TOKEN ? await fromEngine(e, date) : await fromTable(date);
  const views = events.filter((x) => x.type === 'view');
  const site = {
    date, visitors: new Set(views.map((x) => x.visitor)).size, pageviews: views.length,
    devices: {} as Record<string, number>, sources: {} as Record<string, number>, langs: {} as Record<string, number>, regions: {} as Record<string, number>, notFound: {} as Record<string, number>,
  };
  const content = new Map<string, { views: number; visitors: Set<string>; reads: number; opens: number; shares: number }>();
  const page = (p: string) => content.get(p) ?? (content.set(p, { views: 0, visitors: new Set(), reads: 0, opens: 0, shares: 0 }), content.get(p)!);
  const search = new Map<string, { count: number; zero: number }>();
  for (const x of events) {
    if (x.type === 'view') {
      bump(site.devices, x.device); bump(site.sources, x.source); bump(site.langs, x.lang); bump(site.regions, [x.region, x.country].filter(Boolean).join(', '));
      const c = page(x.path); c.views++; c.visitors.add(x.visitor);
    } else if (x.type === 'read') page(x.path).reads++;
    else if (x.type === 'pdf') page(x.path).opens++;
    else if (x.type === 'share') page(x.path).shares++;
    else if (x.type === 'notfound') bump(site.notFound, x.path);
    else if (x.type === 'search' && x.detail) {
      const s = search.get(x.detail) ?? { count: 0, zero: 0 };
      s.count++;
      if (!x.value) s.zero++;
      search.set(x.detail, s);
    }
  }
  const db = await getDb();
  const writes = [
    db.delete(siteDaily).where(sql`${siteDaily.date} = ${date}`),
    db.delete(contentDaily).where(sql`${contentDaily.date} = ${date}`),
    db.delete(searchDaily).where(sql`${searchDaily.date} = ${date}`),
    db.insert(siteDaily).values(site),
    ...[...content].map(([path, c]) => db.insert(contentDaily).values({ date, path, views: c.views, visitors: c.visitors.size, reads: c.reads, opens: c.opens, shares: c.shares })),
    ...[...search].map(([term, s]) => db.insert(searchDaily).values({ date, term, count: s.count, zero: s.zero })),
  ];
  // D1 batches are one transaction; a few hundred statements each keeps them small
  for (let i = 0; i < writes.length; i += 200) await db.batch(writes.slice(i, i + 200) as [never, ...never[]]);
  return { events: events.length, pages: content.size };
}

/** The hourly job: today and yesterday (late events), then drop fallback events older than two days */
export async function rollup() {
  const today = istDate();
  const yesterday = istDate(new Date(Date.now() - 86400_000));
  const r = await rollupDay(today);
  await rollupDay(yesterday);
  const db = await getDb();
  await db.delete(analyticsRaw).where(lt(analyticsRaw.at, new Date(Date.now() - 2 * 86400_000).toISOString()));
  return r;
}

/** Visitors in the last 30 minutes and what they read (fallback table only; Analytics Engine needs the API) */
export async function liveNow() {
  const e = await env();
  if (e.ANALYTICS) return null;
  const db = await getDb();
  const since = new Date(Date.now() - 30 * 60_000).toISOString();
  const rows = await db.select({ path: analyticsRaw.path, visitor: analyticsRaw.visitor }).from(analyticsRaw).where(and(gte(analyticsRaw.at, since), sql`${analyticsRaw.type} = 'view'`)).limit(5000);
  const top: Record<string, number> = {};
  for (const r of rows) bump(top, r.path);
  return { visitors: new Set(rows.map((r) => r.visitor)).size, top: Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 5) };
}
