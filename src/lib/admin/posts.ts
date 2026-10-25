// Posts in the admin (plan, section 10, "How a post is updated"). A post nobody can see yet (a
// draft, one waiting for review, an archived one) is edited in place. A published post is edited
// in a working copy (`post_drafts`) that autosave rewrites, and the live post changes only on
// Update. Publishing writes the post, keeps a copy in the history (`revisions`), updates the search
// index, purges the cached pages that show it and records it in the audit log. Every function
// checks the role rules (src/lib/admin/roles.ts) itself, whatever the page showed.
import { and, count, desc, eq, isNotNull, isNull, like, lte, ne, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { BatchItem } from 'drizzle-orm/batch';
import { getDb } from '~/db/client';
import { editLocks, media, postDrafts, posts, postTranslations, revisions, siteSettings, users } from '~/db/schema';
import { postEntry } from '~/lib/search-entries';
import { purgeTags } from '~/lib/cache';
import { slugify } from '~/lib/slug';
import { fileUrl } from '~/lib/content';
import { isEmptyBody, toRichDoc } from '~/lib/richtext';
import { audit } from './audit';
import { AdminError, purge, setSearch, sqlNow, todayIst } from './publish';
import { eventExists } from './events';
import { writeBanner } from './home';
import { can, isState, type AdminUser } from './roles';
import { cleanDoc, textHash, type EnState, type PostDoc } from './post-doc';

type Db = Awaited<ReturnType<typeof getDb>>;
const ml = alias(postTranslations, 'ml');
const en = alias(postTranslations, 'en');

export type PostStatus = 'draft' | 'in_review' | 'scheduled' | 'published' | 'archived';
export const statusLabels: Record<PostStatus, string> = {
  draft: 'Draft',
  in_review: 'Waiting for review',
  scheduled: 'Scheduled',
  published: 'Published',
  archived: 'Archived',
};
const LIVE: PostStatus[] = ['published', 'scheduled'];
export const isLive = (status: PostStatus) => LIVE.includes(status);

export { sqlNow, todayIst };

/** Unpublished posts hold a stand-in address until their first publish makes one from the title */
const placeholderSlug = (slug: string) => /^draft-[a-z0-9]+$/.test(slug);

export interface PostMeta {
  id: number;
  status: PostStatus;
  district: string | null;
  slug: string;
  publishedAt: string;
  createdBy: number | null;
  updatedAt: string;
  homeRequestedAt: string | null;
  legacyUrl: string | null;
}

export { AdminError };

// ── Reading ──────────────────────────────────────────────────────────────────────────────

async function bannerPostId(db: Db): Promise<number | null> {
  const row = await db.select({ value: siteSettings.value }).from(siteSettings).where(eq(siteSettings.key, 'home_banner')).get();
  const v = row?.value as { post?: number } | null | undefined;
  return v?.post ?? null;
}

/** The live post as an editor document, with what the editor needs to know about it */
async function readLive(db: Db, id: number): Promise<{ meta: PostMeta; doc: PostDoc } | null> {
  const r = await db
    .select({
      id: posts.id, status: posts.status, district: posts.district, slug: posts.slug, publishedAt: posts.publishedAt,
      createdBy: posts.createdBy, updatedAt: posts.updatedAt, homeRequestedAt: posts.homeRequestedAt, legacyUrl: posts.legacyUrl,
      topic: posts.topic, coverMediaId: posts.coverMediaId, eventSlug: posts.eventSlug, featured: posts.featuredOnHome,
      mlTitle: ml.title, mlSummary: ml.summary, mlBody: ml.body,
      enTitle: en.title, enSummary: en.summary, enBody: en.body, enSource: en.source, enBasedOn: en.basedOn,
    })
    .from(posts)
    .innerJoin(ml, and(eq(ml.postId, posts.id), eq(ml.lang, 'ml')))
    .leftJoin(en, and(eq(en.postId, posts.id), eq(en.lang, 'en')))
    .where(eq(posts.id, id))
    .get();
  if (!r) return null;
  const meta: PostMeta = {
    id: r.id, status: r.status, district: r.district, slug: r.slug, publishedAt: r.publishedAt, createdBy: r.createdBy,
    updatedAt: r.updatedAt, homeRequestedAt: r.homeRequestedAt, legacyUrl: r.legacyUrl,
  };
  const doc: PostDoc = {
    slug: placeholderSlug(r.slug) ? '' : r.slug,
    date: r.publishedAt,
    topic: r.topic,
    district: r.district,
    coverMediaId: r.coverMediaId,
    eventSlug: r.eventSlug,
    featured: r.featured,
    banner: (await bannerPostId(db)) === id,
    ml: { title: r.mlTitle, summary: r.mlSummary, body: toRichDoc(r.mlBody) },
    en: r.enTitle !== null
      ? { title: r.enTitle, summary: r.enSummary ?? '', body: toRichDoc(r.enBody), source: r.enSource ?? 'human', basedOn: r.enBasedOn ?? null }
      : null,
  };
  return { meta, doc };
}

export interface Cover { id: number; url: string; alt: string }

export async function coverInfo(id: number | null): Promise<Cover | null> {
  if (!id) return null;
  const db = await getDb();
  const m = await db.select({ id: media.id, r2Key: media.r2Key, sourceUrl: media.sourceUrl, alt: media.altMl, kind: media.kind }).from(media).where(eq(media.id, id)).get();
  const url = m && m.kind === 'image' ? fileUrl(m.r2Key, m.sourceUrl) : undefined;
  return m && url ? { id: m.id, url, alt: m.alt ?? '' } : null;
}

export interface EditorData {
  meta: PostMeta;
  doc: PostDoc;
  /** The live version, for the "unpublished changes" comparison */
  hasDraft: boolean;
  draftSavedAt: string | null;
  /** Someone else has it open: the editor opens read-only */
  lockedBy: string | null;
  /** Why this person can only read it, if they can't edit */
  readOnly: string | null;
}

/** Everything the editor page needs for one post, or null when this person may not open it */
export async function loadForEditor(user: AdminUser, id: number): Promise<EditorData | null> {
  const db = await getDb();
  const live = await readLive(db, id);
  if (!live || !can.edit(user, live.meta)) return null;
  const draft = await db.select({ doc: postDrafts.doc, at: postDrafts.updatedAt }).from(postDrafts).where(eq(postDrafts.postId, id)).get();
  let readOnly: string | null = null;
  if (user.role === 'district_editor' && live.meta.status !== 'draft') {
    readOnly = live.meta.status === 'in_review' ? 'Sent for review: your district admin publishes it or sends it back.' : 'Only your district admin can change a post once it is on the site.';
  }
  const lockedBy = readOnly ? null : await lock(db, id, user);
  return {
    meta: live.meta,
    doc: (draft?.doc as PostDoc | undefined) ?? live.doc,
    hasDraft: !!draft,
    draftSavedAt: draft?.at ?? null,
    lockedBy,
    readOnly: readOnly ?? (lockedBy ? `Being edited by ${lockedBy}. You can read it; editing opens when they close it.` : null),
  };
}

// ── Edit locks ("Being edited by …") ────────────────────────────────────────────────────

const LOCK_SECONDS = 90;

/** Take or renew this person's hold on the post; returns the other person's name if they hold it */
export async function lock(db: Db, id: number, user: AdminUser): Promise<string | null> {
  await db.delete(editLocks).where(sql`${editLocks.expiresAt} < ${sqlNow()}`);
  await db.insert(editLocks).values({ entity: 'post', entityId: id, userId: user.id, expiresAt: sqlNow(LOCK_SECONDS) }).onConflictDoNothing();
  const holder = await db
    .select({ userId: editLocks.userId, name: users.name })
    .from(editLocks)
    .leftJoin(users, eq(users.id, editLocks.userId))
    .where(and(eq(editLocks.entity, 'post'), eq(editLocks.entityId, id)))
    .get();
  if (!holder || holder.userId === user.id) {
    await db.update(editLocks).set({ expiresAt: sqlNow(LOCK_SECONDS) }).where(and(eq(editLocks.entity, 'post'), eq(editLocks.entityId, id), eq(editLocks.userId, user.id)));
    return null;
  }
  return holder.name ?? 'another admin';
}

/** The open editor's heartbeat: keeps this person's hold, or says who holds it now */
export async function heartbeat(user: AdminUser, id: number) {
  const db = await getDb();
  const live = await readLive(db, id);
  if (!live || !can.edit(user, live.meta)) throw new AdminError('Not found.', 404);
  return { lockedBy: await lock(db, id, user) };
}

export async function unlock(id: number, user: AdminUser) {
  const db = await getDb();
  await db.delete(editLocks).where(and(eq(editLocks.entity, 'post'), eq(editLocks.entityId, id), eq(editLocks.userId, user.id)));
}

// ── Writing ──────────────────────────────────────────────────────────────────────────────

/**
 * English stays approved only while its words are unchanged: any edit to it (by hand or a new AI
 * draft) makes it a draft again, so nothing reaches the English site without someone pressing
 * Approve English. Approving is a separate action (approveEnglish below).
 */
function keepEnSource(prev: PostDoc['en'], next: PostDoc['en']): PostDoc['en'] {
  if (!next || !next.title.trim()) return null;
  if (prev && prev.source !== 'ai_draft' && textHash(prev) === textHash(next)) return { ...next, source: prev.source, basedOn: prev.basedOn };
  return { ...next, source: 'ai_draft' };
}

/** Writes the document to the post and its translations, in one transaction */
async function writeLive(db: Db, id: number, doc: PostDoc, user: AdminUser, extra: { status?: PostStatus; publishedAt?: string; slug?: string } = {}) {
  const mlRow = { title: doc.ml.title, summary: doc.ml.summary, body: doc.ml.body, source: 'human' as const, textHash: textHash(doc.ml) };
  const stmts: BatchItem<'sqlite'>[] = [
    db.update(posts).set({
      topic: doc.topic,
      district: doc.district,
      coverMediaId: doc.coverMediaId,
      eventSlug: doc.eventSlug,
      featuredOnHome: doc.featured,
      ...(extra.status && { status: extra.status }),
      ...(extra.publishedAt && { publishedAt: extra.publishedAt }),
      ...(extra.slug && { slug: extra.slug }),
      updatedBy: user.id,
      updatedAt: sql`(datetime('now'))`,
    }).where(eq(posts.id, id)),
    db.insert(postTranslations).values({ postId: id, lang: 'ml', ...mlRow })
      .onConflictDoUpdate({ target: [postTranslations.postId, postTranslations.lang], set: mlRow }),
  ];
  if (doc.en) {
    const reviewed = doc.en.source !== 'ai_draft';
    const enRow = {
      title: doc.en.title, summary: doc.en.summary, body: doc.en.body, source: doc.en.source, basedOn: doc.en.basedOn, textHash: textHash(doc.en),
      ...(reviewed ? {} : { reviewedAt: null, reviewedBy: null }),
    };
    stmts.push(db.insert(postTranslations).values({ postId: id, lang: 'en', ...enRow })
      .onConflictDoUpdate({ target: [postTranslations.postId, postTranslations.lang], set: enRow }));
  } else {
    stmts.push(db.delete(postTranslations).where(and(eq(postTranslations.postId, id), eq(postTranslations.lang, 'en'))));
  }
  await db.batch(stmts as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
}

/** Search (plan, section 11): the post's row and index entry, or none when it's off the site */
async function syncSearch(db: Db, id: number) {
  const live = await readLive(db, id);
  if (!live || live.meta.status !== 'published') return setSearch('news', id, null);
  const { doc, meta } = live;
  const reviewedEn = doc.en && doc.en.source !== 'ai_draft' ? doc.en : null;
  await setSearch('news', id, postEntry({
    slug: meta.slug,
    date: meta.publishedAt,
    topic: doc.topic,
    district: doc.district,
    title: { ml: doc.ml.title, ...(reviewedEn && { en: reviewedEn.title }) },
    summary: { ml: doc.ml.summary, ...(reviewedEn && { en: reviewedEn.summary }) },
    body: { ml: doc.ml.body, en: reviewedEn?.body ?? null },
  }));
}

/** A free address in the post's year: /news/{year}/{slug} must point at one post */
async function uniqueSlug(db: Db, base: string, year: string, id: number) {
  let slug = base;
  for (let n = 2; ; n++) {
    const taken = await db.select({ id: posts.id }).from(posts)
      .where(and(eq(posts.slug, slug), sql`substr(${posts.publishedAt}, 1, 4) = ${year}`, ne(posts.id, id))).get();
    if (!taken) return slug;
    slug = `${base}-${n}`;
  }
}

/** What changed, for the audit log: titles and settings word for word, the text as a word count */
function changes(before: PostDoc | null, after: PostDoc) {
  const diff: Record<string, [unknown, unknown]> = {};
  const words = (d: PostDoc | null) => (d ? JSON.stringify(d.ml.body).length : 0);
  const pairs: [string, unknown, unknown][] = [
    ['title', before?.ml.title, after.ml.title],
    ['summary', before?.ml.summary, after.ml.summary],
    ['topic', before?.topic, after.topic],
    ['district', before?.district, after.district],
    ['cover', before?.coverMediaId, after.coverMediaId],
    ['event', before?.eventSlug, after.eventSlug],
    ['address', before?.slug, after.slug],
    ['date', before?.date, after.date],
    ['English title', before?.en?.title, after.en?.title],
  ];
  for (const [k, a, b] of pairs) if ((a ?? null) !== (b ?? null)) diff[k] = [a ?? null, b ?? null];
  if (before && JSON.stringify(before.ml.body) !== JSON.stringify(after.ml.body)) diff.text = [`${words(before)} characters`, `${words(after)} characters`];
  return diff;
}

const forcedDistrict = (user: AdminUser) => (isState(user) ? null : user.district);

async function parse(user: AdminUser, raw: unknown): Promise<PostDoc> {
  const doc = cleanDoc(raw, { forcedDistrict: forcedDistrict(user) });
  if (typeof doc === 'string') throw new AdminError(doc);
  if (doc.eventSlug && !(await eventExists(doc.eventSlug))) throw new AdminError('The linked event no longer exists. Choose another.');
  return doc;
}

async function mustEdit(db: Db, user: AdminUser, id: number) {
  const live = await readLive(db, id);
  if (!live) throw new AdminError('This post no longer exists.', 404);
  if (!can.edit(user, live.meta)) throw new AdminError('You can only change posts of your own district.', 403);
  if (user.role === 'district_editor' && live.meta.status !== 'draft') throw new AdminError('Only your district admin can change this post now.', 403);
  const holder = await lock(db, id, user);
  if (holder) throw new AdminError(`${holder} is editing this post. Your changes were not saved.`, 409);
  return live;
}

/** Feature flags follow the role: what a district role sends is replaced by what's stored */
function keepStateFlags(user: AdminUser, doc: PostDoc, prev: PostDoc): PostDoc {
  return can.feature(user) ? doc : { ...doc, featured: prev.featured, banner: prev.banner };
}

/** A new post, from the editor's first save. District roles always post to their own district. */
export async function createPost(user: AdminUser, raw: unknown) {
  const db = await getDb();
  const doc = await parse(user, raw);
  const tmp = `draft-${crypto.randomUUID().slice(0, 8)}`;
  const row = await db.insert(posts).values({
    slug: tmp, topic: doc.topic, district: doc.district, status: 'draft', publishedAt: todayIst(), coverMediaId: doc.coverMediaId,
    eventSlug: doc.eventSlug, featuredOnHome: can.feature(user) && doc.featured, createdBy: user.id, updatedBy: user.id,
  }).returning({ id: posts.id }).get();
  await db.update(posts).set({ slug: `draft-${row.id}` }).where(eq(posts.id, row.id));
  await writeLive(db, row.id, { ...doc, featured: can.feature(user) && doc.featured, banner: can.feature(user) && doc.banner, en: keepEnSource(null, doc.en) }, user);
  await lock(db, row.id, user);
  await audit(user, 'create', 'post', row.id, { district: doc.district, summary: doc.ml.title || 'Untitled post' });
  return row.id;
}

/** Autosave: the working copy of a published post, or the post itself while nobody can see it */
export async function savePost(user: AdminUser, id: number, raw: unknown) {
  const db = await getDb();
  const live = await mustEdit(db, user, id);
  const draft = await db.select({ doc: postDrafts.doc }).from(postDrafts).where(eq(postDrafts.postId, id)).get();
  const prev = (draft?.doc as PostDoc | undefined) ?? live.doc;
  let doc = await parse(user, raw);
  doc = keepStateFlags(user, { ...doc, en: keepEnSource(prev.en, doc.en) }, prev);
  if (isLive(live.meta.status)) {
    await db.insert(postDrafts).values({ postId: id, doc, updatedBy: user.id, updatedAt: sqlNow() })
      .onConflictDoUpdate({ target: postDrafts.postId, set: { doc, updatedBy: user.id, updatedAt: sqlNow() } });
  } else {
    await writeLive(db, id, doc, user);
  }
  return { doc, savedAt: sqlNow() };
}

/** Publish now, schedule, or update a post that's already on the site */
export async function publishPost(user: AdminUser, id: number, raw: unknown, scheduleAt?: string | null) {
  const db = await getDb();
  const live = await mustEdit(db, user, id);
  if (!can.publish(user, live.meta)) throw new AdminError('Your district admin publishes posts. Use Send for review.', 403);
  const draft = await db.select({ doc: postDrafts.doc }).from(postDrafts).where(eq(postDrafts.postId, id)).get();
  const prev = (draft?.doc as PostDoc | undefined) ?? live.doc;
  let doc = await parse(user, raw);
  doc = keepStateFlags(user, { ...doc, en: keepEnSource(prev.en, doc.en) }, prev);
  if (!doc.ml.title) throw new AdminError('Give the post a title before publishing.');
  if (isEmptyBody(doc.ml.body) && !doc.ml.summary) throw new AdminError('Write the text before publishing.');
  if (doc.coverMediaId) {
    const cover = await coverInfo(doc.coverMediaId);
    if (!cover) throw new AdminError('The cover photo could not be found. Choose it again.');
    if (!cover.alt.trim()) throw new AdminError('Describe the cover photo (for people using screen readers) before publishing.');
  }

  const wasLive = isLive(live.meta.status);
  let status: PostStatus = 'published';
  let date = wasLive ? doc.date : todayIst();
  if (scheduleAt) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(scheduleAt)) throw new AdminError('Pick a date and time to schedule it.');
    // The time is India time; compare in UTC
    if (new Date(`${scheduleAt}:00+05:30`).getTime() <= Date.now()) throw new AdminError('Pick a time in the future, or publish now.');
    status = 'scheduled';
    date = scheduleAt;
  }
  const keep = wasLive ? (doc.slug || live.meta.slug) : doc.slug;
  const slug = await uniqueSlug(db, keep || slugify(doc.ml.title) || `post-${id}`, date.slice(0, 4), id);
  const final: PostDoc = { ...doc, slug, date };

  // Crawled posts have no history yet: keep how they were before the first change
  if (wasLive) {
    const [{ n }] = await db.select({ n: count() }).from(revisions).where(and(eq(revisions.entity, 'post'), eq(revisions.entityId, id)));
    if (n === 0) await db.insert(revisions).values({ entity: 'post', entityId: id, doc: live.doc, note: 'Before the first change in the admin', userId: null, at: live.meta.updatedAt });
  }
  await writeLive(db, id, final, user, { status, publishedAt: date, slug });
  const after: Promise<unknown>[] = [db.delete(postDrafts).where(eq(postDrafts.postId, id))];
  // One lead story at a time
  if (final.featured) after.push(db.update(posts).set({ featuredOnHome: false }).where(and(eq(posts.featuredOnHome, true), ne(posts.id, id))));
  const banner = final.banner && can.feature(user) && status === 'published' && !live.doc.banner;
  if (live.meta.homeRequestedAt && final.featured) after.push(db.update(posts).set({ homeRequestedAt: null, homeRequestedBy: null }).where(eq(posts.id, id)));
  await Promise.all(after);
  const note = status === 'scheduled' ? `Scheduled for ${date.replace('T', ' ')}` : wasLive ? 'Updated' : 'Published';
  await db.insert(revisions).values({ entity: 'post', entityId: id, doc: final, note, userId: user.id });
  await syncSearch(db, id);
  await purge([...purgeTags.post(id), ...(live.doc.banner ? purgeTags.banner() : [])]);
  await audit(user, status === 'scheduled' ? 'schedule' : wasLive ? 'update' : 'publish', 'post', id, { district: final.district, summary: final.ml.title, diff: changes(wasLive ? live.doc : null, final) });
  // Through Home & banner's own writer, so the banner it replaces is kept in that screen's history
  if (banner) await writeBanner(user, { post: id });
  return { status, slug, date };
}

