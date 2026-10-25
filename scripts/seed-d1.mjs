// Loads the crawled content (src/data/live/*.json) into the local D1 database, replacing what's
// there: posts and their translations, orders, Kerala Service issues, their files (as media rows
// with the old site's address; those scripts/copy-media.mjs has copied into R2 point at the copy), the home banner, the search index and one local test user
// per admin role. Anything made in the admin is wiped too. Run `npm run db:migrate` first.
//
//   node scripts/seed-d1.mjs
//
// Text goes in as bound parameters, never inlined SQL: D1 caps one statement at 100 KB and the
// longest article is about 280 KB of Malayalam.
import { existsSync, readFileSync } from 'node:fs';
import { getPlatformProxy } from 'wrangler';
import { districts, topics } from '../src/data/districts.ts';
import { orderSubjects } from '../src/data/orders.ts';
import { firstBanner, events, stateCommittee, videos } from '../src/data/site.ts';
import { glossaryTerms } from '../src/data/glossary.ts';
import { postEntry, orderEntry, eventEntry } from '../src/lib/search-entries.ts';

const live = (name) => JSON.parse(readFileSync(new URL(`../src/data/live/${name}.json`, import.meta.url), 'utf8'));
const posts = live('posts');
const orders = live('orders');
const issues = live('issues');

const { env, dispose } = await getPlatformProxy();
const db = env.DB;
const stmts = [];
const add = (sql, ...params) => stmts.push(db.prepare(sql).bind(...params.map((p) => (p === undefined ? null : p))));

const adminTables = ['import_jobs', 'search_terms_daily', 'site_stats_daily', 'content_views_daily', 'analytics_raw', 'glossary', 'contact_messages', 'audit_log', 'revisions', 'edit_locks', 'post_drafts', 'users', 'events', 'album_items', 'albums', 'videos', 'conferences', 'documents', 'pages', 'district_extras', 'offices', 'positions', 'area_committees', 'people'];
for (const table of [...adminTables, 'search_fts', 'search_docs', 'post_translations', 'posts', 'orders', 'magazine_issues', 'media', 'site_settings', 'districts', 'topics', 'order_subjects']) {
  add(`DELETE FROM ${table}`);
}
add(`DELETE FROM sqlite_sequence WHERE name IN ('media', 'magazine_issues', 'search_docs', ${adminTables.map((t) => `'${t}'`).join(', ')})`);

// Search: the result row in search_docs, the normalised text in search_fts under the same id
let searchId = 0;
const addSearch = (kind, ref, e) => {
  const d = e.doc;
  add('INSERT INTO search_docs (id, kind, ref, ml, en, sub, url, kw, important, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', ++searchId, kind, ref, d.ml, d.en, d.sub, d.url, d.kw, d.imp ? 1 : 0, e.date);
  add('INSERT INTO search_fts (rowid, title, kw, body) VALUES (?, ?, ?, ?)', searchId, e.title, e.kw, e.body);
};

for (const d of districts) add('INSERT INTO districts VALUES (?, ?, ?, ?, ?, ?)', d.slug, d.name.ml, d.name.en, d.hq.ml, d.hq.en, d.sortOrder);
for (const t of topics) add('INSERT INTO topics VALUES (?, ?, ?)', t.slug, t.name.ml, t.name.en);
for (const s of orderSubjects) add('INSERT INTO order_subjects VALUES (?, ?, ?, ?)', s.slug, s.group, s.name.ml, s.name.en);

// Files already copied into R2 by scripts/copy-media.mjs: the old address → the copy
const mapFile = new URL('./.cache/media-map.json', import.meta.url);
const copied = existsSync(mapFile) ? JSON.parse(readFileSync(mapFile, 'utf8')) : {};

