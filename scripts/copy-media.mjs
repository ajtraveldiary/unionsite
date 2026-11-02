// Copies the crawled photos and PDFs from the old site into R2, so the site stops linking to it
// (plan, section 9, "Media and thumbnails"; todo Phase 2). For every file the crawl links to
// (post photos, order PDFs, Kerala Service PDFs and covers):
//   1. download it once, one request at a time with a pause, into scripts/.cache/media/ (a rerun
//      only fetches what's missing, so a long run can be stopped and started again);
//   2. photos: turn it into WebP (quality 80, EXIF and GPS stripped) at the standard widths
//      320 · 640 · 960 · 1280 · 1920, skipping sizes larger than the photo; PDFs: check it is one;
//   3. put the files in R2 under keys made from the file's SHA-256 (images/crawl/{hash}/{w}.webp,
//      pdfs/crawl/{hash}.pdf), so a file met twice is stored once and keys never change;
//   4. point the D1 `media` rows at the copies (r2_key, srcset, size, sha256), keeping the old
//      address in source_url. scripts/.cache/media-map.json remembers it all, and
//      `npm run db:seed` applies it again after a reseed.
// This fills the local R2 and D1 (wrangler's local state). --remote then puts every file in that
// map into the real bucket on Cloudflare (skipping those already there; nothing is downloaded or
// converted again) and points the real D1's rows at them, so run it after `seed-d1.mjs --remote`.
//
//   node scripts/copy-media.mjs              everything (hours from scratch: the old server is slow)
//   node scripts/copy-media.mjs --limit 20   the first 20 of each kind, to try it out
//   node scripts/copy-media.mjs --offline    only what's already downloaded
//   node scripts/copy-media.mjs --remote     the local copies into the real R2 and D1 (needs `npx wrangler login`)
// Watch it with `node scripts/copy-media.mjs --progress` in another terminal.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { remoteProxyOptions } from './remote-config.mjs';

const CACHE = new URL('./.cache/media/', import.meta.url);
const MAP = new URL('./.cache/media-map.json', import.meta.url);
const STATUS = new URL('./.cache/media-status.json', import.meta.url);
const REPORT = new URL('./.cache/media-report.txt', import.meta.url);
const WIDTHS = [320, 640, 960, 1280, 1920];
const PAUSE_MS = 350;
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const LIMIT = Number(arg('--limit')) || Infinity;
const OFFLINE = process.argv.includes('--offline');
const REMOTE = process.argv.includes('--remote');

if (process.argv.includes('--progress')) {
  // Prints the running copy's progress every 10 seconds
  for (;;) {
    if (existsSync(STATUS)) { const s = JSON.parse(readFileSync(STATUS, 'utf8')); console.log(`${new Date().toLocaleTimeString()}  ${s.phase} · ${s.done}/${s.total} · ${s.failed} failed · ${s.current ?? ''}`); }
    await new Promise((r) => setTimeout(r, 10_000));
  }
}