/** A district editor sends their draft to their district admin */
export async function submitPost(user: AdminUser, id: number, raw: unknown) {
  const db = await getDb();
  const live = await mustEdit(db, user, id);
  if (live.meta.status !== 'draft') throw new AdminError('Only a draft can be sent for review.');
  const doc = await parse(user, raw);
  if (!doc.ml.title) throw new AdminError('Give the post a title first.');
  await writeLive(db, id, { ...keepStateFlags(user, doc, live.doc), en: keepEnSource(live.doc.en, doc.en) }, user, { status: 'in_review' });
  await unlock(id, user);
  await audit(user, 'submit', 'post', id, { district: doc.district, summary: doc.ml.title });
}

/**
 * Scheduled posts whose time has come go live (the Cron Trigger in src/worker.ts runs this every
 * five minutes). They keep the day they were scheduled for as their date. Returns how many went live.
 */
export async function publishDuePosts() {
  const db = await getDb();
  // Scheduled times are India time, "2026-10-25T09:30", so they compare as text with this
  const now = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 16);
  const due = await db.select({ id: posts.id, at: posts.publishedAt, district: posts.district, title: postTranslations.title })
    .from(posts)
    .innerJoin(postTranslations, and(eq(postTranslations.postId, posts.id), eq(postTranslations.lang, 'ml')))
    .where(and(eq(posts.status, 'scheduled'), lte(posts.publishedAt, now)))
    .limit(50);
  for (const p of due) {
    await db.update(posts).set({ status: 'published', publishedAt: p.at.slice(0, 10), updatedAt: sql`(datetime('now'))` }).where(eq(posts.id, p.id));
    await syncSearch(db, p.id);
    await purge(purgeTags.post(p.id));
    await audit(null, 'publish_scheduled', 'post', p.id, { district: p.district, summary: p.title });
  }
  return due.length;
}

