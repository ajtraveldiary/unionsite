// Reads the public content of the current keralangounion.in so the preview can run on real
// data (plan, section 1: "Crawl the public site and use it as demo data"). The WordPress REST
// API returns HTTP 500 (plan, section 2), so this reads public pages instead:
//   news posts   ← the RSS feed (/feed/?paged=N: title, date, categories, full text)
//   post photos  ← year archives (/2026/page/N/: each post's featured image)
//   GO orders    ← download pages (sitemap) + download categories (/download-category/x/)
//   magazine     ← Real3D flipbook pages (sitemap: PDF and cover thumbnail)
// One request at a time with a pause, and every response is cached in scripts/.cache, so a
// rerun only fetches what's missing. Output: scripts/.cache/raw.json, which
// scripts/import-crawl.mjs turns into the site's data files.
// Run: node scripts/crawl.mjs   (add --fresh-feed to refetch the feed and archives, or
// --cache-only to build raw.json from what's already cached, without fetching anything)
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const SITE = 'https://keralangounion.in';
const CACHE = new URL('./.cache/pages/', import.meta.url);
const OUT = new URL('./.cache/raw.json', import.meta.url);
const PAUSE_MS = 350;
const FRESH = process.argv.includes('--fresh-feed');
const CACHE_ONLY = process.argv.includes('--cache-only');
mkdirSync(CACHE, { recursive: true });

let fetched = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** GET a page, from the cache when we have it. Returns '' for 404s. */
async function get(url, { fresh = false } = {}) {
  const file = new URL(createHash('sha1').update(url).digest('hex') + '.html', CACHE);
  if (!fresh && existsSync(file)) return readFileSync(file, 'utf8');
  if (CACHE_ONLY) return '';
  for (let attempt = 1; ; attempt++) {
    await sleep(PAUSE_MS);
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'KeralaNGOUnion-rebuild-crawler/1.0 (site rebuild; one request at a time)' }, redirect: 'follow' });
      const body = res.status === 404 ? '' : await res.text();
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
      writeFileSync(file, body);
      if (++fetched % 25 === 0) console.log(`  …${fetched} pages fetched`);
      return body;
    } catch (err) {
      if (attempt >= 3) { console.warn(`  ! gave up on ${url}: ${err.message}`); return ''; }
      await sleep(2000 * attempt);
    }
  }
}

