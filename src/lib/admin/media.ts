// Photos in the admin (plan, section 9, "Media and thumbnails"). The browser does the heavy work
// before upload (src/lib/admin/image-prep.ts): WebP (or JPEG) at the standard widths, EXIF and GPS
// stripped, a SHA-256 of the original. The Worker checks each file and stores them in R2 under one id
// (images/{yyyy}/{mm}/{id}/{width}.webp), so their URLs never change and are cached for a year. The
// same photo uploaded twice reuses the first copy. Every upload needs a description (alt text).
import { and, desc, eq, like, lt, sql } from 'drizzle-orm';
import { getD1, getDb } from '~/db/client';
import { media } from '~/db/schema';
import { fileUrl, srcsetUrls } from '~/lib/content';
import { audit } from './audit';
import { AdminError, purge } from './publish';
import { isState, type AdminUser } from './roles';

/** The sizes the browser makes (plan, section 9); `master` is the 2560 px copy kept for later sizes */
export const WIDTHS = [320, 640, 960, 1280, 1920] as const;
const MAX_FILE = 15 * 1024 * 1024;

export interface MediaItem {
  id: number;
  url: string;
  /** A small size for grids */
  thumb: string;
  alt: string;
  width: number | null;
  height: number | null;
}

async function bucket() {
  return (await import('cloudflare:workers')).env.MEDIA;
}

/** The smallest listed size at least `min` px wide, else the main file */
function pick(srcset: string | null, src: string, min: number) {
  const sizes = (srcset ?? '').split(',').map((s) => s.trim().split(/\s+/)).filter(([, w]) => w?.endsWith('w')).map(([url, w]) => ({ url, w: parseInt(w) }));
  return sizes.filter((s) => s.w >= min).sort((a, b) => a.w - b.w)[0]?.url ?? src;
}

const columns = { id: media.id, r2Key: media.r2Key, sourceUrl: media.sourceUrl, srcset: media.srcset, alt: media.altMl, width: media.width, height: media.height };
type Row = { id: number; r2Key: string | null; sourceUrl: string | null; srcset: string | null; alt: string | null; width: number | null; height: number | null };

function toItem(r: Row): MediaItem | null {
  const url = fileUrl(r.r2Key, r.sourceUrl);
  if (!url) return null;
  const srcset = r.srcset ? srcsetUrls(r.srcset, r.r2Key) : null;
  return { id: r.id, url, thumb: pick(srcset, url, 300), alt: r.alt ?? '', width: r.width, height: r.height };
}

/** Newest images first, a page at a time, optionally those whose description contains `q` */
export async function listImages(q: string, before?: number) {
  const db = await getDb();
  const rows = await db.select(columns).from(media)
    .where(and(eq(media.kind, 'image'), q.trim() ? like(media.altMl, `%${q.trim()}%`) : undefined, before ? lt(media.id, before) : undefined))
    .orderBy(desc(media.id))
    .limit(30);
  return rows.map(toItem).filter((x): x is MediaItem => !!x);
}

/** One photo's description (alt text), set from the editor */
export async function setAlt(user: AdminUser, id: number, alt: string) {
  const db = await getDb();
  const text = alt.replace(/\s+/g, ' ').trim().slice(0, 300);
  const row = await db.update(media).set({ altMl: text, updatedAt: sql`(datetime('now'))` }).where(and(eq(media.id, id), eq(media.kind, 'image'))).returning(columns).get();
  if (!row) throw new AdminError('That photo could not be found.', 404);
  await audit(user, 'describe', 'media', id, { summary: text });
  return toItem(row);
}

/**
 * Stores one photo from the browser: `w320` … `w1920` and `master` files, plus `sha256`, `width`,
 * `height` and `alt`. Only WebP or JPEG is accepted, because the browser has already converted it.
 */
export async function uploadImage(user: AdminUser, form: FormData): Promise<MediaItem> {
  const db = await getDb();
  const sha = String(form.get('sha256') ?? '');
  if (!/^[0-9a-f]{64}$/.test(sha)) throw new AdminError('The upload was incomplete. Try again.');
  const alt = String(form.get('alt') ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);

  const existing = await db.select(columns).from(media).where(and(eq(media.sha256, sha), eq(media.kind, 'image'))).get();
  if (existing) {
    // Same photo again: reuse it, and fill in a description if it had none
    if (alt && !existing.alt) await db.update(media).set({ altMl: alt }).where(eq(media.id, existing.id));
    return toItem({ ...existing, alt: existing.alt || alt })!;
  }

  const { files, width, height } = readImageFiles(form);
  const row = await db.insert(media).values({ kind: 'image', sha256: sha, altMl: alt || null, width, height, uploadedBy: user.id, bytes: files.reduce((n, f) => n + f.file.size, 0) }).returning({ id: media.id }).get();
  const stored = await putImageFiles(monthDir('images', `${row.id}`), files);
  const saved = await db.update(media).set(stored).where(eq(media.id, row.id)).returning(columns).get();
  await audit(user, 'upload', 'media', row.id, { district: user.district, summary: alt || 'Photo' });
  return toItem(saved)!;
}