type Change = 'unpublish' | 'archive' | 'restore' | 'send_back';

/** Off the site (back to draft, or archived), back from the archive, or back to its writer */
export async function changeStatus(user: AdminUser, id: number, change: Change) {
  const db = await getDb();
  const live = await readLive(db, id);
  if (!live) throw new AdminError('This post no longer exists.', 404);
  if (!can.archive(user, live.meta)) throw new AdminError('You can’t do that with this post.', 403);
  const from = live.meta.status;
  const to: PostStatus = change === 'archive' ? 'archived' : 'draft';
  if (change === 'unpublish' && !isLive(from)) throw new AdminError('This post isn’t on the site.');
  if (change === 'restore' && from !== 'archived') throw new AdminError('This post isn’t archived.');
  if (change === 'send_back' && from !== 'in_review') throw new AdminError('This post isn’t waiting for review.');
  // A working copy becomes the post itself once nobody can see it
  const draft = await db.select({ doc: postDrafts.doc }).from(postDrafts).where(eq(postDrafts.postId, id)).get();
  if (draft) await writeLive(db, id, draft.doc as PostDoc, user);
  await db.batch([
    db.update(posts).set({ status: to, updatedBy: user.id, updatedAt: sql`(datetime('now'))` }).where(eq(posts.id, id)),
    db.delete(postDrafts).where(eq(postDrafts.postId, id)),
  ]);
  if (isLive(from)) {
    await syncSearch(db, id);
    await purge([...purgeTags.post(id), ...(live.doc.banner ? purgeTags.banner() : [])]);
  }
  await audit(user, change, 'post', id, { district: live.meta.district, summary: live.doc.ml.title });
  return { status: to };
}

