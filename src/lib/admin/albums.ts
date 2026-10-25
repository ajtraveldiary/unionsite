// Photo albums and videos in the admin (plan, sections 5 and 10; approved wireframe "Media", the
// Albums and Videos tabs). An album has a title, a district (fixed for district roles), a date and
// many photos, each with an optional caption; district admins and editors publish their own
// district's albums (plan, section 10's table). Videos come from the union's YouTube channel
// (synced from its public feed, by hand or every hour by the Cron Trigger) or are added by
// pasting a link; hidden ones stay off the site.
import { and, asc, count, desc, eq, inArray, max, ne, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { getDb } from '~/db/client';
import { albumItems, albums, media, users, videos } from '~/db/schema';
import { purgeTags } from '~/lib/cache';
import { slugify } from '~/lib/slug';
import { fileUrl, siteDetails, srcsetUrls } from '~/lib/content';
import { districtBySlug } from '~/data/districts';
import { audit } from './audit';
import { AdminError, purge, todayIst } from './publish';
import { isState, type AdminUser } from './roles';

const mayEdit = (user: AdminUser, district: string | null) => isState(user) || (!!district && district === user.district);

// ── Albums ──────────────────────────────────────────────────────────────────────────────

const thumb = (r2Key: string | null, src: string | null, srcset: string | null) => {
  const url = fileUrl(r2Key, src);
  if (!url) return null;
  const sizes = (srcset ? srcsetUrls(srcset, r2Key) : '').split(',').map((s) => s.trim().split(/\s+/)).filter(([, w]) => w?.endsWith('w')).map(([u, w]) => ({ u, w: parseInt(w) }));
  return sizes.filter((s) => s.w >= 300).sort((a, b) => a.w - b.w)[0]?.u ?? url;
};

export async function listAlbums(user: AdminUser) {
  const db = await getDb();
  const rows = await db.select({
    id: albums.id, titleMl: albums.titleMl, district: albums.district, eventDate: albums.eventDate, status: albums.status,
    r2Key: media.r2Key, src: media.sourceUrl, srcset: media.srcset,
    photos: sql<number>`(SELECT count(*) FROM album_items i WHERE i.album_id = "albums"."id")`,
  }).from(albums).leftJoin(media, eq(media.id, albums.coverMediaId))
    .where(and(ne(albums.status, 'archived'), isState(user) ? undefined : eq(albums.district, user.district ?? '')))
    .orderBy(desc(albums.eventDate), desc(albums.id)).limit(60);
  return rows.map(({ r2Key, src, srcset, ...r }) => ({ ...r, cover: thumb(r2Key, src, srcset) }));
}

export async function loadAlbum(user: AdminUser, id: number) {
  const db = await getDb();
  const a = await db.select().from(albums).where(eq(albums.id, id)).get();
  if (!a || !mayEdit(user, a.district)) return null;
  const items = await db.select({ mediaId: albumItems.mediaId, captionMl: albumItems.captionMl, captionEn: albumItems.captionEn, sortOrder: albumItems.sortOrder, alt: media.altMl, r2Key: media.r2Key, src: media.sourceUrl, srcset: media.srcset })
    .from(albumItems).innerJoin(media, eq(media.id, albumItems.mediaId)).where(eq(albumItems.albumId, id)).orderBy(asc(albumItems.sortOrder));
  return { ...a, items: items.map(({ r2Key, src, srcset, ...i }) => ({ ...i, thumb: thumb(r2Key, src, srcset) })) };
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export async function saveAlbum(user: AdminUser, id: number | null, input: Record<string, unknown>, status?: 'draft' | 'published' | 'archived') {
  const db = await getDb();
  const prev = id ? await db.select({ district: albums.district, status: albums.status, coverMediaId: albums.coverMediaId }).from(albums).where(eq(albums.id, id)).get() : null;
  if (id && (!prev || !mayEdit(user, prev.district))) throw new AdminError('This album could not be found.', 404);
  const titleMl = str(input.titleMl, 200);
  if (!titleMl) throw new AdminError('Give the album a title in Malayalam.');
  let district = str(input.district, 40) || null;
  if (district && !districtBySlug[district]) throw new AdminError('Unknown district.');
  if (!isState(user)) district = user.district;
  const eventDate = typeof input.eventDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.eventDate) ? input.eventDate : todayIst();
  const next = status ?? prev?.status ?? 'draft';
  // An album goes on the site only with photos in it (they are added after it is created)
  if (next === 'published') {
    const [{ n }] = id ? await db.select({ n: count() }).from(albumItems).where(eq(albumItems.albumId, id)) : [{ n: 0 }];
    if (!n) throw new AdminError('Add photos before publishing the album.');
  }
  const values = { titleMl, titleEn: str(input.titleEn, 200) || null, district, eventDate, status: next, updatedBy: user.id, updatedAt: sql`(datetime('now'))` };
  let albumId = id;
  if (albumId) await db.update(albums).set(values).where(eq(albums.id, albumId));
  else {
    const base = slugify(`${values.titleEn || titleMl} ${eventDate.slice(0, 4)}`, 8) || `album-${Date.now()}`;
    let slug = base;
    for (let n = 2; await db.select({ id: albums.id }).from(albums).where(eq(albums.slug, slug)).get(); n++) slug = `${base}-${n}`;
    albumId = (await db.insert(albums).values({ ...values, slug, createdBy: user.id }).returning({ id: albums.id }).get()).id;
  }
  if (next === 'published' || prev?.status === 'published') await purge(purgeTags.albums());
  await audit(user, !prev ? 'create' : prev.status !== next ? (next === 'published' ? 'publish' : next === 'archived' ? 'archive' : 'unpublish') : 'update', 'album', albumId, { district, summary: titleMl });
  return albumId;
}

async function mustEditAlbum(user: AdminUser, id: number) {
  const db = await getDb();
  const a = await db.select({ district: albums.district, status: albums.status, coverMediaId: albums.coverMediaId }).from(albums).where(eq(albums.id, id)).get();
  if (!a || !mayEdit(user, a.district)) throw new AdminError('This album could not be found.', 404);
  return a;
}

/** Adds uploaded photos (already in the library) to the end of the album; the first becomes its cover */
export async function addPhotos(user: AdminUser, id: number, mediaIds: number[], captions: Record<string, string> = {}) {
  const db = await getDb();
  const a = await mustEditAlbum(user, id);
  const ids = [...new Set(mediaIds.filter((m) => Number.isInteger(m) && m > 0))].slice(0, 200);
  if (!ids.length) return;
  const ok = await db.select({ id: media.id }).from(media).where(and(inArray(media.id, ids), eq(media.kind, 'image')));
  const last = await db.select({ n: max(albumItems.sortOrder) }).from(albumItems).where(eq(albumItems.albumId, id)).get();
  let n = last?.n ?? 0;
  const inserts: BatchItem<'sqlite'>[] = ok.map((m) => db.insert(albumItems).values({ albumId: id, mediaId: m.id, captionMl: str(captions[m.id], 300) || null, sortOrder: ++n }).onConflictDoNothing());
  if (inserts.length) await db.batch(inserts as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
  if (!a.coverMediaId && ok[0]) await db.update(albums).set({ coverMediaId: ok[0].id }).where(eq(albums.id, id));
  if (a.status === 'published') await purge(purgeTags.albums());
}

export async function updatePhoto(user: AdminUser, id: number, mediaId: number, input: { captionMl?: string; captionEn?: string; action?: string }) {
  const db = await getDb();
  const a = await mustEditAlbum(user, id);
  const where = and(eq(albumItems.albumId, id), eq(albumItems.mediaId, mediaId));
  if (input.action === 'remove') {
    await db.delete(albumItems).where(where);
    if (a.coverMediaId === mediaId) {
      const first = await db.select({ m: albumItems.mediaId }).from(albumItems).where(eq(albumItems.albumId, id)).orderBy(asc(albumItems.sortOrder)).limit(1).get();
      await db.update(albums).set({ coverMediaId: first?.m ?? null }).where(eq(albums.id, id));
    }
  } else if (input.action === 'cover') {
    await db.update(albums).set({ coverMediaId: mediaId }).where(eq(albums.id, id));
  } else if (input.action === 'up' || input.action === 'down') {
    const list = await db.select({ m: albumItems.mediaId }).from(albumItems).where(eq(albumItems.albumId, id)).orderBy(asc(albumItems.sortOrder));
    const ids = list.map((x) => x.m);
    const i = ids.indexOf(mediaId), j = input.action === 'up' ? i - 1 : i + 1;
    if (i >= 0 && j >= 0 && j < ids.length) {
      [ids[i], ids[j]] = [ids[j], ids[i]];
      const updates: BatchItem<'sqlite'>[] = ids.map((m, n) => db.update(albumItems).set({ sortOrder: n + 1 }).where(and(eq(albumItems.albumId, id), eq(albumItems.mediaId, m))));
      await db.batch(updates as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
    }
  } else {
    await db.update(albumItems).set({ captionMl: str(input.captionMl, 300) || null, captionEn: str(input.captionEn, 300) || null }).where(where);
  }
  if (a.status === 'published') await purge(purgeTags.albums());
}

// ── Videos ──────────────────────────────────────────────────────────────────────────────

/** The id in any YouTube link: watch?v=, youtu.be/, shorts/, embed/ */
export function youtubeId(link: string) {
  const m = link.trim().match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/);
  return m?.[1] ?? (/^[\w-]{11}$/.test(link.trim()) ? link.trim() : null);
}

export async function listVideos(user: AdminUser) {
  const db = await getDb();
  return db.select({ id: videos.id, youtubeId: videos.youtubeId, titleMl: videos.titleMl, titleEn: videos.titleEn, publishedAt: videos.publishedAt, district: videos.district, hidden: videos.hidden, source: videos.source, by: users.name })
    .from(videos).leftJoin(users, eq(users.id, videos.createdBy))
    .where(isState(user) ? undefined : eq(videos.district, user.district ?? ''))
    .orderBy(desc(videos.publishedAt), desc(videos.id)).limit(100);
}

/** Adds a video by its link; the title comes from YouTube (oEmbed) and can be changed later */
export async function addVideo(user: AdminUser, link: string, input: { titleMl?: string; district?: string }) {
  const id = youtubeId(link);
  if (!id) throw new AdminError('That isn’t a YouTube link.');
  const db = await getDb();
  if (await db.select({ id: videos.id }).from(videos).where(eq(videos.youtubeId, id)).get()) throw new AdminError('That video is already listed.');
  let title = str(input.titleMl, 300);
  if (!title) {
    try {
      const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`);
      if (r.ok) title = str(((await r.json()) as { title?: string }).title, 300);
    } catch { /* offline: ask for a title below */ }
  }
  if (!title) throw new AdminError('YouTube didn’t give the title. Type it, then add the video.');
  let district = str(input.district, 40) || null;
  if (district && !districtBySlug[district]) district = null;
  if (!isState(user)) district = user.district;
  await db.insert(videos).values({ youtubeId: id, titleMl: title, publishedAt: todayIst(), district, source: 'link', createdBy: user.id });
  await purge(purgeTags.videos());
  await audit(user, 'add_video', 'video', null, { district, summary: title });
}

export async function setVideo(user: AdminUser, id: number, change: { hidden?: boolean; titleMl?: string }) {
  const db = await getDb();
  const v = await db.select({ district: videos.district }).from(videos).where(eq(videos.id, id)).get();
  if (!v || !mayEdit(user, v.district)) throw new AdminError('That video could not be found.', 404);
  await db.update(videos).set({
    ...(change.hidden !== undefined && { hidden: change.hidden }),
    ...(change.titleMl && { titleMl: str(change.titleMl, 300) }),
    updatedAt: sql`(datetime('now'))`,
  }).where(eq(videos.id, id));
  await purge(purgeTags.videos());
  await audit(user, change.hidden === undefined ? 'update_video' : change.hidden ? 'hide_video' : 'show_video', 'video', id, { district: v.district, summary: change.titleMl ?? `Video ${id}` });
}

/**
 * New videos from the union's channel (its public feed lists the latest 15): any not listed yet are
 * added, shown on the site. The Cron Trigger runs this every hour; "Sync now" runs it on demand.
 */
export async function syncChannel(user: AdminUser | null) {
  if (user && !isState(user)) throw new AdminError('The state office syncs the channel.', 403);
  const channel = (await siteDetails()).youtube.match(/channel\/(UC[\w-]+)/)?.[1];
  if (!channel) throw new AdminError('The channel link in site settings has no channel id.');
  let xml: string;
  try {
    const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channel}`);
    if (!r.ok) throw new Error(String(r.status));
    xml = await r.text();
  } catch {
    throw new AdminError('YouTube could not be reached. Try again later.');
  }
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => ({
    id: m[1].match(/<yt:videoId>([\w-]{11})<\/yt:videoId>/)?.[1],
    title: m[1].match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
    published: m[1].match(/<published>(\d{4}-\d{2}-\d{2})/)?.[1],
  })).filter((e) => e.id && e.title && e.published);
  const db = await getDb();
  const known = new Set((await db.select({ y: videos.youtubeId }).from(videos).where(inArray(videos.youtubeId, entries.map((e) => e.id!)))).map((r) => r.y));
  const fresh = entries.filter((e) => !known.has(e.id!));
  for (const e of fresh) await db.insert(videos).values({ youtubeId: e.id!, titleMl: e.title!.slice(0, 300), publishedAt: e.published!, source: 'channel', createdBy: user?.id ?? null }).onConflictDoNothing();
  if (fresh.length) await purge(purgeTags.videos());
  if (user || fresh.length) await audit(user, 'sync_videos', 'video', null, { summary: `${fresh.length} new from the channel` });
  return fresh.length;
}

