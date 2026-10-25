// D1 tables (plan, section 5), for the content the preview has today: posts, orders, Kerala
// Service issues and the home banner, plus the admin panel's own tables at the end (users,
// working drafts, history, edit locks, audit log). Districts, topics and order subjects are fixed
// lists kept in src/data/ and copied here by the importer so rows can reference them. Events,
// videos and the state committee stay hand-written in src/data/site.ts until the admin panel
// manages them. Change this file, then `npm run db:generate` writes the migration.
import { sqliteTable, text, integer, index, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type { Body } from '../lib/richtext';

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
  /** SHA-256 of the original upload, so the same photo uploaded twice reuses one file */
  sha256: text('sha256'),
  uploadedBy: integer('uploaded_by'),
  ...timestamps,
},
(t) => [index('media_sha').on(t.sha256), index('media_kind').on(t.kind, t.id)]);

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
    /** An event this post reports on or announces (an event slug from src/data/site.ts for now) */
    eventSlug: text('event_slug'),
    /** A district admin asked for this post on the home page; a state editor decides (plan, section 10) */
    homeRequestedBy: integer('home_requested_by'),
    homeRequestedAt: text('home_requested_at'),
    legacyUrl: text('legacy_url'),
    /** Admin users; null for crawled posts */
    createdBy: integer('created_by'),
    updatedBy: integer('updated_by'),
    ...timestamps,
  },
  (t) => [
    index('posts_published').on(t.status, t.publishedAt),
    index('posts_topic').on(t.status, t.topic, t.publishedAt),
    index('posts_district').on(t.status, t.district, t.publishedAt),
    uniqueIndex('posts_slug').on(t.slug, t.publishedAt),
    // The admin's News list, newest change first, for the whole site or one district
    index('posts_updated').on(t.updatedAt),
    // The media library's "used in": which posts use a photo
    index('posts_cover').on(t.coverMediaId),
    index('posts_district_updated').on(t.district, t.updatedAt),
  ],
);

/**
 * One row per language. Malayalam is the source; English shows on the site only once it is
 * `human` or `ai_reviewed`, never as an `ai_draft` (plan, section 6). `text_hash` fingerprints the
 * row's title, summary and body; an English row's `based_on` is the Malayalam hash it was drafted
 * or approved from, so when the Malayalam changes the English is flagged "Out of date".
 */
export const postTranslations = sqliteTable(
  'post_translations',
  {
    postId: integer('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
    lang: text('lang', { enum: ['ml', 'en'] }).notNull(),
    title: text('title').notNull(),
    summary: text('summary').notNull().default(''),
    /** Crawled posts: a JSON array of paragraphs. Written in the editor: TipTap JSON (src/lib/richtext.ts) */
    body: text('body', { mode: 'json' }).$type<Body>(),
    source: text('source', { enum: ['human', 'ai_draft', 'ai_reviewed'] }).notNull().default('human'),
    reviewedAt: text('reviewed_at'),
    reviewedBy: integer('reviewed_by'),
    textHash: text('text_hash'),
    basedOn: text('based_on'),
  },
  (t) => [primaryKey({ columns: [t.postId, t.lang] }), index('post_translations_source').on(t.lang, t.source)],
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
    createdBy: integer('created_by'),
    updatedBy: integer('updated_by'),
    ...timestamps,
  },
  (t) => [
    index('orders_date').on(t.status, t.goDate),
    // The admin's duplicate check: the same GO uploaded twice
    index('orders_go').on(t.goNumber),
    index('orders_pdf').on(t.pdfMediaId),
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
    /** A draft issue isn't on the site yet (plan, section 10: "Save draft") */
    status: text('status', { enum: ['draft', 'published'] }).notNull().default('published'),
    /** Optional contents: [{ title, author, page }], in Malayalam, for search and the reader */
    toc: text('toc', { mode: 'json' }).$type<{ title: string; author?: string; page?: number }[]>(),
    legacyUrl: text('legacy_url'),
    createdBy: integer('created_by'),
    updatedBy: integer('updated_by'),
    ...timestamps,
  },
  (t) => [uniqueIndex('issues_month').on(t.year, t.month)],
);

/**
 * Events (plan, sections 5 and 11): state and district programmes for the calendar, the home
 * page and the district hubs. Times are ISO with India's offset ("2026-10-24T09:30:00+05:30").
 * English shows only once a person wrote or approved it (`en_source` not `ai_draft`). After the
 * day, `report_post_id` links the news post about it.
 */