/** Throws away the working copy of a published post; the live version stays */
export async function discardChanges(user: AdminUser, id: number) {
  const db = await getDb();
  const live = await mustEdit(db, user, id);
  await db.delete(postDrafts).where(eq(postDrafts.postId, id));
  await audit(user, 'discard', 'post', id, { district: live.meta.district, summary: live.doc.ml.title });
}

/** Approve English (plan, section 6): the English goes live (on a published post, at once) */
export async function approveEnglish(user: AdminUser, id: number, raw: unknown) {
  const db = await getDb();
  const live = await mustEdit(db, user, id);
  if (!can.approveEnglish(user, live.meta)) throw new AdminError('Your district admin approves English.', 403);
  const doc = await parse(user, raw);
  if (!doc.en?.title.trim()) throw new AdminError('There is no English to approve yet.');
  const approved: PostDoc['en'] = { ...doc.en, source: 'ai_reviewed', basedOn: textHash(doc.ml) };
  const enRow = { title: approved.title, summary: approved.summary, body: approved.body, source: 'ai_reviewed' as const, basedOn: approved.basedOn, textHash: textHash(approved), reviewedAt: sqlNow(), reviewedBy: user.id };
  if (isLive(live.meta.status)) {
    await db.insert(postTranslations).values({ postId: id, lang: 'en', ...enRow })
      .onConflictDoUpdate({ target: [postTranslations.postId, postTranslations.lang], set: enRow });
    // The working copy, if any, carries the approved English too
    const draft = await db.select({ doc: postDrafts.doc }).from(postDrafts).where(eq(postDrafts.postId, id)).get();
    if (draft) await db.update(postDrafts).set({ doc: { ...(draft.doc as PostDoc), en: approved } }).where(eq(postDrafts.postId, id));
    await syncSearch(db, id);
    await purge(purgeTags.post(id));
  } else {
    await writeLive(db, id, { ...keepStateFlags(user, doc, live.doc), en: approved }, user);
    await db.update(postTranslations).set({ reviewedAt: sqlNow(), reviewedBy: user.id }).where(and(eq(postTranslations.postId, id), eq(postTranslations.lang, 'en')));
  }
  await audit(user, 'approve_english', 'post', id, { district: live.meta.district, summary: approved.title });
  return { en: approved };
}