mkdirSync(CACHE, { recursive: true });
const live = (name) => JSON.parse(readFileSync(new URL(`../src/data/live/${name}.json`, import.meta.url), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (data, alg = 'sha256') => createHash(alg).update(data).digest('hex');
const status = (s) => writeFileSync(STATUS, JSON.stringify(s));

// ── What to copy ─────────────────────────────────────────────────────────────────────────
// `source` is the address D1 keeps in media.source_url; `fetch` is the file to download (for a
// photo, its largest size up to 1920 px wide, from the old srcset)
function largestUpTo(src, srcset, max = 1920) {
  const sizes = (srcset ?? '').split(',').map((s) => s.trim().split(/\s+/)).filter(([u, w]) => u && w?.endsWith('w')).map(([u, w]) => ({ u, w: parseInt(w) }));
  const fit = sizes.filter((s) => s.w <= max).sort((a, b) => b.w - a.w)[0];
  return fit?.u ?? sizes.sort((a, b) => a.w - b.w)[0]?.u ?? src;
}
const jobs = new Map();
const addJob = (kind, source, fetchUrl = source) => { if (source && !jobs.has(source)) jobs.set(source, { kind, source, fetch: fetchUrl }); };
const take = (list) => list.slice(0, LIMIT);
for (const p of take(live('posts').filter((p) => p.cover.kind === 'photo'))) addJob('image', p.cover.src, largestUpTo(p.cover.src, p.cover.srcset));
for (const o of take(live('orders').filter((o) => o.pdfUrl))) addJob('pdf', o.pdfUrl);
for (const i of take(live('issues'))) { addJob('pdf', i.pdfUrl); addJob('image', i.coverUrl); }

const map = existsSync(MAP) ? JSON.parse(readFileSync(MAP, 'utf8')) : {};
const { getPlatformProxy } = await import('wrangler');

// Every file copied so far onto its D1 rows; returns how many rows changed
async function pointRows(db, size) {
  const entries = Object.entries(map);
  let rows = 0;
  for (let i = 0; i < entries.length; i += size) {
    const res = await db.batch(entries.slice(i, i + size).map(([source, e]) =>
      db.prepare('UPDATE media SET r2_key = ?, srcset = ?, width = coalesce(?, width), height = coalesce(?, height), bytes = ?, sha256 = ? WHERE source_url = ? AND (r2_key IS NULL OR r2_key LIKE ?)')
        .bind(e.r2Key, e.srcset ?? null, e.width ?? null, e.height ?? null, e.bytes, e.sha256, source, '%/crawl/%')));
    rows += res.reduce((n, r) => n + (r.meta?.changes ?? 0), 0);
  }
  return rows;
}

if (REMOTE) {
  // Every R2 key the map names (each photo's sizes, each PDF), from the local bucket to the real one
  const local = await getPlatformProxy();
  const { options, names } = remoteProxyOptions({ media: true });
  const real = await getPlatformProxy(options);
  const keys = [...new Set(Object.values(map).flatMap((e) => (e.srcset ? e.srcset.split(', ').map((s) => s.split(' ')[0]) : [e.r2Key])))];
  const there = new Set();
  for (let cursor; ;) {
    const page = await real.env.MEDIA.list({ limit: 1000, cursor });
    page.objects.forEach((o) => there.add(o.key));
    if (!page.truncated) break;
    cursor = page.cursor;
  }
  const todo = keys.filter((k) => !there.has(k));
  console.log(`${keys.length} files in the local copy; ${keys.length - todo.length} already in the real bucket "${names.bucket}", ${todo.length} to put.`);
  const missing = [];
  let done = 0;
  // A few at a time: each put is one request to Cloudflare
  const next = async () => {
    for (let key; (key = todo.shift()); ) {
      const obj = await local.env.MEDIA.get(key);
      if (!obj) missing.push(key);
      else await real.env.MEDIA.put(key, await obj.arrayBuffer(), { httpMetadata: obj.httpMetadata });
      status({ phase: 'putting into the real R2', done: ++done, total: keys.length - there.size, failed: missing.length, current: key });
      if (done % 100 === 0) console.log(`  …${done}`);
    }
  };
  await Promise.all(Array.from({ length: 4 }, next));
  const rows = await pointRows(real.env.DB, 50);
  status({ phase: 'finished', done, total: keys.length - there.size, failed: missing.length });
  await Promise.all([local.dispose(), real.dispose()]);
  console.log(`Put ${done - missing.length} files into the real R2; ${rows} media rows in the real D1 point at them.`);
  if (missing.length) console.log(`${missing.length} keys are in the map but not in the local R2 (run the local copy again): ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ' …' : ''}`);
  process.exit(0);
}

const failures = [];
const todo = [...jobs.values()].filter((j) => !map[j.source]);
console.log(`${jobs.size} files linked from the crawl; ${jobs.size - todo.length} already copied, ${todo.length} to do.`);

// ── 1 · Download ─────────────────────────────────────────────────────────────────────────
const cacheFile = (url) => new URL(sha(url, 'sha1'), CACHE);
async function download(url) {
  const file = cacheFile(url);
  if (existsSync(file)) return readFileSync(file);
  if (OFFLINE) return null;
  for (let attempt = 1; ; attempt++) {
    await sleep(PAUSE_MS);
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'KeralaNGOUnion-rebuild-crawler/1.0 (site rebuild; one request at a time)' }, redirect: 'follow' });
      if (res.status === 404) throw Object.assign(new Error('not found (404)'), { final: true });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = Buffer.from(await res.arrayBuffer());
      writeFileSync(file, data);
      return data;
    } catch (err) {
      if (err.final || attempt >= 3) throw err;
      await sleep(3000 * attempt);
    }
  }
}

