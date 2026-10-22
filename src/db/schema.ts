// D1 tables (plan, section 5), for the content the preview has today: posts, orders, Kerala
// Service issues and the home banner. Districts, topics and order subjects are fixed lists kept in
// src/data/ and copied here by the importer so rows can reference them. Events, videos and the
// state committee stay hand-written in src/data/site.ts until the admin panel manages them.
// Change this file, then `npm run db:generate` writes the migration.
import { sqliteTable, text, integer, index, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

const timestamps = {
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
};

export const districts = sqliteTable('districts', {
  slug: text('slug').primaryKey(),
  nameMl: text('name_ml').notNull(),
  nameEn: text('name_en').notNull(),
  hqMl: text('hq_ml').notNull(),
  hqEn: text('hq_en').notNull(),
  sortOrder: integer('sort_order').notNull(),
});

export const topics = sqliteTable('topics', {
  slug: text('slug').primaryKey(),
  nameMl: text('name_ml').notNull(),
  nameEn: text('name_en').notNull(),
});

/** Every file. Crawled files only have `source_url` (the old site) until they're copied to R2. */
export const media = sqliteTable('media', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kind: text('kind', { enum: ['image', 'pdf', 'other'] }).notNull(),
  r2Key: text('r2_key'),
  sourceUrl: text('source_url'),
  /** Other sizes as "url 300w, url 768w"; generated variants replace this once files are in R2 */
  srcset: text('srcset'),
  bytes: integer('bytes'),
  width: integer('width'),
  height: integer('height'),
  altMl: text('alt_ml'),
  altEn: text('alt_en'),
  focalX: integer('focal_x'),
  focalY: integer('focal_y'),
  ...timestamps,
});

export const posts = sqliteTable(
  'posts',
  {
    id: integer('id').primaryKey(),
    /** Latin slug shared by both languages; the URL is /news/{year}/{slug} */
    slug: text('slug').notNull(),
    topic: text('topic').notNull().references(() => topics.slug),
    /** null = state level */
    district: text('district').references(() => districts.slug),
    status: text('status', { enum: ['draft', 'in_review', 'scheduled', 'published', 'archived'] }).notNull().default('published'),
    /** ISO date, the date shown on the post */
    publishedAt: text('published_at').notNull(),
    coverMediaId: integer('cover_media_id').references(() => media.id),
    featuredOnHome: integer('featured_on_home', { mode: 'boolean' }).notNull().default(false),
    legacyUrl: text('legacy_url'),
    ...timestamps,
  },
  (t) => [
    index('posts_published').on(t.status, t.publishedAt),
    index('posts_topic').on(t.status, t.topic, t.publishedAt),
    index('posts_district').on(t.status, t.district, t.publishedAt),
    uniqueIndex('posts_slug').on(t.slug, t.publishedAt),
  ],
);

/** One row per language. Malayalam is the source; English appears once it is reviewed. */
export const postTranslations = sqliteTable(
  'post_translations',
  {
    postId: integer('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
    lang: text('lang', { enum: ['ml', 'en'] }).notNull(),
    title: text('title').notNull(),
    summary: text('summary').notNull().default(''),
    /** JSON array of paragraphs for crawled posts; the editor's TipTap JSON later */
    body: text('body', { mode: 'json' }).$type<string[]>(),
    source: text('source', { enum: ['human', 'ai_draft', 'ai_reviewed'] }).notNull().default('human'),
    reviewedAt: text('reviewed_at'),
  },
  (t) => [primaryKey({ columns: [t.postId, t.lang] })],
);

export const orderSubjects = sqliteTable('order_subjects', {
  slug: text('slug').primaryKey(),
  group: text('order_group', { enum: ['govt', 'nps', 'pension'] }).notNull(),
  nameMl: text('name_ml').notNull(),
  nameEn: text('name_en').notNull(),
});

export const orders = sqliteTable(
  'orders',
  {
    id: integer('id').primaryKey(),
    slug: text('slug').notNull(),
    goNumber: text('go_number').notNull().default(''),
    /** ISO date: the GO's date, or the upload date when `date_is_upload` is set */
    goDate: text('go_date').notNull(),
    dateIsUpload: integer('date_is_upload', { mode: 'boolean' }).notNull().default(false),
    department: text('department'),
    group: text('order_group', { enum: ['govt', 'nps', 'pension'] }).notNull(),
    subject: text('subject').notNull().references(() => orderSubjects.slug),
    titleMl: text('title_ml').notNull(),
    titleEn: text('title_en').notNull(),
    summaryMl: text('summary_ml'),
    summaryEn: text('summary_en'),
    isImportant: integer('is_important', { mode: 'boolean' }).notNull().default(false),
    pdfMediaId: integer('pdf_media_id').references(() => media.id),
    pageCount: integer('page_count'),
    /** Text of the PDF, for search (filled at upload, plan section 11) */
    pdfText: text('pdf_text'),
    status: text('status', { enum: ['draft', 'published', 'archived'] }).notNull().default('published'),
    legacyUrl: text('legacy_url'),
    ...timestamps,
  },
  (t) => [
    index('orders_date').on(t.status, t.goDate),
    index('orders_subject').on(t.status, t.subject, t.goDate),
    index('orders_group').on(t.status, t.group, t.goDate),
  ],
);

export const magazineIssues = sqliteTable(
  'magazine_issues',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    year: integer('year').notNull(),
    month: integer('month').notNull(),
    coverMediaId: integer('cover_media_id').references(() => media.id),
    pdfMediaId: integer('pdf_media_id').references(() => media.id),
    pageCount: integer('page_count'),
    legacyUrl: text('legacy_url'),
    ...timestamps,
  },
  (t) => [uniqueIndex('issues_month').on(t.year, t.month)],
);

/** Small site-wide values as JSON, e.g. `home_banner` = { post: 18024, headline: { ml } } */
export const siteSettings = sqliteTable('site_settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});
