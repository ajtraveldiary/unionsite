// Events in the admin (plan, sections 10 and 11; approved wireframe "Events"). State roles manage
// every event, district roles their own district's; district editors save drafts and send them
// for review. English (title, venue, description) is optional and shows on the site only once
// someone who may approve it ticks "English checked". After the day, the news report is linked.
// Every publish rewrites the event's search entry and purges the pages that show events.
import { and, asc, desc, eq, gte, isNotNull, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { getDb } from '~/db/client';
import { events, posts, postTranslations, revisions, siteSettings, users } from '~/db/schema';
import { eventEntry } from '~/lib/search-entries';
import { purgeTags } from '~/lib/cache';
import { slugify } from '~/lib/slug';
import { nowIst } from '~/lib/content';
import { districts } from '~/data/districts';
import { audit } from './audit';
import { AdminError, purge, setSearch } from './publish';
import { can, isState, type AdminUser } from './roles';

export type EventStatus = 'draft' | 'in_review' | 'published' | 'archived';
export type EnSource = 'human' | 'ai_draft' | 'ai_reviewed';

/** The event form's fields. Times are India time as the form gives them: "2026-10-24T09:30" */
export interface EventDoc {
  titleMl: string;
  titleEn: string;
  venueMl: string;
  venueEn: string;
  descriptionMl: string;
  descriptionEn: string;
  start: string;
  end: string;
  district: string | null;
  mapUrl: string;
  registrationUrl: string;
}

export interface EventRow extends EventDoc {
  id: number;
  slug: string;
  status: EventStatus;
  enSource: EnSource | null;
  reportPostId: number | null;
  reportTitle: string | null;
  sample: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

/** "2026-10-24T09:30" (India time, from the form) ↔ "2026-10-24T09:30:00+05:30" (stored) */
const toStored = (local: string) => (local ? `${local.slice(0, 16)}:00+05:30` : null);
const toLocal = (stored: string | null) => (stored ? stored.slice(0, 16) : '');

const columns = {
  id: events.id, slug: events.slug, status: events.status, titleMl: events.titleMl, titleEn: events.titleEn, venueMl: events.venueMl,
  venueEn: events.venueEn, descriptionMl: events.descriptionMl, descriptionEn: events.descriptionEn, enSource: events.enSource,
  start: events.startAt, end: events.endAt, district: events.district, mapUrl: events.mapUrl, registrationUrl: events.registrationUrl,
  reportPostId: events.reportPostId, reportTitle: postTranslations.title, sample: events.sample, updatedAt: events.updatedAt, updatedBy: users.name,
};

type Db = Awaited<ReturnType<typeof getDb>>;
const select = (db: Db) => db.select(columns).from(events)
  .leftJoin(postTranslations, and(eq(postTranslations.postId, events.reportPostId), eq(postTranslations.lang, 'ml')))
  .leftJoin(users, eq(users.id, events.updatedBy))
  .$dynamic();

type Raw = Awaited<ReturnType<ReturnType<typeof select>['get']>>;
const toRow = (r: NonNullable<Raw>): EventRow => ({
  ...r,
  titleEn: r.titleEn ?? '', venueEn: r.venueEn ?? '', descriptionMl: r.descriptionMl ?? '', descriptionEn: r.descriptionEn ?? '',
  start: toLocal(r.start), end: toLocal(r.end), mapUrl: r.mapUrl ?? '', registrationUrl: r.registrationUrl ?? '',
});

/** Rows this person may see: district roles only their own district */
const scope = (user: AdminUser) => (isState(user) ? undefined : eq(events.district, user.district ?? '__none__'));
const ends = sql<string>`coalesce(${events.endAt}, ${events.startAt})`;

export interface EventFilter {
  when: 'upcoming' | 'past';
  district?: string;
  status?: EventStatus;
}

/** The admin's Events list: upcoming soonest first, or past latest first (100 at a time) */
export async function listEvents(user: AdminUser, f: EventFilter) {
  const q = select(await getDb());
  const rows = await q
    .where(and(
      scope(user),
      f.when === 'upcoming' ? gte(ends, nowIst()) : lt(ends, nowIst()),
      f.status ? eq(events.status, f.status) : ne(events.status, 'archived'),
      f.district === 'state' ? isNull(events.district) : f.district ? eq(events.district, f.district) : undefined,
    ))
    .orderBy(f.when === 'upcoming' ? asc(events.startAt) : desc(events.startAt))
    .limit(100);
  return rows.map(toRow);
}

export async function loadEvent(user: AdminUser, id: number) {
  const q = select(await getDb());
  const r = await q.where(eq(events.id, id)).get();
  if (!r) return null;
  const row = toRow(r);
  return can.edit(user, row) ? row : null;
}

/** Events a post can be linked to (the post editor's menu): upcoming ones and those of the last year */
export async function eventChoices(user: AdminUser) {
  const db = await getDb();
  const yearAgo = `${new Date(Date.now() - 365 * 86400_000).toISOString().slice(0, 10)}T00:00:00+05:30`;
  return db.select({ slug: events.slug, title: events.titleMl, start: events.startAt })
    .from(events)
    .where(and(eq(events.status, 'published'), gte(events.startAt, yearAgo), isState(user) ? undefined : or(isNull(events.district), eq(events.district, user.district ?? ''))))
    .orderBy(desc(events.startAt))
    .limit(150);
}

export const eventExists = async (slug: string) => {
  const db = await getDb();
  return !!(await db.select({ id: events.id }).from(events).where(eq(events.slug, slug)).get());
};

// ── Saving ──────────────────────────────────────────────────────────────────────────────

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim().slice(0, max) : '');
const url = (v: unknown) => {
  const s = str(v, 500);
  if (s && !/^https:\/\//i.test(s)) throw new AdminError('Links must start with https://');
  return s;
};

/** The form's fields, checked. District roles always get their own district. */
export function cleanEvent(input: Record<string, unknown>, user: AdminUser): EventDoc {
  const titleMl = str(input.titleMl, 200);
  const venueMl = str(input.venueMl, 200);
  if (!titleMl) throw new AdminError('Give the event a title in Malayalam.');
  if (!venueMl) throw new AdminError('Say where it happens (the venue, in Malayalam).');
  const start = str(input.start, 16);
  const end = str(input.end, 16);
  const time = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
  if (!time.test(start)) throw new AdminError('Pick the date and time it starts.');
  if (end && !time.test(end)) throw new AdminError('The end time could not be read.');
  if (end && end <= start) throw new AdminError('It must end after it starts.');
  let district = str(input.district, 40) || null;
  if (district && !districts.some((d) => d.slug === district)) throw new AdminError('Unknown district.');
  if (!isState(user)) district = user.district;
  return {
    titleMl, venueMl, start, end, district,
    titleEn: str(input.titleEn, 200),
    venueEn: str(input.venueEn, 200),
    descriptionMl: text(input.descriptionMl, 4000),
    descriptionEn: text(input.descriptionEn, 4000),
    mapUrl: url(input.mapUrl),
    registrationUrl: url(input.registrationUrl),
  };
}

const enText = (d: Pick<EventDoc, 'titleEn' | 'venueEn' | 'descriptionEn'>) => `${d.titleEn}\n${d.venueEn}\n${d.descriptionEn}`;

/**
 * English shows on the site only once approved (plan, section 6): it stays approved while its words
 * are unchanged, and becomes approved when someone allowed to ticks "English checked".
 */
function enSourceFor(user: AdminUser, doc: EventDoc, prev: EventRow | null, approve: boolean): EnSource | null {
  if (!doc.titleEn) return null;
  if (approve && can.approveEnglish(user, doc)) return prev?.enSource === 'human' && enText(prev) === enText(doc) ? 'human' : 'ai_reviewed';
  if (prev?.enSource && prev.enSource !== 'ai_draft' && enText(prev) === enText(doc)) return prev.enSource;
  return 'ai_draft';
}

/** A free address for the event: its title and the day it starts */
async function uniqueSlug(base: string, id: number | null) {
  const db = await getDb();
  let slug = base;
  for (let n = 2; ; n++) {
    const taken = await db.select({ id: events.id }).from(events).where(and(eq(events.slug, slug), id ? ne(events.id, id) : undefined)).get();
    if (!taken) return slug;
    slug = `${base}-${n}`;
  }
}

async function syncEvent(id: number) {
  const q = select(await getDb());
  const r = await q.where(eq(events.id, id)).get();
  if (!r || r.status !== 'published') return setSearch('event', id, null);
  const en = r.enSource && r.enSource !== 'ai_draft';
  await setSearch('event', id, eventEntry({
    slug: r.slug,
    title: { ml: r.titleMl, ...(en && r.titleEn && { en: r.titleEn }) },
    start: r.start,
    venue: { ml: r.venueMl, ...(en && r.venueEn && { en: r.venueEn }) },
    district: r.district ?? undefined,
    description: r.descriptionMl ? { ml: r.descriptionMl, ...(en && r.descriptionEn && { en: r.descriptionEn }) } : undefined,
  }));
}

async function isBanner(slug: string) {
  const db = await getDb();
  const row = await db.select({ value: siteSettings.value }).from(siteSettings).where(eq(siteSettings.key, 'home_banner')).get();
  return (row?.value as { event?: string } | null)?.event === slug;
}

export type EventAction = 'draft' | 'publish' | 'submit';

/**
 * Saves the form: as a draft, sent for review (district editors), or published. A published event
 * that is saved again stays published. Returns the event's id.
 */
export async function saveEvent(user: AdminUser, id: number | null, input: Record<string, unknown>, action: EventAction) {
  const db = await getDb();
  const prev = id ? await loadEvent(user, id) : null;
  if (id && !prev) throw new AdminError('This event could not be found, or it belongs to another district.', 404);
  if (prev && user.role === 'district_editor' && prev.status !== 'draft') throw new AdminError('Only your district admin can change this event now.', 403);
  const doc = cleanEvent(input, user);
  if (action === 'publish' && !can.publish(user, doc)) throw new AdminError('Your district admin publishes events. Use Send for review.', 403);
  const enSource = enSourceFor(user, doc, prev, input.approveEnglish === true || input.approveEnglish === 'on');
  const status: EventStatus = action === 'publish' ? 'published' : action === 'submit' ? 'in_review' : prev?.status === 'published' ? 'published' : prev?.status === 'in_review' ? 'in_review' : 'draft';
  if (status === 'published' && action !== 'publish' && !can.publish(user, doc)) throw new AdminError('Only your district admin can change a published event.', 403);
  const values = {
    titleMl: doc.titleMl, titleEn: doc.titleEn || null, venueMl: doc.venueMl, venueEn: doc.venueEn || null,
    descriptionMl: doc.descriptionMl || null, descriptionEn: doc.descriptionEn || null, enSource,
    startAt: toStored(doc.start)!, endAt: toStored(doc.end), district: doc.district,
    mapUrl: doc.mapUrl || null, registrationUrl: doc.registrationUrl || null, status, updatedBy: user.id, updatedAt: sql`(datetime('now'))`,
  };
  let eventId = id;
  if (!eventId) {
    const slug = await uniqueSlug(slugify(`${doc.titleEn || doc.titleMl} ${doc.start.slice(0, 10)}`, 9) || `event-${doc.start.slice(0, 10)}`, null);
    const row = await db.insert(events).values({ ...values, slug, createdBy: user.id }).returning({ id: events.id }).get();
    eventId = row.id;
  } else {
    // A published event sent "for review" by mistake stays as it is
    await db.update(events).set({ ...values, ...(prev?.sample && { sample: false }) }).where(eq(events.id, eventId));
  }
  const after = await loadEvent(user, eventId);
  if (status === 'published') {
    await db.insert(revisions).values({ entity: 'event', entityId: eventId, doc: after, note: prev?.status === 'published' ? 'Updated' : 'Published', userId: user.id });
  }
  if (status === 'published' || prev?.status === 'published') {
    await syncEvent(eventId);
    await purge([...purgeTags.event(), ...(after && (await isBanner(after.slug)) ? purgeTags.banner() : [])]);
  }
  const diff: Record<string, [unknown, unknown]> = {};
  if (prev) for (const k of ['titleMl', 'titleEn', 'venueMl', 'start', 'end', 'district'] as const) if (prev[k] !== doc[k]) diff[k] = [prev[k], doc[k]];
  await audit(user, !prev ? (status === 'published' ? 'publish' : 'create') : action === 'publish' && prev.status !== 'published' ? 'publish' : action === 'submit' ? 'submit' : 'update', 'event', eventId, { district: doc.district, summary: doc.titleMl, diff });
  return eventId;
}

/** Off the site (archived), back as a draft, or back to the district editor who sent it */
export async function changeEventStatus(user: AdminUser, id: number, change: 'archive' | 'restore' | 'send_back') {
  const db = await getDb();
  const ev = await loadEvent(user, id);
  if (!ev) throw new AdminError('This event could not be found.', 404);
  if (!can.archive(user, ev)) throw new AdminError('You can’t do that with this event.', 403);
  if (change === 'restore' && ev.status !== 'archived') throw new AdminError('This event isn’t archived.');
  if (change === 'send_back' && ev.status !== 'in_review') throw new AdminError('This event isn’t waiting for review.');
  await db.update(events).set({ status: change === 'archive' ? 'archived' : 'draft', updatedBy: user.id, updatedAt: sql`(datetime('now'))` }).where(eq(events.id, id));
  if (ev.status === 'published') {
    await syncEvent(id);
    await purge([...purgeTags.event(), ...((await isBanner(ev.slug)) ? purgeTags.banner() : [])]);
  }
  await audit(user, change, 'event', id, { district: ev.district, summary: ev.titleMl });
}

/** After the day: the news post that reports on it (or none) */
export async function linkReport(user: AdminUser, id: number, postId: number | null) {
  const db = await getDb();
  const ev = await loadEvent(user, id);
  if (!ev) throw new AdminError('This event could not be found.', 404);
  if (!can.publish(user, ev)) throw new AdminError('Your district admin links the report.', 403);
  if (postId) {
    const p = await db.select({ district: posts.district, status: posts.status }).from(posts).where(eq(posts.id, postId)).get();
    if (!p || p.status !== 'published') throw new AdminError('Pick a published news post.');
    if (!isState(user) && p.district !== user.district) throw new AdminError('Pick a post of your own district.', 403);
  }
  await db.update(events).set({ reportPostId: postId, updatedBy: user.id, updatedAt: sql`(datetime('now'))` }).where(eq(events.id, id));
  if (ev.status === 'published') await purge(purgeTags.event());
  await audit(user, postId ? 'link_report' : 'unlink_report', 'event', id, { district: ev.district, summary: ev.titleMl });
}

/** News posts that could be the report: those linked to this event first, then the district's newest */
export async function reportChoices(user: AdminUser, ev: EventRow) {
  const db = await getDb();
  return db.select({ id: posts.id, title: postTranslations.title, date: posts.publishedAt, linked: sql<number>`${posts.eventSlug} = ${ev.slug}` })
    .from(posts)
    .innerJoin(postTranslations, and(eq(postTranslations.postId, posts.id), eq(postTranslations.lang, 'ml')))
    // Posts linked to this event always; otherwise the event's district (state events: any post)
    .where(and(eq(posts.status, 'published'), or(eq(posts.eventSlug, ev.slug), ev.district ? eq(posts.district, ev.district) : isState(user) ? undefined : isNotNull(posts.district), ev.reportPostId ? eq(posts.id, ev.reportPostId) : undefined)))
    .orderBy(desc(sql`${posts.eventSlug} = ${ev.slug}`), desc(posts.publishedAt))
    .limit(40);
}
