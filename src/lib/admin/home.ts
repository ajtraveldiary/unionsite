// The home page's banner and lead story (plan, sections 8 and 10; approved wireframe "Home &
// banner"). The banner is one published news post or event, with an optional shorter headline;
// it stays until someone replaces or removes it. Every change keeps the banner it replaced in the
// history (`revisions`, entity "banner"), so it can be shown again. The lead story is the post
// ticked "Lead story in Top news" (one at a time); without one, Top news leads with the newest post.
// Only state roles change either; district admins ask from a post's settings.
import { and, desc, eq, isNotNull, like, sql } from 'drizzle-orm';
import { getDb } from '~/db/client';
import { events, posts, postTranslations, revisions, siteSettings, users } from '~/db/schema';
import { purgeTags } from '~/lib/cache';
import type { L10n } from '~/lib/types';
import { audit } from './audit';
import { AdminError, purge } from './publish';
import { can, type AdminUser } from './roles';

export interface BannerValue {
  post?: number;
  event?: string;
  headline?: L10n;
  /** When and by whom it was set (sqlite UTC time, user id) */
  setAt?: string;
  setBy?: number;
}

type Db = Awaited<ReturnType<typeof getDb>>;

export function mustFeature(user: AdminUser) {
  if (!can.feature(user)) throw new AdminError('The home page is managed by the state office.', 403);
}

export async function bannerValue(db?: Db): Promise<BannerValue | null> {
  const d = db ?? (await getDb());
  const row = await d.select({ value: siteSettings.value }).from(siteSettings).where(eq(siteSettings.key, 'home_banner')).get();
  return (row?.value as BannerValue | null | undefined) ?? null;
}

/** The title of what a banner value points at, for the history and confirmations */
async function bannerTitle(db: Db, v: BannerValue | null) {
  if (!v) return null;
  if (v.post) {
    const r = await db.select({ t: postTranslations.title }).from(postTranslations).where(and(eq(postTranslations.postId, v.post), eq(postTranslations.lang, 'ml'))).get();
    return r?.t ?? null;
  }
  if (v.event) return (await db.select({ t: events.titleMl }).from(events).where(eq(events.slug, v.event)).get())?.t ?? null;
  return null;
}

/**
 * Writes the banner (or removes it, `next` null), keeping the one it replaces in the history, then
 * purges the home page. The post editor's "Show in the home banner" comes through here too.
 */
export async function writeBanner(user: AdminUser, next: Omit<BannerValue, 'setAt' | 'setBy'> | null) {
  const db = await getDb();
  const prev = await bannerValue(db);
  if (prev) await db.insert(revisions).values({ entity: 'banner', entityId: 0, doc: prev, note: (await bannerTitle(db, prev)) ?? 'Banner', userId: prev.setBy ?? null });
  if (next) {
    const value: BannerValue = { ...next, setAt: new Date().toISOString().replace('T', ' ').slice(0, 19), setBy: user.id };
    await db.insert(siteSettings).values({ key: 'home_banner', value })
      .onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedAt: sql`(datetime('now'))` } });
  } else {
    await db.delete(siteSettings).where(eq(siteSettings.key, 'home_banner'));
  }
  // The banner's item leaves Top news and Coming up, so lists that show it change too
  await purge([...purgeTags.banner(), ...purgeTags.event(), 'posts']);
  await audit(user, next ? 'set_banner' : 'remove_banner', next?.post ? 'post' : next?.event ? 'event' : 'banner', next?.post ?? null, { summary: (await bannerTitle(db, next)) ?? 'Banner removed' });
}

const headline = (ml: unknown, en: unknown): L10n | undefined => {
  const m = typeof ml === 'string' ? ml.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  const e = typeof en === 'string' ? en.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  return m ? { ml: m, ...(e && { en: e }) } : undefined;
};

/** Puts a published post or event in the banner, with an optional shorter headline */
export async function setBanner(user: AdminUser, input: { kind: string; post?: unknown; event?: unknown; headlineMl?: unknown; headlineEn?: unknown }) {
  mustFeature(user);
  const db = await getDb();
  const hl = headline(input.headlineMl, input.headlineEn);
  if (input.kind === 'event') {
    const slug = String(input.event ?? '');
    const ev = await db.select({ status: events.status }).from(events).where(eq(events.slug, slug)).get();
    if (!ev || ev.status !== 'published') throw new AdminError('Pick a published event.');
    return writeBanner(user, { event: slug, ...(hl && { headline: hl }) });
  }
  const id = Number(input.post);
  const p = Number.isInteger(id) ? await db.select({ status: posts.status }).from(posts).where(eq(posts.id, id)).get() : undefined;
  if (!p || p.status !== 'published') throw new AdminError('Pick a published news post.');
  return writeBanner(user, { post: id, ...(hl && { headline: hl }) });
}