/** A district admin asks for a place on the home page; a state editor decides (Home & banner) */
export async function requestHome(user: AdminUser, id: number) {
  const db = await getDb();
  const live = await readLive(db, id);
  if (!live) throw new AdminError('This post no longer exists.', 404);
  if (!can.requestFeature(user) || !can.edit(user, live.meta)) throw new AdminError('Only a district admin can ask for this.', 403);
  await db.update(posts).set({ homeRequestedBy: user.id, homeRequestedAt: sqlNow() }).where(eq(posts.id, id));
  await audit(user, 'request_home', 'post', id, { district: live.meta.district, summary: live.doc.ml.title });
}

/** History: earlier versions of a post, newest first */
export async function postRevisions(user: AdminUser, id: number) {
  const db = await getDb();
  const live = await readLive(db, id);
  if (!live || !can.edit(user, live.meta)) throw new AdminError('Not found.', 404);
  return db
    .select({ id: revisions.id, note: revisions.note, at: revisions.at, by: users.name, title: sql<string>`json_extract(${revisions.doc}, '$.ml.title')` })
    .from(revisions)
    .leftJoin(users, eq(users.id, revisions.userId))
    .where(and(eq(revisions.entity, 'post'), eq(revisions.entityId, id)))
    .orderBy(desc(revisions.at), desc(revisions.id))
    .limit(50);
}