export const events = sqliteTable(
  'events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    slug: text('slug').notNull(),
    titleMl: text('title_ml').notNull(),
    titleEn: text('title_en'),
    venueMl: text('venue_ml').notNull(),
    venueEn: text('venue_en'),
    descriptionMl: text('description_ml'),
    descriptionEn: text('description_en'),
    enSource: text('en_source', { enum: ['human', 'ai_draft', 'ai_reviewed'] }),
    startAt: text('start_at').notNull(),
    endAt: text('end_at'),
    /** null = state level */
    district: text('district').references(() => districts.slug),
    mapUrl: text('map_url'),
    registrationUrl: text('registration_url'),
    reportPostId: integer('report_post_id').references(() => posts.id),
    status: text('status', { enum: ['draft', 'in_review', 'published', 'archived'] }).notNull().default('draft'),
    /** Made-up events of the preview, labelled "Sample" on the site */
    sample: integer('sample', { mode: 'boolean' }).notNull().default(false),
    createdBy: integer('created_by'),
    updatedBy: integer('updated_by'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('events_slug').on(t.slug),
    index('events_start').on(t.status, t.startAt),
    index('events_district').on(t.status, t.district, t.startAt),
  ],
);

/**
 * Search (plan, section 11): one row per post, order and event, holding the result row search shows
 * (src/lib/search-entries.ts). Its id is the rowid of `search_fts`, the FTS5 trigram index over the
 * same item's normalised title, keywords and body, made by a hand-written migration (Drizzle
 * can't describe virtual tables). Both are rewritten whenever the item is saved.
 */
export const searchDocs = sqliteTable(
  'search_docs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    kind: text('kind', { enum: ['news', 'order', 'event'] }).notNull(),
    ref: integer('ref').notNull(),
    ml: text('ml').notNull(),
    en: text('en'),
    sub: text('sub'),
    url: text('url').notNull(),
    kw: text('kw'),
    important: integer('important', { mode: 'boolean' }).notNull().default(false),
    /** ISO date, so the newest of equally good results comes first */
    date: text('date').notNull(),
  },
  (t) => [uniqueIndex('search_docs_item').on(t.kind, t.ref)],
);

/** Small site-wide values as JSON, e.g. `home_banner` = { post: 18024, headline: { ml } } */
export const siteSettings = sqliteTable('site_settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

// ── Admin panel (plan, section 10) ──────────────────────────────────────────────────────

export const ROLES = ['super_admin', 'state_editor', 'district_admin', 'district_editor'] as const;
export type Role = (typeof ROLES)[number];

/**
 * Who may use the admin. Cloudflare Access checks the email with a one-time code; this table
 * decides whether that email gets in and with which role, so Users is the only list to keep and
 * deactivating someone works on their next click. District roles carry their district.
 */
export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    email: text('email').notNull(),
    name: text('name').notNull(),
    phone: text('phone'),
    role: text('role', { enum: ROLES }).notNull(),
    district: text('district').references(() => districts.slug),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    lastLoginAt: text('last_login_at'),
    invitedBy: integer('invited_by'),
    ...timestamps,
  },
  (t) => [uniqueIndex('users_email').on(t.email)],
);

/**
 * The editor's working copy of a published post: autosave writes here every 10 seconds, and the
 * live post changes only on Update (plan, section 10). Posts that were never published are edited
 * in place, since nobody sees them. `doc` is the whole editor state (src/lib/admin/post-doc.ts).
 */