const decode = (s) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[e])
  .trim();
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`)); return m ? decode(m[1]) : ''; };
const locs = (xml) => [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
const text = (html) => decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');

// 1 · News posts from the RSS feed
async function crawlFeed() {
  console.log('News posts (RSS feed)…');
  const posts = [];
  for (let page = 1; ; page++) {
    const xml = await get(page === 1 ? `${SITE}/feed/` : `${SITE}/feed/?paged=${page}`, { fresh: FRESH });
    const items = xml.split('<item>').slice(1);
    if (!items.length) break;
    for (const it of items) {
      posts.push({
        id: Number(tag(it, 'guid').match(/[?&]p=(\d+)/)?.[1]),
        title: tag(it, 'title'),
        link: tag(it, 'link'),
        date: new Date(tag(it, 'pubDate')).toISOString(),
        categories: [...it.matchAll(/<category>([\s\S]*?)<\/category>/g)].map((m) => decode(m[1])),
        excerpt: tag(it, 'description'),
        html: tag(it, 'content:encoded'),
      });
    }
  }
  console.log(`  ${posts.length} posts`);
  return posts;
}

// 2 · Featured photos from the year archives (title link → first image in the same <article>)
async function crawlPhotos() {
  console.log('Post photos (year archives)…');
  const photos = {};
  for (let year = new Date().getFullYear(); year >= 2014; year--) {
    for (let page = 1; ; page++) {
      const html = await get(page === 1 ? `${SITE}/${year}/` : `${SITE}/${year}/page/${page}/`, { fresh: FRESH });
      const articles = [...html.matchAll(/<article\b[\s\S]*?<\/article>/g)].map((m) => m[0]);
      if (!articles.length) break;
      for (const a of articles) {
        const link = a.match(/class="entry-title"><a href="([^"]+)"/)?.[1];
        const img = a.match(/<img[^>]+src="[^"]+\/wp-content\/uploads\/[^"]+"[^>]*>/)?.[0];
        if (link && img) photos[link] = { src: img.match(/src="([^"]+)"/)[1], srcset: decode(img.match(/srcset="([^"]+)"/)?.[1] ?? '') };
      }
      if (!html.includes(`/${year}/page/${page + 1}/`)) break;
    }
  }
  console.log(`  ${Object.keys(photos).length} photos`);
  return photos;
}

// 3 · GO downloads: one page each, plus category pages for which subject each belongs to
async function crawlOrders() {
  console.log('Government orders (downloads)…');
  const pages = locs(await get(`${SITE}/wp-sitemap-posts-wpdmpro-1.xml`));
  const orders = [];
  for (const url of pages) {
    const html = await get(url);
    if (!html) continue;
    const t = text(html);
    orders.push({
      url,
      id: Number(html.match(/wpdmdl=(\d+)/)?.[1]),
      title: decode(html.match(/<title>(.*?)<\/title>/s)?.[1] ?? '').replace(/\s+[–-] Kerala NGO Union$/, ''),
      size: t.match(/File Size ([\d.]+ ?[KMG]B)/i)?.[1] ?? '',
      created: t.match(/Create Date (\w+ \d{1,2}, \d{4})/)?.[1] ?? '',
      updated: t.match(/Last Updated (\w+ \d{1,2}, \d{4})/)?.[1] ?? '',
      downloads: Number(t.match(/Download (\d+) File Size/)?.[1] ?? 0),
    });
  }
  console.log(`  ${orders.length} orders; reading categories…`);
  const categories = {};
  for (const catUrl of locs(await get(`${SITE}/wp-sitemap-taxonomies-wpdmcategory-1.xml`))) {
    const slug = decodeURIComponent(catUrl.replace(/\/$/, '').split('/').pop());
    for (let page = 1; page < 40; page++) {
      const html = await get(page === 1 ? catUrl : `${catUrl}page/${page}/`);
      const links = [...new Set([...html.matchAll(/href="(https:\/\/keralangounion\.in\/download\/[^"?#]+)"/g)].map((m) => m[1]))];
      if (!links.length) break;
      for (const l of links) (categories[l] ??= []).includes(slug) || categories[l].push(slug);
      if (!html.includes(`page/${page + 1}/`)) break;
    }
  }
  for (const o of orders) o.categories = categories[o.url] ?? [];
  return orders;
}

// 4 · Kerala Service issues from the flipbook pages
async function crawlMagazine() {
  console.log('Kerala Service (flipbooks)…');
  const issues = [];
  for (const url of locs(await get(`${SITE}/wp-sitemap-posts-r3d-1.xml`))) {
    const html = await get(url);
    if (!html) continue;
    const opts = html.replace(/&quot;/g, '"').replace(/\\\//g, '/');
    issues.push({
      url,
      title: decode(html.match(/<title>(.*?)<\/title>/s)?.[1] ?? '').replace(/\s+[–-] Kerala NGO Union$/, ''),
      pdf: opts.match(/"pdfUrl":"([^"]+)"/)?.[1] ?? '',
      thumb: opts.match(/"lightboxThumbnailUrl":"([^"?]+)/)?.[1] ?? '',
    });
  }
  console.log(`  ${issues.length} issues`);
  return issues;
}

const raw = { crawledAt: new Date().toISOString() };
raw.posts = await crawlFeed();
raw.photos = await crawlPhotos();
raw.orders = await crawlOrders();
raw.issues = await crawlMagazine();
writeFileSync(OUT, JSON.stringify(raw, null, 1));
console.log(`Done: ${fetched} pages fetched this run. Wrote ${OUT.pathname}`);