/** Puts an earlier version back into the editor; it goes live on Update, like any change */
export async function restoreRevision(user: AdminUser, id: number, revisionId: number) {
  const db = await getDb();
  const live = await mustEdit(db, user, id);
  const rev = await db.select({ doc: revisions.doc, at: revisions.at }).from(revisions)
    .where(and(eq(revisions.id, revisionId), eq(revisions.entity, 'post'), eq(revisions.entityId, id))).get();
  if (!rev) throw new AdminError('That version could not be found.', 404);
  const doc = await parse(user, rev.doc);
  if (isLive(live.meta.status)) {
    await db.insert(postDrafts).values({ postId: id, doc, updatedBy: user.id, updatedAt: sqlNow() })
      .onConflictDoUpdate({ target: postDrafts.postId, set: { doc, updatedBy: user.id, updatedAt: sqlNow() } });
  } else {
    await writeLive(db, id, doc, user);
  }
  await audit(user, 'restore_version', 'post', id, { district: live.meta.district, summary: `${doc.ml.title} (version of ${rev.at})` });
}

// ── Lists for the News screen and the dashboard ─────────────────────────────────────────

const enStateSql = sql<EnState>`CASE
  WHEN ${en.postId} IS NULL OR ${en.title} = '' THEN 'none'
  WHEN ${en.source} = 'ai_draft' THEN 'draft'
  WHEN ${en.basedOn} IS NOT NULL AND ${en.basedOn} != ${ml.textHash} THEN 'outdated'
  ELSE 'ok' END`;