export const postDrafts = sqliteTable('post_drafts', {
  postId: integer('post_id').primaryKey().references(() => posts.id, { onDelete: 'cascade' }),
  doc: text('doc', { mode: 'json' }).notNull(),
  updatedBy: integer('updated_by'),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

/** Version history: a full copy of an item each time it is published or updated, restorable */
export const revisions = sqliteTable(
  'revisions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    entity: text('entity').notNull(),
    entityId: integer('entity_id').notNull(),
    doc: text('doc', { mode: 'json' }).notNull(),
    note: text('note').notNull(),
    userId: integer('user_id'),
    at: text('at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index('revisions_item').on(t.entity, t.entityId, t.at)],
);

/** "Being edited by …": whoever opened an item first holds it while their editor stays open */
export const editLocks = sqliteTable(
  'edit_locks',
  {
    entity: text('entity').notNull(),
    entityId: integer('entity_id').notNull(),
    userId: integer('user_id').notNull(),
    expiresAt: text('expires_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.entity, t.entityId] })],
);

/** Who changed what and when (plan, section 5): every create, edit, publish and delete */
export const auditLog = sqliteTable(
  'audit_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id'),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: integer('entity_id'),
    /** The item's district, so district admins see their own district's log */
    district: text('district'),
    /** One line for the log, e.g. the post's title */
    summary: text('summary'),
    /** Fields that changed: { field: [before, after] } */
    diff: text('diff', { mode: 'json' }),
    at: text('at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index('audit_at').on(t.at), index('audit_district').on(t.district, t.at), index('audit_item').on(t.entity, t.entityId)],
);

// ── People, committees, districts (plan, section 5; admin slice 3) ──────────────────────

export const POSITION_ROLES = [
  'president', 'general_secretary', 'treasurer', 'vice_president', 'secretary', 'joint_secretary',
  'secretariat_member', 'committee_member', 'convener', 'joint_convener', 'member',
] as const;
export type PositionRole = (typeof POSITION_ROLES)[number];
/** The committees a position belongs to: the state committee (with its secretariat), the women's sub-committee, a district or an area committee */
export const BODIES = ['state', 'women_subcommittee', 'district', 'area'] as const;

/** One row per person, reused across posts, committees and terms. A phone shows only if entered. */
export const people = sqliteTable('people', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nameMl: text('name_ml').notNull(),
  nameEn: text('name_en').notNull().default(''),
  photoMediaId: integer('photo_media_id').references(() => media.id),
  department: text('department'),
  office: text('office'),
  phone: text('phone'),
  createdBy: integer('created_by'),
  updatedBy: integer('updated_by'),
  ...timestamps,
});

export const areaCommittees = sqliteTable(
  'area_committees',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    district: text('district').notNull().references(() => districts.slug),
    nameMl: text('name_ml').notNull(),
    nameEn: text('name_en').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [index('area_committees_district').on(t.district, t.sortOrder)],
);

/**
 * Who holds which post in which committee. `published` is the committee the site shows now;
 * "Start new term" copies it as `draft` rows to prepare the next term, and publishing that term
 * turns the old rows into `past` (kept as history). District editors add `draft` rows only.
 */
export const positions = sqliteTable(
  'positions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    personId: integer('person_id').notNull().references(() => people.id),
    body: text('body', { enum: BODIES }).notNull(),
    district: text('district').references(() => districts.slug),
    areaCommitteeId: integer('area_committee_id').references(() => areaCommittees.id),
    role: text('role', { enum: POSITION_ROLES }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    /** e.g. "2025–2028", or "63rd conference" */
    term: text('term'),
    status: text('status', { enum: ['draft', 'published', 'past'] }).notNull().default('draft'),
    createdBy: integer('created_by'),
    updatedBy: integer('updated_by'),
    ...timestamps,
  },
  (t) => [index('positions_committee').on(t.body, t.district, t.areaCommitteeId, t.status, t.sortOrder), index('positions_person').on(t.personId)],
);

/** Office addresses: the state centre, district offices and area offices. Only office phones are published. */
export const offices = sqliteTable(
  'offices',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    kind: text('kind', { enum: ['state', 'district', 'area'] }).notNull(),
    district: text('district').references(() => districts.slug),
    areaCommitteeId: integer('area_committee_id').references(() => areaCommittees.id),
    addressMl: text('address_ml').notNull(),
    addressEn: text('address_en'),
    phone: text('phone'),
    email: text('email'),
    /** Map pin, from a pasted Google Maps link: degrees × 1,000,000 */
    lat: integer('lat_e6'),
    lng: integer('lng_e6'),
    mapUrl: text('map_url'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [index('offices_district').on(t.district, t.sortOrder)],
);

/** A district's own extras: its cover photo (its history is a page with this district) */
export const districtExtras = sqliteTable('district_extras', {
  district: text('district').primaryKey().references(() => districts.slug),
  coverMediaId: integer('cover_media_id').references(() => media.id),
  updatedBy: integer('updated_by'),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

// ── Pages, documents, conferences ───────────────────────────────────────────────────────

/**
 * Static pages: About pages (History, Struggles …) and each district's history. Malayalam is the
 * source; English shows once approved, as for posts. `path` is the page's address on the site.
 */
export const pages = sqliteTable(
  'pages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    path: text('path').notNull(),
    template: text('template', { enum: ['default', 'history', 'district_history'] }).notNull().default('default'),
    district: text('district').references(() => districts.slug),
    titleMl: text('title_ml').notNull(),
    titleEn: text('title_en'),
    summaryMl: text('summary_ml'),
    summaryEn: text('summary_en'),
    bodyMl: text('body_ml', { mode: 'json' }).$type<Body>(),
    bodyEn: text('body_en', { mode: 'json' }).$type<Body>(),
    enSource: text('en_source', { enum: ['human', 'ai_draft', 'ai_reviewed'] }),
    enBasedOn: text('en_based_on'),
    status: text('status', { enum: ['draft', 'published', 'archived'] }).notNull().default('draft'),
    createdBy: integer('created_by'),
    updatedBy: integer('updated_by'),
    ...timestamps,
  },
  (t) => [uniqueIndex('pages_path').on(t.path)],
);

/** Organisation documents: Bye-Law, resolutions, jubilee volumes. A new version replaces the file, keeping the address. */
export const documents = sqliteTable(
  'documents',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    slug: text('slug').notNull(),
    kind: text('kind', { enum: ['bye_law', 'resolution', 'jubilee', 'other'] }).notNull(),
    year: integer('year'),
    titleMl: text('title_ml').notNull(),
    titleEn: text('title_en'),
    summaryMl: text('summary_ml'),
    pdfMediaId: integer('pdf_media_id').references(() => media.id),
    pageCount: integer('page_count'),
    status: text('status', { enum: ['draft', 'published', 'archived'] }).notNull().default('draft'),
    createdBy: integer('created_by'),
    updatedBy: integer('updated_by'),
    ...timestamps,
  },
  (t) => [uniqueIndex('documents_slug').on(t.slug), index('documents_pdf').on(t.pdfMediaId)],
);

/** The state conferences, 1st onwards: the timeline on /about/conferences */
export const conferences = sqliteTable(
  'conferences',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    number: integer('number').notNull(),
    year: integer('year'),
    startDate: text('start_date'),
    endDate: text('end_date'),
    placeMl: text('place_ml'),
    placeEn: text('place_en'),
    reportMl: text('report_ml'),
    albumId: integer('album_id'),
    eventSlug: text('event_slug'),
    status: text('status', { enum: ['draft', 'published'] }).notNull().default('published'),
    updatedBy: integer('updated_by'),
    ...timestamps,
  },
  (t) => [uniqueIndex('conferences_number').on(t.number)],
);

// ── Albums and videos ───────────────────────────────────────────────────────────────────

export const albums = sqliteTable(
  'albums',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    slug: text('slug').notNull(),
    titleMl: text('title_ml').notNull(),
    titleEn: text('title_en'),
    /** null = state level */
    district: text('district').references(() => districts.slug),
    eventDate: text('event_date'),
    coverMediaId: integer('cover_media_id').references(() => media.id),
    status: text('status', { enum: ['draft', 'published', 'archived'] }).notNull().default('draft'),
    createdBy: integer('created_by'),
    updatedBy: integer('updated_by'),
    ...timestamps,
  },
  (t) => [uniqueIndex('albums_slug').on(t.slug), index('albums_district').on(t.status, t.district, t.eventDate)],
);

export const albumItems = sqliteTable(
  'album_items',
  {
    albumId: integer('album_id').notNull().references(() => albums.id, { onDelete: 'cascade' }),
    mediaId: integer('media_id').notNull().references(() => media.id),
    captionMl: text('caption_ml'),
    captionEn: text('caption_en'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.albumId, t.mediaId] }), index('album_items_media').on(t.mediaId)],
);

/** YouTube videos: synced from the union's channel, or added by link; hidden ones stay off the site */
export const videos = sqliteTable(
  'videos',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    youtubeId: text('youtube_id').notNull(),
    titleMl: text('title_ml').notNull(),
    titleEn: text('title_en'),
    publishedAt: text('published_at').notNull(),
    district: text('district').references(() => districts.slug),
    hidden: integer('hidden', { mode: 'boolean' }).notNull().default(false),
    source: text('source', { enum: ['channel', 'link'] }).notNull().default('link'),
    createdBy: integer('created_by'),
    ...timestamps,
  },
  (t) => [uniqueIndex('videos_youtube').on(t.youtubeId), index('videos_date').on(t.hidden, t.publishedAt)],
);