type ImageFile = { name: string; file: File };

/** The prepared sizes in an upload form, checked */
function readImageFiles(form: FormData) {
  const files: ImageFile[] = [];
  for (const name of ['master', ...WIDTHS.map((w) => `w${w}`)]) {
    const f = form.get(name);
    if (!(f instanceof File)) continue;
    if (f.type !== 'image/webp' && f.type !== 'image/jpeg') throw new AdminError('Only photos prepared by the admin can be uploaded.');
    if (f.size > MAX_FILE) throw new AdminError('That photo is too large (15 MB at most).');
    files.push({ name, file: f });
  }
  if (!files.some((f) => f.name !== 'master')) throw new AdminError('The upload had no photo in it.');
  return { files, width: Math.round(Number(form.get('width'))) || null, height: Math.round(Number(form.get('height'))) || null };
}

/** images/2026/10/{name}: a folder of its own, so the files' addresses never change */
const monthDir = (root: 'images' | 'pdfs', name: string) => {
  const now = new Date();
  return `${root}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${name}`;
};

/** Stores the sizes in R2; returns the main file (the largest up to 1920 px) and srcset, as keys */
async function putImageFiles(dir: string, files: ImageFile[]) {
  // WebP from most browsers, JPEG from those that can't make WebP (src/lib/admin/image-prep.ts)
  const ext = files[0].file.type === 'image/jpeg' ? 'jpg' : 'webp';
  const key = (name: string) => `${dir}/${name === 'master' ? 'master' : name.slice(1)}.${ext}`;
  const r2 = await bucket();
  await Promise.all(files.map(({ name, file }) => r2.put(key(name), file.stream(), {
    httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' },
  })));
  const sizes = files.filter((f) => f.name !== 'master').sort((a, b) => Number(b.name.slice(1)) - Number(a.name.slice(1)));
  return { r2Key: key(sizes[0].name), srcset: [...sizes].reverse().map((s) => `${key(s.name)} ${s.name.slice(1)}w`).join(', ') };
}

// ── PDFs (orders, Kerala Service) ───────────────────────────────────────────────────────

const MAX_PDF = 50 * 1024 * 1024;

export interface PdfItem {
  id: number;
  url: string;
  bytes: number;
  /** The same file was uploaded before: this is that copy */
  existing: boolean;
}

/**
 * Stores one PDF from the browser (fields `file`, `sha256`, optional `pages`) in R2 under
 * pdfs/{yyyy}/{mm}/{id}.pdf. The same file uploaded twice reuses the first copy. Text and page
 * count are read in the browser (src/lib/admin/pdf-read.ts); only the file comes through here.
 */
export async function uploadPdf(user: AdminUser, form: FormData): Promise<PdfItem> {
  if (!isState(user)) throw new AdminError('Orders and Kerala Service are managed by the state office.', 403);
  const db = await getDb();
  const file = form.get('file');
  if (!(file instanceof File)) throw new AdminError('The upload had no PDF in it.');
  if (file.size > MAX_PDF) throw new AdminError('That PDF is larger than 50 MB.');
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  if (String.fromCharCode(...head) !== '%PDF-') throw new AdminError('That file is not a PDF.');
  const sha = String(form.get('sha256') ?? '');
  if (!/^[0-9a-f]{64}$/.test(sha)) throw new AdminError('The upload was incomplete. Try again.');

  const existing = await db.select({ id: media.id, r2Key: media.r2Key, sourceUrl: media.sourceUrl, bytes: media.bytes }).from(media).where(and(eq(media.sha256, sha), eq(media.kind, 'pdf'))).get();
  if (existing) return { id: existing.id, url: fileUrl(existing.r2Key, existing.sourceUrl) ?? '', bytes: existing.bytes ?? file.size, existing: true };

  const row = await db.insert(media).values({ kind: 'pdf', sha256: sha, bytes: file.size, uploadedBy: user.id }).returning({ id: media.id }).get();
  const now = new Date();
  const key = `pdfs/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${row.id}.pdf`;
  await (await bucket()).put(key, file.stream(), { httpMetadata: { contentType: 'application/pdf', cacheControl: 'public, max-age=31536000, immutable' } });
  await db.update(media).set({ r2Key: key }).where(eq(media.id, row.id));
  await audit(user, 'upload', 'media', row.id, { summary: file.name.slice(0, 200) || 'PDF' });
  return { id: row.id, url: fileUrl(key, null)!, bytes: file.size, existing: false };
}