/** Rows this person may see: district roles only their district */
const scope = (user: AdminUser) => (isState(user) ? undefined : eq(posts.district, user.district ?? '__none__'));

export interface ListFilter {
  status?: PostStatus | 'changes';
  topic?: string;
  /** A district slug, or 'state' */
  district?: string;
  english?: EnState;
  q?: string;
  mine?: boolean;
  /** Only posts a district admin asked to have on the home page */
  homeRequested?: boolean;
  offset?: number;
  limit?: number;
}

function listWhere(user: AdminUser, f: ListFilter): (SQL | undefined)[] {
  return [
    scope(user),
    f.status === 'changes' ? isNotNull(postDrafts.postId) : f.status ? eq(posts.status, f.status) : ne(posts.status, 'archived'),
    f.topic ? eq(posts.topic, f.topic) : undefined,
    f.district === 'state' ? isNull(posts.district) : f.district ? eq(posts.district, f.district) : undefined,
    f.english ? sql`${enStateSql} = ${f.english}` : undefined,
    f.q?.trim() ? or(like(ml.title, `%${f.q.trim()}%`), like(en.title, `%${f.q.trim()}%`)) : undefined,
    f.mine ? or(eq(posts.createdBy, user.id), eq(postDrafts.updatedBy, user.id)) : undefined,
    f.homeRequested ? isNotNull(posts.homeRequestedAt) : undefined,
  ];
}