// ── Inbox, glossary, analytics, import (admin slice 4) ──────────────────────────────────

/** Messages from the Contact page (plan, section 10, Inbox). Deleted 12 months after they arrive (section 13). */
export const contactMessages = sqliteTable(
  'contact_messages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    /** The district the sender chose; null = the state office */
    district: text('district').references(() => districts.slug),
    topic: text('topic').notNull(),
    message: text('message').notNull(),
    status: text('status', { enum: ['new', 'assigned', 'done'] }).notNull().default('new'),
    assignedTo: integer('assigned_to'),
    note: text('note'),
    /** A daily hash of the sender's address, only to limit how many messages one sender can send */
    senderHash: text('sender_hash'),
    doneAt: text('done_at'),
    ...timestamps,
  },
  (t) => [index('messages_status').on(t.status, t.createdAt), index('messages_district').on(t.district, t.status, t.createdAt), index('messages_sender').on(t.senderHash, t.createdAt)],
);

/** Union terms the AI must always translate the same way (plan, section 6) */
export const glossary = sqliteTable(
  'glossary',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ml: text('ml').notNull(),
    en: text('en').notNull(),
    note: text('note'),
    updatedBy: integer('updated_by'),
    ...timestamps,
  },
  (t) => [uniqueIndex('glossary_ml').on(t.ml)],
);