// ── 2 · Convert ──────────────────────────────────────────────────────────────────────────
async function photo(data) {
  const meta = await sharp(data, { failOn: 'none' }).metadata();
  const turned = (meta.orientation ?? 1) >= 5;
  const width = turned ? meta.height : meta.width;
  const height = turned ? meta.width : meta.height;
  if (!width || !height) throw new Error('not an image');
  const hash = sha(data).slice(0, 20);
  const widths = WIDTHS.filter((w) => w <= width);
  if (!widths.length) widths.push(width);
  const files = [];
  for (const w of widths) {
    const out = await sharp(data, { failOn: 'none' }).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    files.push({ key: `images/crawl/${hash}/${w}.webp`, data: out, type: 'image/webp', w });
  }
  const top = files[files.length - 1];
  return {
    files,
    entry: { r2Key: top.key, srcset: files.map((f) => `${f.key} ${f.w}w`).join(', '), width: top.w, height: Math.round((height * top.w) / width), bytes: files.reduce((n, f) => n + f.data.length, 0), sha256: sha(data) },
  };
}
function pdf(data) {
  if (data.subarray(0, 5).toString('latin1') !== '%PDF-') {
    const page = data.toString('utf8');
    throw new Error(/File not found/i.test(page) ? 'missing on the old site ("File not found")' : /<html/i.test(page) ? 'a web page, not a PDF' : 'not a PDF');
  }
  const key = `pdfs/crawl/${sha(data).slice(0, 20)}.pdf`;
  return { files: [{ key, data, type: 'application/pdf' }], entry: { r2Key: key, bytes: data.length, sha256: sha(data) } };
}

// ── 3 · Store in R2, 4 · point D1 at it ─────────────────────────────────────────────────
const { env, dispose } = await getPlatformProxy();
async function store(files) {
  for (const f of files) {
    if (await env.MEDIA.head(f.key)) continue;
    await env.MEDIA.put(f.key, f.data, { httpMetadata: { contentType: f.type, cacheControl: 'public, max-age=31536000, immutable' } });
  }
}

let done = 0;
const total = todo.length;
for (const job of todo) {
  status({ phase: 'copying', done, total, failed: failures.length, current: job.source.split('/').pop() });
  try {
    const data = await download(job.fetch);
    if (!data) continue; // --offline and not downloaded yet
    const { files, entry } = job.kind === 'image' ? await photo(data) : pdf(data);
    await store(files);
    map[job.source] = entry;
  } catch (err) {
    failures.push(`${job.kind}\t${job.source}\t${err.message}`);
  }
  if (++done % 25 === 0) {
    writeFileSync(MAP, JSON.stringify(map));
    console.log(`  …${done}/${total} (${failures.length} failed)`);
  }
}
writeFileSync(MAP, JSON.stringify(map));
writeFileSync(REPORT, failures.join('\n') + (failures.length ? '\n' : ''));

// Every file copied so far, also those from earlier runs, onto its D1 rows
const rows = await pointRows(env.DB, 100);
status({ phase: 'finished', done, total, failed: failures.length });
await dispose();

const kinds = Object.values(map).reduce((n, e) => ((n[e.srcset ? 'photos' : 'pdfs'] += 1), n), { photos: 0, pdfs: 0 });
const mb = Object.values(map).reduce((n, e) => n + e.bytes, 0) / 1024 / 1024;
console.log(`Copied: ${kinds.photos} photos and ${kinds.pdfs} PDFs in R2 (${mb.toFixed(0)} MB); ${rows} media rows point at them.`);
console.log(failures.length ? `${failures.length} could not be copied; see scripts/.cache/media-report.txt. They keep linking to the old site.` : 'Nothing failed.');