export interface ListRow {
  id: number;
  title: string;
  status: PostStatus;
  topic: string;
  district: string | null;
  date: string;
  updatedAt: string;
  english: EnState;
  hasDraft: boolean;
  draftAt: string | null;
  homeRequested: boolean;
  slug: string;
  updatedBy: string | null;
}

/**
 * One page of posts for the admin's News list, last changed first. The title search scans titles
 * (the admin is the only reader, and it reads a page at a time); the site's search uses the index.
 */
export async function listPosts(user: AdminUser, f: ListFilter) {
  const db = await getDb();
  const where = and(...listWhere(user, f));
  const [rows, total] = await Promise.all([
    f.limit === 0 ? [] : db.select({
      id: posts.id, title: ml.title, status: posts.status, topic: posts.topic, district: posts.district, date: posts.publishedAt,
      updatedAt: posts.updatedAt, english: enStateSql, draftAt: postDrafts.updatedAt, homeRequestedAt: posts.homeRequestedAt, slug: posts.slug,
      updatedBy: users.name,
    })
      .from(posts)
      .innerJoin(ml, and(eq(ml.postId, posts.id), eq(ml.lang, 'ml')))
      .leftJoin(en, and(eq(en.postId, posts.id), eq(en.lang, 'en')))
      .leftJoin(postDrafts, eq(postDrafts.postId, posts.id))
      .leftJoin(users, eq(users.id, posts.updatedBy))
      .where(where)
      .orderBy(desc(sql`coalesce(${postDrafts.updatedAt}, ${posts.updatedAt})`), desc(posts.publishedAt), desc(posts.id))
      .limit(f.limit ?? 25)
      .offset(f.offset ?? 0),
    db.select({ n: count() }).from(posts)
      .innerJoin(ml, and(eq(ml.postId, posts.id), eq(ml.lang, 'ml')))
      .leftJoin(en, and(eq(en.postId, posts.id), eq(en.lang, 'en')))
      .leftJoin(postDrafts, eq(postDrafts.postId, posts.id))
      .where(where)
      .get(),
  ]);
  return {
    total: total?.n ?? 0,
    rows: rows.map((r): ListRow => ({
      id: r.id, title: r.title, status: r.status, topic: r.topic, district: r.district, date: r.date, updatedAt: r.updatedAt,
      english: r.english, hasDraft: !!r.draftAt, draftAt: r.draftAt, homeRequested: !!r.homeRequestedAt, slug: r.slug, updatedBy: r.updatedBy,
    })),
  };
}

/** How many posts each status tab holds under the other filters, plus "Unpublished changes" */
export async function statusCounts(user: AdminUser, f: ListFilter) {
  const db = await getDb();
  const [, , ...rest] = listWhere(user, { ...f, status: undefined });
  const where = and(scope(user), ...rest);
  const from = () => db.select({ status: posts.status, n: count() }).from(posts)
    .innerJoin(ml, and(eq(ml.postId, posts.id), eq(ml.lang, 'ml')))
    .leftJoin(en, and(eq(en.postId, posts.id), eq(en.lang, 'en')))
    .leftJoin(postDrafts, eq(postDrafts.postId, posts.id));
  const [byStatus, changes] = await Promise.all([
    from().where(where).groupBy(posts.status),
    from().where(and(where, isNotNull(postDrafts.postId))).get(),
  ]);
  const out = Object.fromEntries(byStatus.map((r) => [r.status, r.n])) as Partial<Record<PostStatus, number>>;
  const all = byStatus.filter((r) => r.status !== 'archived').reduce((s, r) => s + r.n, 0);
  return { ...out, all, changes: changes?.n ?? 0 };
}

/** The dashboard's numbers (plan, section 10): only the jobs this person does */
export async function dashboardCounts(user: AdminUser) {
  const n = async (f: ListFilter) => (await listPosts(user, { ...f, limit: 0 })).total;
  const [myDrafts, review, englishDraft, outdated, changes, sent] = await Promise.all([
    n({ status: 'draft', mine: true }),
    user.role === 'district_editor' ? 0 : n({ status: 'in_review' }),
    user.role === 'district_editor' ? 0 : n({ english: 'draft' }),
    user.role === 'district_editor' ? 0 : n({ english: 'outdated', status: 'published' }),
    n({ status: 'changes' }),
    user.role === 'district_editor' ? n({ status: 'in_review', mine: true }) : 0,
  ]);
  return { myDrafts, review, englishDraft, outdated, changes, sent };
}