// ── The library (Admin → Media) ─────────────────────────────────────────────────────────

/** How many places use a file: post covers, orders, Kerala Service, people, albums, documents, districts.
 * (Photos inside an article's text are not counted.) */
// The outer row's id, written out in full: Drizzle leaves a lone table's columns unqualified, and
// a bare "id" inside these subqueries would mean each subquery's own table
const mediaId = sql.raw('"media"."id"');
const usageSql = sql<number>`(
  (SELECT count(*) FROM posts WHERE cover_media_id = ${mediaId}) +
  (SELECT count(*) FROM orders WHERE pdf_media_id = ${mediaId}) +
  (SELECT count(*) FROM magazine_issues WHERE cover_media_id = ${mediaId} OR pdf_media_id = ${mediaId}) +
  (SELECT count(*) FROM people WHERE photo_media_id = ${mediaId}) +
  (SELECT count(*) FROM album_items WHERE media_id = ${mediaId}) +
  (SELECT count(*) FROM albums WHERE cover_media_id = ${mediaId}) +
  (SELECT count(*) FROM documents WHERE pdf_media_id = ${mediaId}) +
  (SELECT count(*) FROM district_extras WHERE cover_media_id = ${mediaId}))`;

export interface LibraryItem extends MediaItem {
  kind: 'image' | 'pdf' | 'other';
  bytes: number | null;
  uses: number;
  uploaded: boolean;
  createdAt: string;
}

export async function listLibrary(f: { q?: string; kind?: 'image' | 'pdf'; missing?: boolean; before?: number }) {
  const db = await getDb();
  const rows = await db.select({ ...columns, kind: media.kind, bytes: media.bytes, createdAt: media.createdAt, uses: usageSql }).from(media)
    .where(and(
      f.kind ? eq(media.kind, f.kind) : undefined,
      f.q?.trim() ? like(media.altMl, `%${f.q.trim()}%`) : undefined,
      f.missing ? and(eq(media.kind, 'image'), sql`coalesce(${media.altMl}, '') = ''`) : undefined,
      f.before ? lt(media.id, f.before) : undefined,
    ))
    .orderBy(desc(media.id)).limit(40);
  return rows.map((r): LibraryItem | null => {
    const url = fileUrl(r.r2Key, r.sourceUrl);
    if (!url) return null;
    const item = r.kind === 'image' ? toItem(r)! : { id: r.id, url, thumb: url, alt: r.alt ?? '', width: r.width, height: r.height };
    return { ...item, kind: r.kind, bytes: r.bytes, uses: r.uses, uploaded: !!r.r2Key, createdAt: r.createdAt };
  }).filter((x): x is LibraryItem => !!x);
}

/** Where a file is used, as links into the admin */
export async function mediaUsage(id: number) {
  const d1 = await getD1();
  const q = (sqlText: string) => d1.prepare(sqlText).bind(id).all<{ label: string; href: string }>().then((r) => r.results);
  const lists = await Promise.all([
    q(`SELECT 'Post: ' || t.title AS label, '/admin/news/' || p.id AS href FROM posts p JOIN post_translations t ON t.post_id = p.id AND t.lang = 'ml' WHERE p.cover_media_id = ?1 LIMIT 20`),
    q(`SELECT 'Order: ' || title_en AS label, '/admin/orders/' || id AS href FROM orders WHERE pdf_media_id = ?1`),
    q(`SELECT 'Kerala Service ' || year || '-' || month AS label, '/admin/kerala-service/' || id AS href FROM magazine_issues WHERE cover_media_id = ?1 OR pdf_media_id = ?1`),
    q(`SELECT 'Person: ' || name_ml AS label, '/admin/people' AS href FROM people WHERE photo_media_id = ?1`),
    q(`SELECT 'Album: ' || a.title_ml AS label, '/admin/media/albums/' || a.id AS href FROM albums a WHERE a.cover_media_id = ?1 OR a.id IN (SELECT album_id FROM album_items WHERE media_id = ?1)`),
    q(`SELECT 'Document: ' || title_ml AS label, '/admin/pages?tab=documents' AS href FROM documents WHERE pdf_media_id = ?1`),
    q(`SELECT 'District cover: ' || district AS label, '/admin/districts/' || district AS href FROM district_extras WHERE cover_media_id = ?1`),
  ]);
  return lists.flat();
}