/**
 * Analytics (plan, section 14). On Cloudflare the beacon writes to Workers Analytics Engine; until
 * that is set up (and on a laptop) it writes here instead. Either way the hourly roll-up turns raw
 * events into the daily tables below, which the dashboard reads; raw rows are kept two days.
 * No cookies and no addresses: `visitor` is a hash of address, browser and the day, unreadable.
 */
export const analyticsRaw = sqliteTable(
  'analytics_raw',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    at: text('at').notNull(),
    type: text('type').notNull(),
    path: text('path').notNull(),
    visitor: text('visitor').notNull(),
    source: text('source'),
    device: text('device'),
    lang: text('lang'),
    country: text('country'),
    region: text('region'),
    /** A search's words, or a link's address (PDF opens, shares) */
    detail: text('detail'),
    /** A search's result count */
    value: integer('value'),
  },
  (t) => [index('analytics_raw_at').on(t.at)],
);

/** Per page and day: views, unique visitors, reads past 75 %, PDF opens and shares */
export const contentDaily = sqliteTable(
  'content_views_daily',
  {
    date: text('date').notNull(),
    path: text('path').notNull(),
    views: integer('views').notNull().default(0),
    visitors: integer('visitors').notNull().default(0),
    reads: integer('reads').notNull().default(0),
    opens: integer('opens').notNull().default(0),
    shares: integer('shares').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.date, t.path] }), index('content_daily_path').on(t.path, t.date)],
);

/** Per day: the site's visitors and page views, with breakdowns as JSON ({ "mobile": 120, … }) */
export const siteDaily = sqliteTable('site_stats_daily', {
  date: text('date').primaryKey(),
  visitors: integer('visitors').notNull().default(0),
  pageviews: integer('pageviews').notNull().default(0),
  devices: text('devices', { mode: 'json' }).$type<Record<string, number>>(),
  sources: text('sources', { mode: 'json' }).$type<Record<string, number>>(),
  langs: text('langs', { mode: 'json' }).$type<Record<string, number>>(),
  regions: text('regions', { mode: 'json' }).$type<Record<string, number>>(),
  notFound: text('not_found', { mode: 'json' }).$type<Record<string, number>>(),
});

/** Per day and search: how often, and how often it found nothing */
export const searchDaily = sqliteTable(
  'search_terms_daily',
  {
    date: text('date').notNull(),
    term: text('term').notNull(),
    count: integer('count').notNull().default(0),
    zero: integer('zero').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.date, t.term] })],
);

/** WordPress import runs (plan, section 12) */
export const importJobs = sqliteTable('import_jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  source: text('source', { enum: ['crawl', 'wxr', 'sql'] }).notNull(),
  status: text('status', { enum: ['running', 'done', 'failed'] }).notNull().default('running'),
  fileName: text('file_name'),
  counts: text('counts', { mode: 'json' }).$type<Record<string, number>>(),
  /** One line per item: "created post 123 · old address" */
  log: text('log'),
  startedBy: integer('started_by'),
  ...timestamps,
});
