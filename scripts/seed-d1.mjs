// Loads the crawled content (src/data/live/*.json) into the local D1 database, replacing what's
// there: posts and their translations, orders, Kerala Service issues, their files (as media rows
// that still point at the old site) and the home banner. Run `npm run db:migrate` first.
//
//   node scripts/seed-d1.mjs
//
// Text goes in as bound parameters, never inlined SQL: D1 caps one statement at 100 KB and the
// longest article is about 280 KB of Malayalam.
import { readFileSync } from 'node:fs';
import { getPlatformProxy } from 'wrangler';
import { districts, topics } from '../src/data/districts.ts';
import { orderSubjects } from '../src/data/orders.ts';
import { firstBanner } from '../src/data/site.ts';

const live = (name) => JSON.parse(readFileSync(new URL(`../src/data/live/${name}.json`, import.meta.url), 'utf8'));
const posts = live('posts');
const orders = live('orders');
const issues = live('issues');

const { env, dispose } = await getPlatformProxy();
const db = env.DB;
const stmts = [];
const add = (sql, ...params) => stmts.push(db.prepare(sql).bind(...params.map((p) => (p === undefined ? null : p))));

for (const table of ['post_translations', 'posts', 'orders', 'magazine_issues', 'media', 'site_settings', 'districts', 'topics', 'order_subjects']) {
  add(`DELETE FROM ${table}`);
}
add(`DELETE FROM sqlite_sequence WHERE name = 'media' OR name = 'magazine_issues'`);

for (const d of districts) add('INSERT INTO districts VALUES (?, ?, ?, ?, ?, ?)', d.slug, d.name.ml, d.name.en, d.hq.ml, d.hq.en, d.sortOrder);
for (const t of topics) add('INSERT INTO topics VALUES (?, ?, ?)', t.slug, t.name.ml, t.name.en);
for (const s of orderSubjects) add('INSERT INTO order_subjects VALUES (?, ?, ?, ?)', s.slug, s.group, s.name.ml, s.name.en);

let mediaId = 0;
const addMedia = (kind, url, { srcset, bytes, altMl, altEn } = {}) => {
  if (!url) return null;
  add('INSERT INTO media (id, kind, source_url, srcset, bytes, alt_ml, alt_en) VALUES (?, ?, ?, ?, ?, ?, ?)', ++mediaId, kind, url, srcset, bytes, altMl, altEn);
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
}

for (const o of orders) {
  const pdf = addMedia('pdf', o.pdfUrl, { bytes: o.pdfKb ? o.pdfKb * 1024 : undefined });
  add(
    `INSERT INTO orders (id, slug, go_number, go_date, date_is_upload, department, order_group, subject, title_ml, title_en, summary_ml, summary_en, is_important, pdf_media_id, page_count, legacy_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    o.id, o.slug, o.goNumber ?? '', o.goDate, o.dateIsUpload ? 1 : 0, o.department, o.group, o.subject, o.title.ml, o.title.en,
    o.summary?.ml, o.summary?.en, o.important ? 1 : 0, pdf, o.pages, o.legacyUrl,
  );
}

for (const i of issues) {
  const cover = addMedia('image', i.coverUrl);
  const pdf = addMedia('pdf', i.pdfUrl);
  add('INSERT INTO magazine_issues (year, month, cover_media_id, pdf_media_id, legacy_url) VALUES (?, ?, ?, ?, ?)', i.year, i.month, cover, pdf, i.legacyUrl);
}

add('INSERT INTO site_settings (key, value) VALUES (?, ?)', 'home_banner', JSON.stringify(firstBanner));

// One batch is one transaction; a few hundred statements per batch keeps each one small
const SIZE = 200;
for (let i = 0; i < stmts.length; i += SIZE) await db.batch(stmts.slice(i, i + SIZE));

const count = async (t) => (await db.prepare(`SELECT count(*) AS n FROM ${t}`).first()).n;
console.log(`posts ${await count('posts')} · translations ${await count('post_translations')} · orders ${await count('orders')} · issues ${await count('magazine_issues')} · media ${await count('media')}`);
await dispose();