/** Whether this person may replace a file used across the site: the state office, or whoever uploaded it */
async function mayReplace(user: AdminUser, id: number) {
  const db = await getDb();
  const m = await db.select({ kind: media.kind, uploadedBy: media.uploadedBy, r2Key: media.r2Key, srcset: media.srcset }).from(media).where(eq(media.id, id)).get();
  if (!m) throw new AdminError('That file could not be found.', 404);
  if (!isState(user) && m.uploadedBy !== user.id) throw new AdminError('Only the state office, or whoever uploaded it, can replace this file.', 403);
  return m;
}

/** The R2 keys of a stored file (every size, and the master copy of a photo) */
function keysOf(m: { r2Key: string | null; srcset: string | null }) {
  if (!m.r2Key) return [];
  if (m.r2Key.startsWith('pdfs/')) return [m.r2Key];
  const dir = m.r2Key.slice(0, m.r2Key.lastIndexOf('/'));
  const ext = m.r2Key.slice(m.r2Key.lastIndexOf('.'));
  return [...new Set([m.r2Key, `${dir}/master${ext}`, ...(m.srcset ?? '').split(',').map((s) => s.trim().split(/\s+/)[0]).filter(Boolean)])];
}

/**
 * "Replace file": a new photo (prepared like any upload) or PDF takes the file's place everywhere
 * it is used. The new files get new addresses (so caches never show the old one); the old files go.
 */
export async function replaceFile(user: AdminUser, id: number, form: FormData) {
  const db = await getDb();
  const old = await mayReplace(user, id);
  const stamp = Date.now().toString(36);
  if (old.kind === 'image') {
    const { files, width, height } = readImageFiles(form);
    const stored = await putImageFiles(monthDir('images', `${id}-${stamp}`), files);
    await db.update(media).set({ ...stored, width, height, sourceUrl: null, sha256: String(form.get('sha256') ?? '') || null, bytes: files.reduce((n, f) => n + f.file.size, 0), updatedAt: sql`(datetime('now'))` }).where(eq(media.id, id));
  } else if (old.kind === 'pdf') {
    const file = form.get('file');
    if (!(file instanceof File)) throw new AdminError('The upload had no PDF in it.');
    if (file.size > MAX_PDF) throw new AdminError('That PDF is larger than 50 MB.');
    if (String.fromCharCode(...new Uint8Array(await file.slice(0, 5).arrayBuffer())) !== '%PDF-') throw new AdminError('That file is not a PDF.');
    const key = `${monthDir('pdfs', `${id}-${stamp}`)}.pdf`;
    await (await bucket()).put(key, file.stream(), { httpMetadata: { contentType: 'application/pdf', cacheControl: 'public, max-age=31536000, immutable' } });
    await db.update(media).set({ r2Key: key, sourceUrl: null, bytes: file.size, sha256: String(form.get('sha256') ?? '') || null, updatedAt: sql`(datetime('now'))` }).where(eq(media.id, id));
  } else throw new AdminError('This kind of file can’t be replaced here.');
  const keys = keysOf(old);
  if (keys.length) await (await bucket()).delete(keys);
  // Every page could show it; purge them all once
  await purge(['posts', 'orders', 'issues', 'people', 'albums', 'pages', 'banner', 'events']);
  await audit(user, 'replace', 'media', id, { summary: `File ${id} replaced` });
}

/** Deletes a file nothing uses any more (state roles only) */
export async function deleteFile(user: AdminUser, id: number) {
  if (!isState(user)) throw new AdminError('Only the state office deletes files.', 403);
  const db = await getDb();
  const m = await db.select({ r2Key: media.r2Key, srcset: media.srcset, uses: usageSql }).from(media).where(eq(media.id, id)).get();
  if (!m) throw new AdminError('That file could not be found.', 404);
  if (m.uses > 0) throw new AdminError('This file is still used. Replace it instead, or remove it from those places first.');
  const keys = keysOf(m);
  if (keys.length) await (await bucket()).delete(keys);
  await db.delete(media).where(eq(media.id, id));
  await audit(user, 'delete', 'media', id, { summary: `File ${id} deleted` });
}