/** A shorter headline for the banner that's up now */
export async function setHeadline(user: AdminUser, ml: unknown, en: unknown) {
  mustFeature(user);
  const db = await getDb();
  const now = await bannerValue(db);
  if (!now) throw new AdminError('There is no banner now.');
  const { setAt: _a, setBy: _b, headline: _h, ...item } = now;
  const hl = headline(ml, en);
  const value: BannerValue = { ...item, ...(hl && { headline: hl }), setAt: now.setAt, setBy: now.setBy };
  await db.update(siteSettings).set({ value, updatedAt: sql`(datetime('now'))` }).where(eq(siteSettings.key, 'home_banner'));
  await purge(purgeTags.banner());
  await audit(user, 'edit_banner', 'banner', null, { summary: hl?.ml ?? 'Headline removed' });
}

/** Banners that were up before, newest first, for "Show again" */
export async function pastBanners(user: AdminUser) {
  mustFeature(user);
  const db = await getDb();
  return db.select({ id: revisions.id, doc: revisions.doc, title: revisions.note, at: revisions.at, by: users.name })
    .from(revisions).leftJoin(users, eq(users.id, revisions.userId))
    .where(eq(revisions.entity, 'banner')).orderBy(desc(revisions.at), desc(revisions.id)).limit(10);
}

export async function showAgain(user: AdminUser, revisionId: number) {
  mustFeature(user);
  const db = await getDb();
  const rev = await db.select({ doc: revisions.doc }).from(revisions).where(and(eq(revisions.id, revisionId), eq(revisions.entity, 'banner'))).get();
  if (!rev) throw new AdminError('That banner could not be found.', 404);
  const v = rev.doc as BannerValue;
  return setBanner(user, { kind: v.event ? 'event' : 'post', post: v.post, event: v.event, headlineMl: v.headline?.ml, headlineEn: v.headline?.en });
}

// ── Lead story and requests ───────────────────────────────────────────────────────────

/** The post leading Top news: the newest one ticked "Lead story", or none (then the newest post leads) */
export async function leadPost() {
  const db = await getDb();
  return db.select({ id: posts.id, title: postTranslations.title, date: posts.publishedAt })
    .from(posts).innerJoin(postTranslations, and(eq(postTranslations.postId, posts.id), eq(postTranslations.lang, 'ml')))
    .where(and(eq(posts.status, 'published'), eq(posts.featuredOnHome, true)))
    .orderBy(desc(posts.publishedAt)).limit(1).get();
}

/** Makes one post the lead story (clearing any other), or clears it (`postId` null) */
export async function setLead(user: AdminUser, postId: number | null) {
  mustFeature(user);
  const db = await getDb();
  if (postId) {
    const p = await db.select({ status: posts.status }).from(posts).where(eq(posts.id, postId)).get();
    if (!p || p.status !== 'published') throw new AdminError('Pick a published news post.');
    // The home page never shows a story twice: the banner's post appears only in the banner
    if ((await bannerValue(db))?.post === postId) throw new AdminError('This post is in the banner, so the home page shows it only there. Pick another lead story.');
  }
  await db.update(posts).set({ featuredOnHome: false }).where(eq(posts.featuredOnHome, true));
  if (postId) await db.update(posts).set({ featuredOnHome: true, homeRequestedAt: null, homeRequestedBy: null }).where(eq(posts.id, postId));
  await purge(['posts']);
  await audit(user, postId ? 'set_lead' : 'clear_lead', 'post', postId, { summary: postId ? ((await db.select({ t: postTranslations.title }).from(postTranslations).where(and(eq(postTranslations.postId, postId), eq(postTranslations.lang, 'ml'))).get())?.t ?? '') : 'Lead story cleared' });
}

/** Posts district admins asked to have on the home page */
export async function homeRequests() {
  const db = await getDb();
  return db.select({ id: posts.id, title: postTranslations.title, district: posts.district, at: posts.homeRequestedAt, by: users.name, status: posts.status })
    .from(posts).innerJoin(postTranslations, and(eq(postTranslations.postId, posts.id), eq(postTranslations.lang, 'ml')))
    .leftJoin(users, eq(users.id, posts.homeRequestedBy))
    .where(isNotNull(posts.homeRequestedAt)).orderBy(desc(posts.homeRequestedAt)).limit(20);
}

export async function declineRequest(user: AdminUser, postId: number) {
  mustFeature(user);
  const db = await getDb();
  await db.update(posts).set({ homeRequestedAt: null, homeRequestedBy: null }).where(eq(posts.id, postId));
  await audit(user, 'decline_home', 'post', postId, { summary: 'Home page request declined' });
}

/** Banner and lead candidates: published posts whose title contains `q`, newest first */
export async function findPosts(q: string) {
  const db = await getDb();
  return db.select({ id: posts.id, title: postTranslations.title, date: posts.publishedAt, topic: posts.topic, district: posts.district })
    .from(posts).innerJoin(postTranslations, and(eq(postTranslations.postId, posts.id), eq(postTranslations.lang, 'ml')))
    .where(and(eq(posts.status, 'published'), q.trim() ? like(postTranslations.title, `%${q.trim()}%`) : undefined))
    .orderBy(desc(posts.publishedAt), desc(posts.id)).limit(12);
}