let mediaId = 0;
const addMedia = (kind, url, { srcset, bytes, altMl, altEn } = {}) => {
  if (!url) return null;
  const c = copied[url];
  add('INSERT INTO media (id, kind, source_url, r2_key, srcset, width, height, bytes, sha256, alt_ml, alt_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ++mediaId, kind, url, c?.r2Key, c ? c.srcset : srcset, c?.width, c?.height, c?.bytes ?? bytes, c?.sha256, altMl, altEn);
  return mediaId;
};

for (const p of posts) {
  const cover = p.cover.kind === 'photo' ? addMedia('image', p.cover.src, { srcset: p.cover.srcset, altMl: p.cover.alt?.ml, altEn: p.cover.alt?.en }) : null;
  add(
    'INSERT INTO posts (id, slug, topic, district, published_at, cover_media_id, featured_on_home, legacy_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    p.id, p.slug, p.topic, p.district, p.date, cover, p.featured ? 1 : 0, p.legacyUrl,
  );
  add('INSERT INTO post_translations (post_id, lang, title, summary, body) VALUES (?, ?, ?, ?, ?)', p.id, 'ml', p.title.ml, p.summary.ml ?? '', p.body?.ml ? JSON.stringify(p.body.ml) : null);
  if (p.title.en) {
    add('INSERT INTO post_translations (post_id, lang, title, summary, body) VALUES (?, ?, ?, ?, ?)', p.id, 'en', p.title.en, p.summary.en ?? '', p.body?.en ? JSON.stringify(p.body.en) : null);
  }
  addSearch('news', p.id, postEntry(p));
}

for (const o of orders) {
  const pdf = addMedia('pdf', o.pdfUrl, { bytes: o.pdfKb ? o.pdfKb * 1024 : undefined });
  add(
    `INSERT INTO orders (id, slug, go_number, go_date, date_is_upload, department, order_group, subject, title_ml, title_en, summary_ml, summary_en, is_important, pdf_media_id, page_count, legacy_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    o.id, o.slug, o.goNumber ?? '', o.goDate, o.dateIsUpload ? 1 : 0, o.department, o.group, o.subject, o.title.ml, o.title.en,
    o.summary?.ml, o.summary?.en, o.important ? 1 : 0, pdf, o.pages, o.legacyUrl,
  );
  addSearch('order', o.id, orderEntry(o));
}

for (const i of issues) {
  const cover = addMedia('image', i.coverUrl);
  const pdf = addMedia('pdf', i.pdfUrl);
  add('INSERT INTO magazine_issues (year, month, cover_media_id, pdf_media_id, legacy_url) VALUES (?, ?, ?, ?, ?)', i.year, i.month, cover, pdf, i.legacyUrl);
}

// The preview's sample events (src/data/site.ts); real ones are added in Admin → Events
let eventId = 0;
for (const e of events) {
  add(
    `INSERT INTO events (id, slug, title_ml, title_en, venue_ml, venue_en, en_source, start_at, end_at, district, status, sample)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?)`,
    ++eventId, e.slug, e.title.ml, e.title.en, e.venue.ml, e.venue.en, e.title.en ? 'human' : null, e.start, e.end, e.district, e.sample ? 1 : 0,
  );
  addSearch('event', eventId, eventEntry(e));
}

// The state committee (src/data/site.ts): one person each, in the order the site shows them
let personId = 0;
const order = {};
for (const p of stateCommittee) {
  add('INSERT INTO people (id, name_ml, name_en) VALUES (?, ?, ?)', ++personId, p.name.ml, p.name.en);
  const key = p.body;
  order[key] = (order[key] ?? 0) + 1;
  add(`INSERT INTO positions (person_id, body, role, sort_order, term, status) VALUES (?, ?, ?, ?, ?, 'published')`, personId, p.body, p.role, order[key], '63rd state conference');
}

// The channel's latest videos (src/data/site.ts); Admin → Media syncs the channel after this
for (const v of videos) add(`INSERT INTO videos (youtube_id, title_ml, title_en, published_at, source) VALUES (?, ?, ?, ?, 'channel')`, v.id, v.title.ml, v.title.en, v.date);

// The glossary for AI translation (src/data/glossary.ts); state editors keep it in Admin → Settings
for (const [ml, en] of glossaryTerms) add('INSERT INTO glossary (ml, en) VALUES (?, ?)', ml, en);

add('INSERT INTO site_settings (key, value) VALUES (?, ?)', 'home_banner', JSON.stringify(firstBanner));

// Local admin users, one per role, for the stand-in login at /admin/login (plan, section 10).
// The real users are invited in Admin → Users once the site runs behind Cloudflare Access.
const testUsers = [
  ['super@example.org', 'Test super admin', 'super_admin', null],
  ['state@example.org', 'Test state editor', 'state_editor', null],
  ['kollam.admin@example.org', 'Test Kollam admin', 'district_admin', 'kollam'],
  ['kollam.editor@example.org', 'Test Kollam editor', 'district_editor', 'kollam'],
];
for (const [email, name, role, district] of testUsers) add('INSERT INTO users (email, name, role, district) VALUES (?, ?, ?, ?)', email, name, role, district);

// One batch is one transaction; a few hundred statements per batch keeps each one small
const SIZE = 200;
for (let i = 0; i < stmts.length; i += SIZE) await db.batch(stmts.slice(i, i + SIZE));

const count = async (t) => (await db.prepare(`SELECT count(*) AS n FROM ${t}`).first()).n;
console.log(`posts ${await count('posts')} · translations ${await count('post_translations')} · orders ${await count('orders')} · issues ${await count('magazine_issues')} · events ${await count('events')} · people ${await count('people')} · videos ${await count('videos')} · media ${await count('media')} · search ${await count('search_docs')}/${await count('search_fts')} · admin users ${await count('users')} · files in R2 ${Object.keys(copied).length}`);
await dispose();
