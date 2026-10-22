# Kerala NGO Union — Website Rebuild Plan

Oct 4, 2026 · @Sherlock · last updated 22 Oct 2026

This is the master plan, kept in the repository at `docs/plan.md`. Code comments that say "plan, section N" refer to it. The plan was written before the build; where a section has a dated **Update** note, the note describes what was decided or built and wins over the original text below it. The README has the built site map. What is left to do, item by item and phase by phase, is in [`todo.md`](../todo.md) at the repository root; it is kept in step with this plan (items are added, ticked, rewritten or removed as the plan and the work change).

## 1. Overview

The new keralangounion.in will be a fast, mobile-first site on Cloudflare, managed through a built-in admin panel used by state and district editors. It replaces the current WordPress + Elementor site but keeps all of its content: news, office-bearers, government orders, the Kerala Service magazine and galleries.

**Goals**

- Make GOs, circulars and pay/pension orders easy to find on a phone in under 10 seconds.
- Let each of the 15 district committees publish their own news and office-bearer lists without help from the state office.
- Offer every article in Malayalam and English, using modern Unicode Malayalam type.
- Cut hosting and maintenance effort: no WordPress, plugins or PHP to patch.

**Success measures (checked 30 and 180 days after launch)**

| Goal | Measure | Target |
| --- | --- | --- |
| Members find orders fast | Time from home page to the right GO PDF in usability tests | under 30 seconds |
| Search works | Share of searches with zero results | under 5 % |
| Districts stay active | News posts per district per month | 4 or more |
| English keeps up | New posts with reviewed English within 48 hours | 90 % or more |
| Admins are self-sufficient | District admins publishing without help after training | all 15 districts |
| Reach grows | Monthly unique visitors vs the first month after launch | +50 % by month 6 |
| Site stays fast | Lighthouse score on key templates | 95 or more |

**Decisions already made**

| Topic | Decision |
| --- | --- |
| Data for development | Crawl the public site and use it as demo data |
| Real migration | Admin panel gets a "WordPress import" tool (WXR export file or DB dump) |
| Admin roles | Super admin, state editors, and 15 district admins limited to their own district |
| Language | Menus and UI labels stay in English; only article content switches between Malayalam and English |
| English content | AI drafts the English version; an admin reviews it before publishing |
| Extra features | Search across GOs and news, magazine reader, events calendar |
| Hosting | Cloudflare Pages + Workers, R2 for files, Cloudflare D1 for data (decided 22 Oct 2026, replacing Neon Postgres) |
| Out of scope (v1) | Member login, member directory, online payments |

**Development status (updated 22 Oct 2026):** the public site is designed and every page is built, running as a preview on real content crawled from the current site. The admin panel is wireframed but not built. Nothing is on the real domain yet.

| Step | Status |
| --- | --- |
| Prototype (Phase 1 preview) | Done in early Oct 2026; replaced by the redesign below |
| Redesign A · Wireframes | Done: greyscale wireframes at `/wireframes` (Home, News, Article, Orders, District, About). On 22 Oct 2026 ten more followed for pages not built yet (History, Conferences and one conference, Struggles, Documents and one document, one event, a photo album, the Kerala Service reader, the offline page), approved the same day. Every wireframe and its status is in [`wireframelist.md`](../wireframelist.md) |
| Redesign B · Design system | Done and approved: tokens, components and the living style guide at `/design-system` (see section 7) |
| Redesign C · Main pages | Done: Home, News, Article, Orders, Single order, Search |
| Redesign D · Remaining pages | Done and approved: Districts, District hub, Events, Kerala Service + issue, About hub, State committee, Contact, Media, Useful links, Privacy, Accessibility, 404 |
| Redesign E · Testing with members | Not started: usability test with members on their own phones (section 7, step 5) |
| Redesign F · Clean-up | Done: prototype layout, styles, components and Preact removed |
| Real content | Done 21 Oct 2026: 1,611 news posts, 379 orders and 138 Kerala Service issues crawled from the current site into `src/data/live/` (sections 2 and 12). Photos and PDFs are still linked from the old site |
| Home additions | Done: the home banner (one post or event, section 8) and an Articles section (the 3 newest posts in the new Articles topic) |
| Admin wireframes | Done and approved: all 18 screens at `/wireframes/admin` (the last six, Pages & documents, Districts, Analytics, Audit log, Import and Help, on 22 Oct 2026), with a "View as" switch for the four roles (section 10) |
| Database | Decided 22 Oct 2026: Cloudflare D1 (section 4); Malayalam search tested on a local D1 with the crawled content (section 11) |
| Phase 1, local part | Done 22 Oct 2026: D1 tables and migrations, the crawl loaded into a local D1, every content page reading D1 on request, and the edge cache with purge by tag, tested locally (sections 4, 5 and 15) |
| Phase 1 onwards (section 15) | Not started: union-owned accounts, deploying D1 and R2, admin login, the admin panel build, WordPress import |

Still open from the design work: whether to build the Tools & guides calculators and how-to guides (their home-page tiles show "Coming soon"), and moving History, Conferences, Struggles and Documents over from the old site (their About cards show "Coming soon"). Section 17 lists every open question.

## 2. Current site audit

The current site holds about 55 pages, several hundred news posts (2014 to June 2026), \~330 GO PDFs and \~150 magazine issues. All of it is spread across WordPress pages, posts and three plugins.

**Current tree (condensed)**

```
Home
├── സംഘടന: ചരിത്രം · സംസ്ഥാന കമ്മിറ്റി · സമ്മേളനങ്ങള്‍ · പ്രക്ഷോഭങ്ങള്‍
│   └── സംഘടന രേഖകള്‍: Silver Jubilee · Golden Jubilee · 1965 resolution · Bye-Law
├── ജില്ലാ കമ്മിറ്റികള്‍ (15) → each: news · ഭാരവാഹികള്‍ · ചരിത്രം · കമ്മിറ്റികള്‍ · വിലാസങ്ങള്‍ · ഗാലറി
├── എഫ്.എസ്.ഇ.ടി.ഒ: സംഘടന · വാര്‍ത്തകള്‍
├── വിലാസം (contact)
└── Resource pages: ശമ്പള പരിഷ്കരണം · സർക്കാർ ഉത്തരവുകൾ · കേരള സർവീസ് magazine · ഗാലറി
    · കലാകായികം · സന്നദ്ധ / സാമൂഹിക പ്രവർത്തനങ്ങൾ · Secretary's page · ജനപക്ഷ സിവിൽ സർവീസ്
```

**Content inventory**

| Content type | Volume | Where it lives today |
| --- | --- | --- |
| Static pages | \~55 | WordPress pages built with Elementor |
| District sub-pages | 89 (6 per district; Kottayam has no addresses page) | WordPress pages |
| News posts | several hundred; exact count after crawl | WordPress posts, 56 categories |
| GOs and circulars | \~330 PDFs in 34 categories | WP Download Manager 3.3.72 |
| Kerala Service magazine | \~150 monthly issues, Nov 2014 to Mar 2026 | Real3D Flipbook plugin |
| Photos | 2017 to 2026 | /wp-content/uploads/ |
| Videos | YouTube channel | Elfsight widget (currently broken) |

> **Update, 21 Oct 2026: crawl results.** The public crawl (section 12) found 1,611 news posts (2013 → 2026, 1,245 with a photo); about 100 more posts that hold district data (office-bearers, committees, history, addresses, galleries), kept out of news for the district hubs; 379 GOs and circulars (78 with a GO or circular number); and 138 Kerala Service issues (Sep 2014 → Mar 2026). Old URLs are kept on every item as `legacyUrl`.

**Problems to fix in the rebuild**

- Office-bearer lists are typed as plain text, so they cannot be filtered, reused or updated cleanly.
- Category sprawl: 56 post categories, including 15 separate "district gallery" categories and duplicates (two GIS categories).
- Junk pages are live: /test-2022/, /fseto-copy/, /fseto-news-copy/, /\_\_trashed/, /k/.
- URLs are percent-encoded Malayalam (e.g. /%e0%b4%95%e0%b5%8a…), which are hard to share and fragile.
- The YouTube gallery shows a raw shortcode; the Twitter link is empty; contact email and phone are blank.
- The WordPress REST API returns HTTP 500, so data must come from an HTML crawl or an admin export.
- Heavy page weight: the full 15-district mega-menu is repeated in the HTML of every page.

## 3. New information architecture

The new site has 8 top-level sections with English menu labels. Every district gets one hub page instead of six separate pages, and the 56 old categories collapse into a few topic tags plus a district field.

**What changed from the old site**

- **Districts:** 6 separate pages per district (90 pages behind a 15-district mega-menu) become one hub per district with tabs, reached from a clickable Kerala map.
- **Orders:** GOs move from a home-page tile into the main menu, with search and filters, because they are what members look for most.
- **Menu:** 8 flat sections replace the deep nested menu; phones get a bottom bar (Home, News, Orders, Districts, More).
- **Categories:** 56 categories become about 8 topics plus a district field; duplicates and test pages are removed.
- **New:** events calendar, site-wide search, analytics with view counts.
- **URLs:** readable addresses (e.g. `/districts/kollam`) replace percent-encoded Malayalam, and every old link redirects to its new page.

**Primary navigation (desktop header / mobile bottom bar + menu)**

Home · About · News · Districts · Orders · Kerala Service · Events · Gallery · Contact, plus a search icon and the ML / EN article switch.

**Sitemap**

```
/                              Home
├── /about                     About the Union (overview)
│   ├── /about/history
│   ├── /about/state-committee        office-bearers + secretariat + committee
│   ├── /about/conferences            timeline 1st → 63rd
│   │   └── /about/conferences/{n}    one conference
│   ├── /about/struggles
│   ├── /about/documents              Bye-Law, 1965 resolution, jubilee documents
│   │   └── /about/documents/{slug}
│   ├── /about/fseto                  FSETO overview
│   └── /about/secretary              Secretary's page (column / messages)
├── /news                      all news, filter by topic, district, year
│   ├── /news/topic/{topic}           e.g. fseto, social-work, arts-sports, janapaksha
│   └── /news/{year}/{slug}           article
├── /districts                 map + list of 15 districts
│   └── /districts/{district}         hub: news · office-bearers · history ·
│                                     area committees · addresses · gallery (tabs)
├── /orders                    GO & circular library (search + filters)
│   ├── /orders/{category}            e.g. pay-revision, pension, nps, da, leave
│   └── /orders/{id}-{slug}           one order: details + PDF viewer + download
├── /kerala-service            magazine archive by year
│   └── /kerala-service/{year}/{month}  issue reader
├── /events                    calendar + list
│   └── /events/{slug}
├── /gallery                   photo albums + videos
│   ├── /gallery/{album}
│   └── /gallery/videos
├── /search?q=                 site-wide search
├── /contact                   address, map, contact form
├── /useful-links              Kerala Govt portals (SPARK, eOffice, PSC …)
└── /en/…                      English version of every article URL

/admin/…                       admin panel (separate app, login required)
```

> **Update, 22 Oct 2026: what was built.** The README has the full built site map. Differences from the sitemap above:
>
> - Topics and order subjects are filters in the URL, not separate pages, so filtered views can be shared: `/news?topic=fseto&district=kollam&q=…` and `/orders?q=…&g=govt|nps|pension&s={subject}&y={year}`.
> - The 9 topics are `struggles`, `organisation`, `fseto`, `social-work`, `arts-sports`, `janapaksha`, `seminars`, `secretary` and `articles`. FSETO news and the Secretary's page are topics rather than About pages.
> - The 22 order subjects are `da`, `pay-revision`, `pay-fixation`, `leave`, `bonus`, `allowance`, `gpf`, `gis-sli`, `hba`, `increment`, `ltc`, `medisep`, `ta`, `medical`, `service`, `part-time`, `ugc-aicte`, `other`, `nps`, `pension`, `pension-revision` and `ex-gratia`.
> - The district hub's tabs are `#news`, `#office-bearers`, `#offices` and `#gallery`.
> - `/gallery` is titled "Media" (videos now, photo albums later). `/privacy` and `/accessibility` exist, and `/rss.xml` carries the newest 30 posts.
> - Not built yet: `/about/history`, `/about/conferences`, `/about/struggles`, `/about/documents` (their About cards say "Coming soon"), one page per event, photo albums, `/admin` and the Tools & guides calculators.
> - Redirects from old links are on hold (section 12).

**URL rules**

| Rule | Example |
| --- | --- |
| Slugs are lowercase Latin (transliterated from the Malayalam title, editable by the admin) | /news/2026/world-environment-day-tree-planting |
| Malayalam is the default at the root; English lives under /en | /en/news/2026/world-environment-day-tree-planting |
| District slugs are fixed | tvm-north, tvm-south, kollam, pathanamthitta, alappuzha, kottayam, idukki, ernakulam, thrissur, palakkad, malappuram, kozhikode, wayanad, kannur, kasaragod |
| Orders keep a stable numeric id so links never break when titles change | /orders/1042-da-revision-2026 |
| Every old WordPress URL gets a 301 redirect to its new URL | see section 12 |

**Content mapping (old → new)**

| Old | New |
| --- | --- |
| 15 district news categories + 15 district gallery categories | One `district` field on news posts and albums |
| Topic categories (FSETO news, social activities, sports, events, Janapaksha civil service, voluntary activities, secretary's page, latest news) | \~8 topic tags |
| "home-slider" category | A "Feature on home page" toggle on any post |
| "upcoming-events" category | Proper Event records with dates |
| Download Manager categories (34) | 3 order groups × \~25 subjects, duplicates merged |
| Real3D flipbooks | Magazine issues (PDF in R2 + cover image) |
| District pages (6 × 15) | Structured district data rendered on one hub page per district |

## 4. Tech stack and architecture

One TypeScript monorepo deploys a server-rendered Astro public site and a React admin app to Cloudflare. Content lives in Cloudflare D1, and files live in R2. Hosting should stay within free tiers or a few dollars a month.

> **Decided 22 Oct 2026: the database is Cloudflare D1 (SQLite), not Neon Postgres.** It runs on the same account and network as the site, needs no connection pooling, never sleeps, and its free plan fits this site; at about 50,000 visitors a day the site needs Workers Paid ($5/month) anyway, which also raises the D1 limits. Search uses SQLite FTS5 with the trigram tokenizer. Each preview gets its own D1 database, and backups are D1 Time Travel plus a nightly export to R2.

```
Members ──► Cloudflare edge cache ──(miss)──► Astro on Workers ──► D1 (content)
                │
                └──► PDFs and photos: R2 (media.keralangounion.in), cached for a year

Admins ──► Cloudflare Access ──► /admin app ──► API (Hono on Workers) ──► D1 + R2,
                                     │                                then purges changed pages
                                     └──► English drafts: admin's browser ──► Gemini (admin's own key)
```

Members only ever hit cached pages and files; admins pass Cloudflare Access before the API, which alone writes to D1 and R2. English drafts go from the admin's browser straight to Gemini with the admin's own key.

**Stack**

| Layer | Choice | Why |
| --- | --- | --- |
| Public site | Astro 7 (Cloudflare adapter) with plain page scripts, no client framework | Ships almost no JavaScript; each interactive part (search, filters, calendar, video player) is a small script on the page that needs it |
| Styling | Tailwind CSS 4 + design tokens in `src/styles/app.css` (section 7) | One token file shared by public site and admin |
| UI components | Public site: own design-system components (`src/components/ds/`) and Lucide icons. Admin: shadcn/ui (Radix primitives) | Built around the Malayalam type and tokens; Radix gives the admin accessible dialogs, menus and tabs |
| Admin app | React + Vite SPA at /admin, TanStack Router + Query, shadcn/ui | Fast, app-like editor; no SEO needs |
| Rich text editor | TipTap (ProseMirror) | Handles Malayalam input well, stores clean JSON, supports images, tables, embeds |
| API | Hono on Cloudflare Workers (Pages Functions) | Small, typed, runs at the edge next to the site |
| Database | Cloudflare D1 (SQLite), Drizzle ORM | Same account and network as the site; no connection pooling or idle wake-up; free plan fits |
| Files | Cloudflare R2 bucket, served from media.keralangounion.in | No egress fees for PDFs, magazine and photos |
| Admin login | Cloudflare Access (email one-time code) + roles table in D1 | No passwords to manage; per-user access can be revoked instantly |
| Search | SQLite FTS5 full-text index with the trigram tokenizer | Works for Malayalam without a stemmer; matches parts of words and GO numbers |
| AI translation | Google Gemini API with each admin's own key (bring your own key), called from the admin's browser | The key never reaches our server or database (section 6) |
| Contact form | Worker + Cloudflare Turnstile + Email Routing / Resend | Spam-protected, no third-party form service |
| Analytics | Own cookie-less analytics on Workers Analytics Engine + Cloudflare Web Analytics for speed metrics | Visits, page views and per-article view counts without cookies or a consent banner (section 14) |
| CI/CD | GitHub → Cloudflare Pages builds; preview URL per branch with its own D1 database | Every change is reviewable before going live |

**Build note.** Until 22 Oct 2026 the preview built every page ahead of time (about 4,330 pages from the crawled JSON, about 75 s). Now pages that show posts, orders or Kerala Service issues render on request from D1 and are kept in the edge cache, as described below; only the fixed pages (about 40) are built ahead, in about 10 s. `src/lib/content.ts` is still the only place pages get content from; its functions are Drizzle queries that each read only what their page shows. The wireframes and `/design-system` stay prebuilt from the crawled JSON.

**Hosting note.** Cloudflare Pages is used as requested. Cloudflare now steers new full-stack projects towards Workers with static assets, while Pages remains fully supported. The same Astro build deploys to either, so this can be switched later without code changes.

**Caching.** Public pages are cached at Cloudflare's edge. When an admin publishes, the API purges only the affected URLs (the article, its listings, the home page and the district hub), so updates appear within seconds.

**Caching and database reads.** A visit does not read D1. A page is read from D1 once, built into HTML and kept at the edge, and every later visitor, including the same person coming back, gets that saved copy without the site's code or D1 running at all.

1. The first visit to a page after it changes (at each Cloudflare location) misses the cache: the Worker reads what the page needs from D1, builds the HTML, sends it and stores a copy at the edge.
2. Every later visit is a cache hit: zero database reads.
3. When an admin publishes or edits, only the affected URLs are purged (see above). The next visit to each rebuilds it once.

Cloudflare does not cache HTML by default. The site uses Astro 7's route caching with the Cloudflare adapter's provider: each page sends `Cloudflare-CDN-Cache-Control` (lists 1 hour, single items 1 day, both served stale while they refresh) and `Cache-Tag` headers naming what it shows (`posts`, `post:18039`, `orders`, `order:11494`, `issues`, `banner`), and Cloudflare's Worker cache keeps it. Publishing purges by tag (`src/lib/cache.ts`, `purgeTags`), so a new post rebuilds the home page, News, the district hubs and the indexes, but no other article. Missing pages (404) are never cached.

> **Update, 22 Oct 2026: tested locally.** Cloudflare's Worker cache doesn't run on a laptop, so `npm run preview:cached` builds the same site with Astro's in-memory cache. On the local D1: the first visit to `/news` ran 2 D1 queries; every later visit was a cache hit with 0 queries. Purging `posts` made News and the home page read D1 once more while Orders stayed cached; purging one post's tag rebuilt only that article (both languages). The normal build sends the Cloudflare headers above; seeing them take effect at the edge needs the union's account.

| Measure | What it saves |
| --- | --- |
| Edge cache, purged on publish | Pages are built once per change, not once per visit. The main measure. |
| Browser cache | Photos, fonts, CSS and JS carry long cache lifetimes (file names change when the file changes), so a return visit downloads almost nothing. |
| An index for every list query | D1 counts the rows it scans, not the rows it returns. Without an index on date, "newest 10 posts" scans every post (1,611 rows read); with one it reads about 10. |
| Limited lists | Pages show the newest items plus "Load more", never a whole archive in one query. |
| FTS5 search index | A search reads only the matching index entries, not every article. Results for a query are cached at the edge for a few minutes, so popular searches are nearly free. |
| Files outside D1 | PDFs and photos live in R2 and are cached at the edge; D1 never serves them. |
| View counts | Read from a small endpoint cached for 5 minutes (section 14), so counts never stop pages from being cached. |

What still reads D1: the first visit to a changed page, uncached searches, the admin panel, the contact form and the hourly analytics roll-up.

Rough numbers at 50,000 visitors a day (about 4 pages each, 200,000 page views, about 100 rows read to build a page): with no caching at all, about 20 million rows a day, over the free plan's 5 million but about 2 % of the Workers Paid monthly allowance; with caching, well under a million rows a day, inside the free plan.

> **Update, 22 Oct 2026: what each page actually costs to build.** Every query was checked with `EXPLAIN QUERY PLAN`: all walk an index, none scans a table or sorts in memory. Local D1 doesn't report rows read, so these are estimates from the plans (each post on a list reads about 4 rows: the post, two translations and its photo): an article or order about 10–30 rows; a district hub about 150; Orders about 760; Kerala Service about 420; the Districts page about 1,400 and News about 1,700 (their per-district and per-topic counts walk every post's index entry); the home page about 2,300 (26 small queries, run in parallel); `/news-index.json` and `/search-index.json` about 6,400 and 7,200 (every post, for the browser search). If every list page were rebuilt every hour at each of three Cloudflare locations serving Kerala, and every article and order once a day, that is at most about 2.5 million rows a day, inside the free plan. Moving search into D1 (section 11) later removes the two indexes, the largest share. Each page's query plan is checked (`EXPLAIN QUERY PLAN`, and `rows_read` in D1's query results) before it ships, and usage alerts fire at 80 % of the daily limit (section 13).

**Images.** The admin app resizes uploads in the browser into a fixed set of WebP sizes and sends them straight to R2. This keeps pages fast without a paid image service; the full rules are under "Media and thumbnails" in section 9.

**Expected running cost**

| Service | Free allowance | Expected use |
| --- | --- | --- |
| Cloudflare Pages / Workers | Free plan | Fits |
| Cloudflare D1 | Free: 5 million rows read and 100,000 written per day, 500 MB per database. Workers Paid ($5/month): 25 billion reads and 50 million writes per month | Text and indexes fit for years; with edge caching, reads stay inside the free plan (see "Caching and database reads"); at about 50,000 visitors a day the site moves to Workers Paid anyway |
| Cloudflare R2 | 10 GB-month storage free, egress free, then $0.015/GB-month | \~150 magazine PDFs + \~330 GOs + photos may reach 5–15 GB, so about $0–1 a month |
| AI translation | Pay per use | Billed to the Google account that owns the Gemini key, not to the site |

Sources: [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/)

## 5. Content model

Every content type is a D1 (SQLite) table. Readable text sits in a separate `*_translations` table with one row per language (ml, en), so the site can show Malayalam, English, or a fallback for any item.

> **Update, 22 Oct 2026: the first tables.** `src/db/schema.ts` (Drizzle) defines the tables for the content that exists: `districts`, `topics`, `order_subjects` (fixed lists, copied from `src/data/`), `media`, `posts` + `post_translations`, `orders`, `magazine_issues` and `site_settings` (the home banner). `npm run db:generate` writes migrations into `migrations/`; `npm run db:seed` loads the crawl. Differences from the list below: districts, topics and subjects are keyed by their slug; a post's slug sits on `posts` (both languages share the URL); crawled files are `media` rows with the old site's `source_url` until they move to R2 (`r2_key`); order titles stay as columns on `orders`, as listed. Events, videos and people are still hand-written in `src/data/site.ts`; their tables come with the admin screens that edit them.

**Shared columns on every content table:** `id`, `district_id` (null = state level), `status` (draft · in\_review · scheduled · published · archived), `published_at`, `created_by`, `updated_by`, `created_at`, `updated_at`, `legacy_url` (old WordPress URL, for redirects).

**Shared columns on every translations table:** `lang` (ml/en), `title`, `slug`, `summary`, `body` (TipTap JSON), `source` (human · ai\_draft · ai\_reviewed), `reviewed_by`, `reviewed_at`.

| Table | Key fields | Notes |
| --- | --- | --- |
| districts | id, slug, name\_ml, name\_en, sort\_order, map\_path | 15 fixed rows: TVM North and TVM South are separate |
| users | id, email, name, phone, active, last\_login\_at | Login is through Cloudflare Access; no passwords stored |
| user\_roles | user\_id, role, district\_id | Roles: super\_admin, state\_editor, district\_admin, district\_editor (section 10) |
| posts | shared + topic\_ids, cover\_media\_id, featured\_on\_home, pinned\_until, event\_id | News, press notes, Secretary's column, FSETO news |
| topics | id, slug, name\_ml, name\_en | 9 tags replacing the 56 old categories (list in section 3) |
| pages | shared + template (default · history · documents · contact) | About, History, Struggles, Bye-Law and other static pages |
| documents | shared + doc\_type (bye-law · resolution · jubilee), year, pdf\_media\_id | Organisation documents |
| conferences | number, year, place, start\_date, end\_date, summary (translations), album\_id | 1st → 63rd state conferences; drives the conference timeline |
| people | id, name\_ml, name\_en, photo\_media\_id, department, office | One row per person; reused across terms and committees |
| positions | id, person\_id, body (state · district · area), district\_id, area\_committee\_id, role (president · vice\_president · secretary · joint\_secretary · treasurer · secretariat\_member · committee\_member), sort\_order, term\_start, term\_end | Replaces the plain-text office-bearer lists; past terms are kept as history |
| area\_committees | id, district\_id, name\_ml, name\_en, sort\_order | District → area committees |
| offices | id, district\_id, area\_committee\_id, type (state centre · district · area), address\_ml, address\_en, phone, email, lat, lng | Powers the addresses pages and maps |
| orders | id, go\_number, go\_date, department, order\_group (govt · nps · pension), subject\_id, title\_en, title\_ml, summary, pdf\_media\_id, pdf\_text, is\_important | 379 GOs in the crawl; `pdf_text` feeds search |
| order\_subjects | id, group, slug, name\_en, name\_ml | 22 subjects across the 3 groups (list in section 3), duplicates merged |
| magazine\_issues | id, year, month, title, cover\_media\_id, pdf\_media\_id, page\_count, toc (JSON) | Kerala Service archive |
| events | shared + start\_at, end\_at, all\_day, venue, district\_id, map\_url, registration\_url | Calendar; past events link to their news report |
| albums | shared + cover\_media\_id, event\_date | Photo albums; `district_id` gives district galleries |
| album\_items | album\_id, media\_id, caption\_ml, caption\_en, sort\_order |  |
| videos | id, youtube\_id, title\_ml, title\_en, published\_at, district\_id | Synced from the YouTube channel feed |
| media | id, r2\_key, kind (image · pdf · other), mime, bytes, width, height, variants (JSON), alt\_ml, alt\_en, uploaded\_by | Every file in R2 |
| useful\_links | id, label, url, group, sort\_order | Footer and /useful-links |
| site\_settings | key, value | Contact details, social links, home page layout, the home banner (one post or event id, optional shorter headline) |
| contact\_messages | id, name, email, phone, district\_id, subject, message, status | Shown in the admin inbox |
| redirects | from\_path, to\_path, code | Imported from the crawl, editable by super admin (on hold, section 12) |
| audit\_log | id, user\_id, action, entity, entity\_id, diff (JSON), at | Every create, edit, publish and delete |
| import\_jobs | id, source (crawl · wxr · sql), status, counts (JSON), log, started\_by | WordPress import runs (section 12) |
| search\_fts | FTS5 virtual table (trigram): kind, ref, title, body | Normalised title and text of every searchable item; kept in step by the API on every save (section 11) |

## 6. Bilingual approach

Menus, buttons and labels are always in English. The ML / EN switch changes only article content: titles, summaries, bodies, captions and document titles. Malayalam is the default and the source of truth; English is drafted by AI and published only after an admin reviews it.

**How the switch works**

- A two-state pill in the header (`മല | EN`) sits next to search on desktop and inside the top bar on mobile.
- Malayalam URLs live at the root (`/news/…`); English URLs live under `/en/` (`/en/news/…`). The switch moves to the same item in the other language, never back to the home page.
- The choice is remembered in a cookie, and all listing pages (news, orders, events) follow it.
- If an item has no reviewed English version, it shows in Malayalam with a small note: "English version not yet available". It never shows an unreviewed AI draft.
- Content blocks carry `lang="ml"` or `lang="en"`, so fonts, line height and screen readers switch correctly.
- `hreflang` tags link each Malayalam page to its English twin for search engines.

**AI translation workflow**

1. The editor writes or edits the Malayalam version and saves it.
2. If **Auto-translate on save** is on and the editor has unlocked a Gemini key, the English draft is generated every time the post is saved or updated. Otherwise they press **Draft English** when ready.
3. The admin's browser sends the Malayalam text, the glossary and fixed rules directly to the Gemini API with the admin's key, and saves the result as an English draft marked `ai_draft`.
4. The editor sees the two versions side by side, corrects the English and presses **Approve English**. The draft becomes `ai_reviewed` and goes live.
5. If the Malayalam changes later, the English is flagged **Out of date** in the admin list until it is re-drafted or re-approved.

**Gemini key: bring your own key (BYOK)**

The site never keeps a permanent AI key. Each admin who translates enters their own Gemini key in **Admin → Settings → AI translation**, and chooses how long the browser may hold it.

| Key mode | Where the key lives | Cleared when |
| --- | --- | --- |
| This session only (default) | Memory of the open admin tab | Tab closed, logout, or 30 minutes idle |
| Remember on this device | Encrypted in the browser (IndexedDB, protected by a non-extractable WebCrypto key) | After 7 days, on "Forget key", or on logout from all devices |

- The key is never saved in the database, never put in Cloudflare environment variables, and never written to logs. Translation requests go from the admin's browser straight to the Gemini API over HTTPS, so our API never sees the key.
- The settings screen has: paste key · **Test key** · key mode · **Auto-translate on save** toggle (on by default) · model choice (a fast Gemini Flash-class model by default; the super admin can change it without code changes) · **Forget key**.
- With no key unlocked, saving works as normal. The English version is marked **Needs translation**, and **Draft English** asks for the key.
- The super admin can switch AI translation off for the whole site; English can still be typed by hand.
- Help text on the screen recommends: create the key under a union-owned Google account, restrict it to the Gemini (Generative Language) API only, set a usage quota or budget alert, and rotate it every 3 months or when an admin leaves.
- Because the key sits in the browser, the admin app's strict Content-Security-Policy allows network calls only to our API and the Gemini endpoint, and all rich text is sanitised, to block script injection.

**Translation rules given to the model**

- Keep every number, date, GO number (e.g. G.O.(P) No. 81/2014/Fin), amount and URL exactly as written.
- Use names from the `people` table for consistent English spellings of office-bearers.
- Use the glossary for union terms. Examples: എഫ്.എസ്.ഇ.ടി.ഒ → FSETO; ജനപക്ഷ സിവിൽ സർവീസ് → People-oriented Civil Service; ക്ഷാമബത്ത → Dearness Allowance (DA); ശമ്പള പരിഷ്കരണം → Pay Revision.
- Translate, never summarise or add. Keep paragraph and list structure.
- The glossary is an admin screen, so state editors can add terms over time.

**What stays single-language**

- GO PDFs and magazine PDFs remain as published. Only their titles and summaries are translated.
- Office-bearer names have both Malayalam and English fields, filled once per person.

## 7. Design system

> **Update, 21 Oct 2026.** The design was redone from scratch in Oct 2026 and approved; where this section differs, the built design wins. Source of truth: `src/styles/app.css` and the `/design-system` page.
>
> - Direction: "civic newsroom". Calm, flat and content first, with one union-red accent (#C8102E). The page background is white, not warm paper.
> - Fonts: Noto Sans Malayalam for body text and all UI labels (replaces Manjari and Inter); Anek Malayalam for titles, drawn 16 % taller (size ×1.16, 86 % width). Body text is 16 px.
> - Contrast: every text colour is at least 5.2:1 in both light and dark themes. Dark theme is built and follows the phone, with a manual switch.
> - Layout rules: columns side by side end on the same line; no story appears twice on a page; stories without a photo get a neutral tile with their topic.
> - Search is a full page (`/search`) opened from the header box or the phone's Search tab, instead of a command dialog. There is no mega-menu.
> - Home banner: a panel in the logo's red (#B00D27, the same in both themes) with white text (7.2:1) and a warm yellow (#FFD970, 5.25:1) for its label and Read more. A photo behind it is greyscale and multiply-blended at 40 %, so it can only darken the panel.
> - The public site uses its own components and plain scripts, not Radix or shadcn/ui; icons are Lucide through `ui/Icon`.

The look is clean, confident and news-like: warm paper backgrounds, the union's red as the one strong colour, and large, airy Malayalam type. Every value below becomes a design token shared by the public site and the admin.

**Typography**

| Use | Font | Notes |
| --- | --- | --- |
| Malayalam headings | Anek Malayalam (variable, weights 500–800, normal and semi-condensed widths) | Modern Unicode Malayalam with strong headline presence; SIL OFL licence |
| Malayalam body text | Manjari (400, 700) | Rounded, highly readable for long articles; SIL OFL licence |
| English and UI labels | Inter (variable) | Menus, buttons, forms, admin; tabular figures for dates and GO numbers |
| English headings | Anek Latin | Visually matches the Malayalam headings |

Fonts are self-hosted from the site (Fontsource packages), subset to Malayalam + Latin, with `font-display: swap` and a preload for the Malayalam body font.

All four fonts are Unicode, so text can be copied, searched and read aloud by screen readers. Old ASCII-based Malayalam fonts (such as ML-TT) are not used. If the union prefers a different feel, these can be swapped in without layout changes:

| Alternative | Character | Best for |
| --- | --- | --- |
| Noto Sans Malayalam | Plain, neutral | Body or headings |
| Gayathri | Soft, friendly | Headings |
| Rachana | Traditional orthography, classic print look | Body text close to government document style |

A font sample page with the union's own text in each option is part of the Phase 0 style guide.

**Type scale (mobile → desktop, px)**

| Token | Size | Line height (ml / en) | Weight |
| --- | --- | --- | --- |
| display | 32 → 48 | 1.35 / 1.15 | 700 |
| h1 | 28 → 38 | 1.4 / 1.2 | 700 |
| h2 | 22 → 28 | 1.45 / 1.25 | 650 |
| h3 | 19 → 22 | 1.5 / 1.3 | 600 |
| body | 17 → 18 | 1.8 / 1.6 | 400 |
| small | 14 → 15 | 1.7 / 1.5 | 400 |
| caption | 13 | 1.6 / 1.4 | 500 |

Malayalam needs more line height than English because of its tall vowel signs and conjuncts. The `lang` attribute switches line height automatically.

**Colour tokens (light theme)**

| Token | Value | Use |
| --- | --- | --- |
| brand-600 | #C8102E | Primary buttons, active nav, links, key highlights |
| brand-700 | #9B0D23 | Hover and pressed states |
| brand-50 | #FDECEE | Tinted backgrounds, selected chips |
| ink | #1B1A19 | Main text |
| ink-muted | #5C5852 | Meta text, captions |
| paper | #FAF8F5 | Page background |
| surface | #FFFFFF | Cards, panels |
| line | #E6E1D9 | Borders, dividers |
| success | #1F7A4D | Published, success messages |
| warning | #B26B00 | Drafts, out-of-date translations |
| info | #1F5FAD | Notices, links in admin |

A dark theme mirrors these tokens (paper #141312, surface #1E1C1A, brand-500 #E5484D) and follows the phone's setting. All text pairs meet WCAG AA contrast (4.5:1).

**Layout and shape**

- 4 px spacing scale (4, 8, 12, 16, 24, 32, 48, 64).
- Grid: 4 columns with 16 px gutters on mobile, 8 on tablet, 12 on desktop. Content max-width 1200 px; article text max 68 characters per line.
- Corner radius: 8 (inputs, chips), 12 (cards), 16 (sheets and modals).
- Shadows are minimal; depth comes from borders and paper/surface contrast.
- Icons: Lucide, 20 px, 1.75 stroke.
- Motion: 150–200 ms ease-out for hovers, sheets and tabs. All motion is turned off under `prefers-reduced-motion`.

**Component library**

| Group | Components |
| --- | --- |
| Navigation | Header, desktop mega-menu (Districts grid, Orders subjects), mobile top bar, mobile bottom nav, breadcrumbs, ML/EN pill, footer |
| Discovery | Command-style search dialog, filter chips, sort menu, pagination / "load more", empty states |
| News | Hero story, story card (large, medium, compact), topic badge, district badge, share bar (WhatsApp, Facebook, copy link) |
| Orders | Order row (GO number badge, date, subject, PDF size), order card (mobile), PDF viewer, "Important" ribbon |
| People | Office-bearer card (photo, name, role), leadership row, committee list, organisation chart |
| Districts | Interactive Kerala district map (SVG), district card, district hub tabs |
| Time | Conference timeline, event card, month calendar, agenda list, "upcoming" strip |
| Media | Album grid, lightbox, video grid with YouTube lite-embed, magazine cover grid, magazine reader |
| Feedback | Toasts, skeleton loaders, inline alerts, form fields with Malayalam input support |

**Research and validation (before high-fidelity design)**

1. **Kick-off workshop** with the state office (1–2 hours): goals, must-haves, and who signs off each gate.
2. **6–8 short interviews**: members from different departments and age groups, plus 2–3 district admins. What do they look for, on which devices, and what frustrates them today?
3. **Low-fidelity wireframes** (grey boxes) of Home, Article, Orders, District hub and the admin post editor, reviewed with the state office. These are cheap to change.
4. **Tree test** of the new menu with 10–15 members using Malayalam task wording (e.g. "find the latest DA order"). Target: 80 % find the right place first time.
5. **Usability test** of the clickable prototype with 5 members on their own phones, using 3 tasks: find a DA order, read your district's latest news, open the current Kerala Service. Problems are fixed before the design gate.
6. **Interface wording**: one person owns all English button labels, error messages, empty states and emails, using a one-page style sheet.

**Design deliverables before development**

- [x] Style guide: type, colour, spacing, icons, with Malayalam and English samples (the `/design-system` page)
- [x] Component library in Figma (or as a Storybook), covering every component above in light and dark themes (built as code in `src/components/ds/`, shown on `/design-system`)
- [x] High-fidelity screens for every template in section 8, at 360 px (mobile) and 1440 px (desktop) (built as real pages on sample data instead of static screens)
- [x] Clickable prototype of the home → news → article and home → orders → order flows (the preview site itself)
- [x] Admin screens for the post editor, order upload, office-bearer manager and review queue (greyscale wireframes of all 18 admin screens at `/wireframes/admin`, approved Oct 2026; the high-fidelity admin design comes with the build)

## 8. Page-by-page UX specification

There are 18 public templates. Each lists its sections top to bottom; mobile keeps the same order in one column unless noted.

> **Update, 22 Oct 2026: the built home page and frame.** Where this differs from the lists below, the built site wins.
>
> - The site-wide announcement strip is replaced by a **home banner**, on the home page only: one news post or event chosen by a state editor, shown as a red text panel with the item's photo faint behind it, an optional shorter headline and one "Read more" button. There is one banner at a time and it stays until replaced; it is never free text or an order. Its item is left out of Top news and Coming up.
> - Home, top to bottom: banner · Top news (a lead story plus up to 4 beside it) with a "Coming up" events slider · From the union (NGO Union News, Secretary's page, FSETO; each one photo story plus 3 text) · Articles (the 3 newest) · Latest orders (popular-subject chips, 5 orders) beside Tools & guides · Districts (district events, district news, then all 15 districts) · Kerala Service and 3 videos. No story appears twice.
> - Columns side by side end on the same line, and stories without a photo show a neutral tile with their topic.
> - `/gallery` is titled "Media".

**Global frame (every page)**

- Desktop header: logo + "Kerala NGO Union" wordmark · primary nav · search icon · ML/EN pill. On scroll it shrinks to a 56 px sticky bar.
- Mobile: 56 px top bar (logo, search, ML/EN, menu) plus a fixed bottom nav with 5 tabs: Home · News · Orders · Districts · More.
- Optional site-wide announcement strip (e.g. strike notice, conference dates), set in admin, dismissible.
- Footer: short about text, address and phone, social links, quick links, Kerala Govt portals, copyright.

**Home**

1. Hero: one featured story (large image, Malayalam headline, date, topic) plus 3 secondary stories. On mobile this becomes a swipeable carousel with dots.
2. Quick actions: 6 large tiles — Latest GOs, Pay Revision, Pension, Kerala Service, Events, Find your district.
3. Upcoming events strip: next 3 events with date blocks; "View calendar".
4. Latest orders: 5 newest GOs as compact rows (GO number, date, subject, PDF); "All orders".
5. Union news: 6 stories in a grid with topic filter chips (All · FSETO · Social work · Arts & sports · Janapaksha Civil Service).
6. From the districts: a Kerala map on desktop with the latest story per district on hover; a district picker and list on mobile.
7. Secretary's page: the latest column with photo.
8. Kerala Service: the current issue cover + 4 recent covers; "Read online".
9. Videos: 4 latest YouTube videos (lite embed loads the player only on tap).
10. Gallery strip: latest 8 photos from albums.

**Templates**

| Page | Sections (top → bottom) | Mobile notes |
| --- | --- | --- |
| News list `/news` | Title · filter bar (topic, district, year) · results grid (12 per page) · load more | Filters open in a bottom sheet |
| Article `/news/{year}/{slug}` | Breadcrumb · topic + district badges · headline · date and reading time · cover image with caption · body (68-character measure) · inline photo gallery · linked event or order cards · share bar · related stories (3) | Share bar sticks to the bottom while reading |
| Districts index `/districts` | Kerala SVG map (15 clickable regions) · list of 15 district cards with secretary, president, latest news date | Map collapses to a searchable list |
| District hub `/districts/{d}` | District header (name, cover photo) · tabs: News · Office-bearers · History · Area committees · Addresses · Gallery · contact card | Tabs become a horizontal scroll bar |
| About `/about` | Intro · key facts (founded 1962; roots in the 1920 NGO Association) · links to History, Committee, Conferences, Struggles, Documents, FSETO | — |
| History `/about/history` | Long-form article with a side table of contents and a milestones timeline | Table of contents becomes a dropdown |
| State committee | Leadership row (President, General Secretary, Treasurer with photos) · Vice Presidents · Secretaries · secretariat members · committee members (searchable list) · past committees (by term) | Cards in 2 columns |
| Conferences | Vertical timeline from the 1st to the 63rd conference (year, place, highlights) · each opens its page with report, documents and album | — |
| Struggles | Timeline of major struggles (e.g. 1967, 1973 strikes) linking to stories | — |
| Documents | Cards for Bye-Law, 1965 policy resolution, Silver and Golden Jubilee documents · read online or download PDF | — |
| Orders library `/orders` | Search box (GO number, keyword, Malayalam or English) · group tabs (Govt Orders · NPS · Pension) · subject chips · year filter · results table (GO number, date, subject, title, PDF size) · "Important" pinned at top | Table becomes cards; filters in a bottom sheet |
| Order detail | GO number + date · title (ml/en) · subject and department · summary · embedded PDF viewer · Download · Share on WhatsApp · related orders on the same subject | PDF opens full-screen |
| Kerala Service `/kerala-service` | Current issue hero · year tabs (2014 → 2026) · cover grid by month | 2-column cover grid |
| Issue reader | Full-screen reader: single page on mobile, two-page spread on desktop · thumbnails · zoom · page jump · download | Swipe between pages |
| Events `/events` | Toggle: Calendar (month) / List · district filter · upcoming first; past events link to their report | Defaults to list |
| Event detail | Title · date/time block · venue with map link · description · add-to-calendar (.ics) · share · report and album after the event | — |
| Gallery `/gallery` | Album grid (cover, title, date, district) · Videos tab | 2 columns |
| Album | Masonry photo grid · lightbox with captions and swipe · download (if allowed) | — |
| Search `/search` | Query box · result groups: Orders · News · Events · Pages · Magazine · filters | — |
| Contact | Office address cards (State centre + 15 districts) · map · contact form (name, phone, email, district, subject, message, Turnstile) | Tap-to-call and directions buttons |
| Useful links | Grouped list of Kerala Govt portals (SPARK, eOffice, Document Portal, PSC, eSevanam …) | — |
| 404 | Friendly message · search box · links to News and Orders | — |

**Site-wide extras**

- **Home-screen app (PWA):** members can "Add to home screen". Includes app icons (192 and 512 px, maskable), a splash colour, and an offline page that keeps recently opened orders available without signal.
- **Favicon set** made from the union logo (SVG plus PNG sizes).
- **Print layout** for orders and articles: hides navigation, prints the page URL and print date.
- **Disclaimer** on every order page: this is a reference copy; check the official Government source for the authoritative version.
- **Accessibility statement** and **privacy page**, both linked from the footer.
- **Admin help** at `/admin/help`: a short Malayalam how-to guide with screenshots for every common task.

## 9. Responsive and accessibility rules

The site is designed for a 360 px Android phone on a 4G connection first, then scaled up. It must meet WCAG 2.2 AA.

**Breakpoints**

| Name | Width | Layout |
| --- | --- | --- |
| sm | 0–639 px | 1 column, bottom nav, filters in bottom sheets |
| md | 640–1023 px | 2 columns for cards, top nav collapses to a menu |
| lg | 1024–1279 px | Full header nav, 3-column grids, sidebars appear |
| xl | 1280 px + | 12-column grid at 1200 px max width, 4-column grids |

**Responsive rules**

- Touch targets are at least 44 × 44 px; spacing between tappable items is at least 8 px.
- Tables (orders, office-bearers) turn into stacked cards below 640 px. No horizontal scrolling on any page.
- Images use `srcset` with the standard width variants (see Media and thumbnails below) and `loading="lazy"` below the fold.
- Long Malayalam headlines are never truncated mid-word; they clamp at 3 lines in cards with a full title on the detail page.
- The PDF viewer and magazine reader open full-screen on phones, with pinch-zoom.
- The site is tested on Android Chrome, iOS Safari, desktop Chrome, Firefox and Edge, and on a low-end Android device.

**Media and thumbnails**

Every image is uploaded once, turned into a fixed set of sizes, and served in the size that fits each screen. Admins never crop separate versions for mobile, tablet and desktop.

*Upload pipeline*

1. The admin picks or drags images (many at once). On a phone, the camera roll opens.
2. In the browser, each image is re-encoded as WebP (quality 80). This also strips EXIF data, including GPS location.
3. Widths 320, 640, 960, 1280 and 1920 px are generated, plus 160 and 320 px square crops. Sizes larger than the original are skipped.
4. A 2560 px master copy is kept so new sizes can be generated later without asking for the photo again.
5. A tiny blurred placeholder (about 300 bytes) and the dominant colour are saved for loading states.
6. Files go straight from the browser to R2 through short-lived signed upload URLs, so large uploads never pass through the Worker. Uploads resume if the mobile connection drops.
7. A SHA-256 hash catches duplicates: re-uploading the same photo reuses the existing file.

Crawled and WordPress-imported images go through the same steps in a Node script during import.

*Focal point instead of manual crops*

After upload, the admin taps the most important part of the photo (usually faces). That point is saved as `focal_x` / `focal_y`. Every thumbnail uses `object-fit: cover` with `object-position` at that point, so the same image crops correctly to 16:9 on a card, 4:3 in a gallery and 1:1 in a list. Office-bearer photos also get a square crop tool so faces sit centred in circles.

*Thumbnail sizes by component (display width in CSS px)*

| Component | Shape | Mobile (360) | Tablet (768) | Desktop (1440) |
| --- | --- | --- | --- | --- |
| Home hero story | 16:9 (4:5 on mobile) | full width, 360 | 704 | 760 |
| Story card, large | 16:9 | full width, 328 | 2 per row, 340 | 3 per row, 376 |
| Story card, compact (lists, sidebar) | 4:3 | 112 × 84 beside the title | 136 × 102 | 160 × 120 |
| Article cover | 16:9 | full bleed, 360 | 704 | 760 (text column) |
| Inline article image | original ratio | 328 | 640 | 680 |
| District card | 16:9 | 328 | 340 | 280 (4 per row) |
| Album cover | 4:3 | 2 per row, 160 | 3 per row, 224 | 4 per row, 280 |
| Album photo grid | original ratio (masonry) | 2 columns, 160 | 3 columns, 224 | 4 columns, 280 |
| Lightbox | original ratio | screen width | screen width | up to 1600 |
| Office-bearer, leadership | 1:1 circle | 96 | 112 | 120 |
| Office-bearer, list | 1:1 circle | 48 | 56 | 64 |
| Magazine cover | A4 portrait (1:1.41) | 2 per row, 156 | 4 per row, 160 | 6 per row, 168 |
| Current-issue hero | A4 portrait | 200 | 240 | 300 |
| Order PDF preview | A4 portrait, page 1 | hidden (PDF icon instead) | 96 | 120 |
| Video card | 16:9 | 328 | 340 | 280 |
| Share image (WhatsApp, Facebook) | 1200 × 630 | — | — | — |

*How the right size is chosen*

- Each `<img>` gets a `srcset` of the width variants and a `sizes` rule matching the table above. The browser picks the right file for the screen width and pixel density. For example, a 328 px card on a 3x phone loads the 960 or 1280 px file, while a 1x desktop loads 640.
- Width and height (or `aspect-ratio`) are always set, so pages do not jump while images load. The blurred placeholder fills the box until the image arrives.
- The hero image on each page loads first (`fetchpriority="high"`). Everything below the first screen uses `loading="lazy"`.
- Each R2 file key is unique (`media/2026/10/{id}/960.webp`), so files are cached by browsers and Cloudflare for a year and never need purging. Replacing an image creates new keys.

*PDFs, magazine and video*

- When a GO or magazine PDF is uploaded, the admin's browser renders page 1 with pdf.js into WebP covers at 160, 320 and 640 px, and reads the page count.
- PDFs are stored once in R2 and streamed with range requests, so the reader opens page 1 without downloading the whole file.
- Videos stay on YouTube. Thumbnails come from YouTube's image server, and the player loads only when someone taps play.

*Media library rules*

- Alt text (Malayalam, with English generated alongside the article translation) is required before an image can be inserted.
- Each file shows where it is used. A file in use cannot be deleted; it must be replaced, which updates every page that uses it.
- Upload limits: images up to 15 MB before compression, PDFs up to 50 MB; only JPEG, PNG, WebP, HEIC (iPhone, converted to WebP) and PDF are accepted.
- Typical storage per photo after processing is about 0.5 MB for all sizes together, so 10,000 photos come to roughly 5 GB in R2.

**Performance budgets (mobile, 4G)**

| Metric | Target |
| --- | --- |
| Largest Contentful Paint | under 2.0 s |
| Interaction to Next Paint | under 200 ms |
| Cumulative Layout Shift | under 0.05 |
| JavaScript on article pages | under 50 KB gzipped |
| Fonts on first view | under 150 KB total (subset Malayalam + Latin) |
| Lighthouse scores | 95 + for Performance, Accessibility, Best Practices, SEO |

**Accessibility checklist**

- [ ] Correct `lang` on the page and on every content block (ml / en)
- [ ] All images have alt text in the article's language (required field in admin)
- [ ] Colour contrast at least 4.5:1 for text, 3:1 for icons and borders (the built design keeps all text at 5.2:1 or more)
- [ ] Full keyboard navigation with visible focus rings; skip-to-content link
- [ ] Menus, tabs, dialogs, carousels and lightbox follow WAI-ARIA patterns (own scripts on the public site; Radix in the admin)
- [ ] Carousels never auto-advance; users swipe or tap
- [ ] Text can be zoomed to 200 % without breaking layout
- [ ] PDFs link to a text summary on the order page for screen-reader users
- [ ] Forms have visible labels, inline errors and no time limits
- [ ] Automated checks (axe) run in CI on every template

## 10. Admin panel

The admin panel at `/admin` lets state staff manage the whole site and lets each district admin manage only their own district. It is mobile-friendly, because many district updates will be posted from phones right after an event.

> **Update, 22 Oct 2026: wireframes.** All 12 screens are wireframed in greyscale at `/wireframes/admin`, with a "View as" switch for super admin, state editor, district admin and district editor: Dashboard, News, Post editor, Orders upload, Home & banner, Users, Events, Kerala Service upload, People & committees, Media, Inbox and Settings (with the glossary and AI key). Shown there: only state roles set the home banner; "Reply by email" opens the admin's own mail app, and the site sends nothing itself; each admin's Gemini key stays in their own browser. Still to decide: how long done inbox messages are kept.
>
> The other six screens followed the same day and were approved: **Pages & documents** (About pages in the post editor, organisation documents, the conference list behind the timeline), **Districts** (state roles see what each district lacks; a district admin edits their cover photo, history, area committees and office addresses), **Analytics** (section 14's dashboard, narrowed by role), **Audit log** (filters, before/after, restore), **Import** (the section 12 wizard, super admin only) and **Help** (the Malayalam how-to, filtered by role). Albums and videos live in Media, and the glossary in Settings.

**How an admin logs in**

1. The admin opens `keralangounion.in/admin` on a phone or computer.
2. Cloudflare Access shows a login screen. The admin types their email; only emails invited by the super admin are accepted.
3. A 6-digit one-time code arrives by email. The admin enters it; there are no passwords to remember or leak.
4. The admin app loads. The API reads the user's role and district from D1, and the menu shows only what that role may use.
5. The session lasts 24 hours by default (the super admin can change this). Logging out also clears any Gemini key held in that tab.

Deactivating a user in **Users** removes access immediately, even mid-session. Every login is recorded in the audit log. Google sign-in with the same email can be enabled as a second option.

**How a post is updated, step by step**

1. **News** → search or filter (status, district, topic) → open the post.
2. The editor opens on the Malayalam tab: title, summary, body, cover image, topics, district (fixed for district admins), linked event, schedule.
3. Changes autosave as a draft every 10 seconds. The live page does not change until the admin presses **Update**.
4. **Preview** shows the post at phone and desktop size.
5. A district editor presses **Submit for review**; a district admin or state editor presses **Update**.
6. If a Gemini key is unlocked and auto-translate is on, the English draft is regenerated and the English tab shows **Needs review**, with the changes highlighted.
7. The admin checks the English and presses **Approve English**.
8. The article, its listings, the home page and the district hub are purged from the edge cache, so the update is live within seconds.
9. The earlier version stays in **History** and can be restored with one click.

If two admins open the same post, the second sees "Being edited by …" and can open it read-only. This prevents one person's changes from overwriting another's.

**Roles and permissions**

| Action | Super admin | State editor | District admin | District editor |
| --- | --- | --- | --- | --- |
| Create/edit news | All | All | Own district | Own district (draft only) |
| Publish news | All | All | Own district | No (sends for review) |
| Feature a story on the home page | Yes | Yes | No (can request) | No |
| Approve AI English drafts | All | All | Own district | No |
| Orders (GOs) library | Yes | Yes | No | No |
| Kerala Service magazine | Yes | Yes | No | No |
| State committee, About, Documents, Conferences | Yes | Yes | No | No |
| District office-bearers, area committees, addresses | All | All | Own district | Own district (draft only) |
| Events | All | All | Own district | Own district (draft only) |
| Albums and videos | All | All | Own district | Own district |
| Users and roles | Yes | No | Add editors to own district | No |
| Site settings, redirects, glossary, WordPress import | Yes | Glossary only | No | No |
| Audit log | All | All | Own district | No |

**Screens**

| Screen | What it does |
| --- | --- |
| Dashboard | My drafts, items waiting for my review, English drafts to approve, out-of-date translations, latest contact messages, quick "New post" button, today's visitors and most-read articles (section 14) |
| News | Filterable list (status, topic, district, language status) · editor with Malayalam/English tabs, side-by-side review mode, cover image, topics, district, schedule, "feature on home", SEO preview |
| Pages and documents | Edit static pages and upload organisation documents |
| Orders | Upload PDF (drag and drop, many at once) · auto-read GO number and date from the PDF text, editor confirms · subject, group, summary, "important" flag |
| Kerala Service | Upload issue PDF · cover is generated from page 1 · set year and month · optional table of contents |
| People and committees | People directory (photo, names, department) · assign positions with terms · drag to reorder · "start new term" copies the current committee for editing |
| Districts | Per district: history page, area committees, office addresses, cover photo |
| Events | Create with date, time, venue, district; link to the news report afterwards |
| Media | Library of all uploads with search, alt text, usage ("used in 3 posts"), replace file |
| Albums and videos | Bulk photo upload with captions; YouTube channel sync and manual add |
| Home page | Pick the hero story, order the home sections, set the home banner (one post or event) |
| Inbox | Contact form messages: assign, mark done |
| Glossary | Malayalam ↔ English terms used by AI translation |
| Users | Invite by email, assign role and district, deactivate |
| Settings | Contact details, social links, footer links, redirects · AI translation (own Gemini key, key mode, auto-translate on save, model) |
| Import | WordPress import wizard (section 12) |
| Audit log | Who changed what and when, with a diff and one-click restore of earlier versions |

**Editorial workflow**

1. A district editor writes a Malayalam post and presses **Submit for review**.
2. The district admin gets a notification (dashboard + email), edits if needed and presses **Publish**.
3. On save or publish, if the admin has unlocked a Gemini key, the English draft is generated; it appears in the district admin's "English to approve" queue.
4. The district admin approves the English draft; the English page goes live and the edge cache is purged.
5. A district admin can **Request home feature**; a state editor decides.

**Editor details**

- Malayalam typing works with any phone keyboard (Gboard, Manglish transliteration keyboards) and desktop input tools. The editor adds no keyboard of its own.
- Autosave every 10 seconds; full version history per item.
- Paste from WhatsApp or Word is cleaned of stray formatting.
- Image upload compresses on the device before sending, so posting from a phone on mobile data stays fast.
- Preview shows the page exactly as it will look on mobile and desktop before publishing.

## 11. Feature specifications

Four features go beyond a plain news site: site-wide search, the orders library, the magazine reader and the events calendar. Each is specified below with its acceptance test.

**Search (orders + news + everything)**

- One search box (header icon, `/` keyboard shortcut, or the large box on `/orders`) searches orders, news, events, pages and magazine issue titles.
- Matching: SQLite FTS5 with the `trigram` tokenizer (no stemming, which suits Malayalam), so parts of words and GO numbers match. Queries shorter than three characters fall back to a plain substring match.
- GO numbers are normalised before matching: "81/2014", "GO(P) 81/2014/Fin" and "G.O.(P) No.81/2014/Fin" all find the same order.
- Order PDFs are indexed by their text. Text is extracted in the admin's browser at upload with pdf.js; scanned PDFs without text get an "OCR needed" flag for a later OCR job.
- Results are grouped by type, with filters for type, district, year and order subject. Search terms are highlighted in snippets.
- Instant suggestions appear after 2 characters (top 5 results, debounced 200 ms).
- **Acceptance:** typing "ക്ഷാമബത്ത", "DA 2024" or "81/2014" each returns the right orders in the top 3 results within 300 ms.
- Until the database exists, `/search` and the Orders page search a static index (`/search-index.json`) in the browser with `src/lib/search.ts`. D1 uses the same normalisation (`normalise()`: old chillu forms, joiners, GO number forms) before indexing and before each query, so results don't change when search moves to D1.

> **Update, 22 Oct 2026: local D1 test.** All 1,611 crawled posts and 379 orders were loaded into a local D1 with an FTS5 trigram index over normalised text. On 14 queries (ക്ഷാമബത്ത, ക്ഷാമ, സ്ഥലംമാറ്റ, പണിമുടക്ക്, പെൻഷൻ typed in new and old chillu forms, ശമ്പള പരിഷ്കരണം, സെക്രട്ടറിയറ്റ്, മെഡിസെപ്, ഡിഎ, bonus, 116/2021 bare and as printed, da) it found exactly the same items as a full substring scan, in 0–2 ms (14 ms for the 2-letter fallback). The database with its index came to about 27 MB of the 500 MB allowed. Two things follow for the build:
>
> - **Spelling variants need a list.** "Secretariat" is spelt സെക്രട്ടറിയേറ്റ് (304 posts), സെക്രട്ടേറിയറ്റ് (115) and സെക്രട്ടറിയറ്റ് (42), and a search for one misses the others. Variants go into the same alias list the browser search already uses for DA and pension.
> - **Text goes in as bound parameters.** D1 caps one SQL statement at 100 KB, and the longest crawled article is about 95,000 characters (roughly 280 KB in Malayalam), so the importer and the API never inline text into SQL.

**Orders (GO) library**

- Three groups (Government Orders · New Pension Scheme · Pension Orders) with \~25 subjects after merging duplicates.
- Each order has a stable URL, a WhatsApp share button and an embedded PDF viewer, so members can forward a link instead of the file.
- "Important" orders are pinned at the top of their subject and shown on the home page.
- Sort by GO date (newest first by default) or by relevance when searching.
- **Acceptance:** from the home page, a member on a phone opens a specific GO's PDF in 3 taps or fewer.

**Kerala Service magazine reader**

- Replaces the Real3D flipbook plugin with a lightweight reader built on pdf.js.
- Pages render progressively: the first page appears while the rest load. Large PDFs use HTTP range requests from R2 so readers never wait for the whole file.
- Single page on phones (swipe), two-page spread on desktop, thumbnail strip, zoom, page jump, full-screen and download.
- Each issue has a cover thumbnail generated at upload, and an optional table of contents that deep-links to pages (`/kerala-service/2026/03#p=12`).
- **Acceptance:** a 20 MB issue shows its first page in under 3 seconds on 4G.

**Events calendar**

- Month grid and agenda list views; state and district events in one calendar with a district filter.
- Each event has an "Add to calendar" link (.ics file and Google Calendar link) and a public `.ics` feed for the whole calendar.
- The home page shows the next 3 events; after an event ends, its page shows the linked news report and album.
- Multi-day events (e.g. a state conference on 11–13 June) display as a span.
- **Acceptance:** an event created in admin appears on the calendar, home page and district hub within 1 minute.

## 12. Data migration

The migration has two paths. First, a polite crawl of the public site fills the new site with real demo data during development. Second, a WordPress import tool in the admin panel does the full, final migration once an export from the union's WordPress admin is available. Both paths write through the same importer, so they produce identical records.

**Path A — public crawl (demo data)**

> **Update, 21 Oct 2026: how the crawl was done.** The WordPress REST API returns errors, so `scripts/crawl.mjs` reads the RSS feed, the year archives, and the download and flipbook pages with plain HTTP requests, one at a time, caching every response in `scripts/.cache/` (`node scripts/crawl-progress.mjs` shows progress). `scripts/import-crawl.mjs` turns the cache into `src/data/live/*.json`: topics from categories or title keywords, districts, order subjects, GO numbers and dates, and slugs transliterated from Malayalam. Photos and PDFs are not copied to R2 yet; the preview links to them on the old site. Office-bearer parsing and loading into D1 (steps 6 and 7) come with Phase 2.

1. Read the WordPress sitemaps (pages, posts, Download Manager packages, flipbooks, categories) to build the URL list.
2. Fetch each URL with Playwright: 1 request every 2 seconds, a descriptive user agent, and every raw HTML response cached to disk so no page is fetched twice.
3. Extract content with page-type parsers: article (title, date, categories, body, images), district page (office-bearer text → people + positions), download package (title, category, PDF link), flipbook (issue month/year, PDF link).
4. Download linked PDFs and images to R2, recording each file's original URL.
5. Run clean-up: strip Elementor markup, fix Malayalam encoding issues (old ZWJ/ZWNJ chillu forms → atomic chillu characters), deduplicate, and map 56 categories to topics + district.
6. Office-bearer text is parsed by pattern (role label → names) and lands in a **Needs checking** queue for district admins.
7. Load into a D1 database named `demo`, and write every old URL into the `redirects` table.

The demo site runs on a preview URL with `noindex` so it never competes with the live site in search results.

**Path B — WordPress import (final migration)**

The import wizard in admin accepts any of:

| Input | How to get it | What it gives |
| --- | --- | --- |
| WXR export (.xml) | WordPress admin → Tools → Export → All content | Posts, pages, categories, authors, dates, custom post types and post meta |
| Uploads archive (.zip) | Hosting file manager: wp-content/uploads | Every original image and PDF at full quality |
| Database dump (.sql), optional | Hosting control panel → phpMyAdmin → Export | Everything, including Download Manager and flipbook plugin tables |

Wizard steps: **Upload** → **Scan** (counts per content type) → **Map** (categories to topics and districts, authors to users) → **Dry run** (preview of 20 sample items and a list of problems) → **Import** (runs in the background with progress) → **Report** (created, updated, skipped, failed, with links).

Rules:

- Re-running the import updates matched records (by legacy URL or WordPress ID) instead of duplicating them, so demo data is replaced cleanly.
- Elementor pages store their content in the `_elementor_data` meta field; the importer reads that JSON when `post_content` is empty.
- Download Manager packages (`wpdmpro`) become orders; flipbooks (`r3d`) become magazine issues.
- Nothing on the live WordPress site is changed by the import.

**Redirects**

> **On hold, 21 Oct 2026 (the owner's decision): no old-link redirects for now.** The rules below stay the plan if they are turned on: an in-site lookup, 302 on the preview and 301 at launch, and 410 for junk pages. Every crawled item keeps its old URL as `legacyUrl`, so the table can be built at any time.

- Every old URL (pages, posts, download packages, categories, flipbooks) gets a 301 to its new URL. Both encoded and decoded Malayalam forms are matched.
- Redirects are checked by a small Worker middleware with an in-memory cache; super admins can add or edit them.
- Junk pages (/test-2022/, /fseto-copy/, /fseto-news-copy/, /\_\_trashed/, /k/) return 410 Gone.
- **Acceptance:** a script requests every URL from the old sitemaps on the new site; 100 % must end in a 200 page with no redirect chains.

**Before launch**

- [ ] Union leadership confirms that the site's content may be migrated and re-published
- [ ] Final WordPress export imported and spot-checked (20 random posts, 20 random orders, all 15 district pages)
- [ ] District admins confirm their office-bearer lists
- [ ] Old WordPress site kept read-only for 3 months as a fallback, then archived

## 13. SEO, security, backups and privacy

The site must rank for union and GO searches, resist spam and account abuse, and be restorable within an hour after any mistake.

**SEO**

- Server-rendered HTML for every public page; unique title and description per page in the page's language.
- `hreflang` pairs (ml ↔ en), canonical URLs, and an XML sitemap split by type (news, orders, events, magazine, pages), regenerated on publish.
- Structured data: `NewsArticle` for posts, `Event` for events, `Organization` for the union, `BreadcrumbList` on all pages.
- Open Graph and WhatsApp previews: every article and order gets a 1200 × 630 share image (cover photo, or an auto-generated card with the title in Malayalam).
- An RSS feed for news and for orders, so members can follow new GOs in feed readers.

**Security**

- `/admin` and `/api/admin/*` sit behind Cloudflare Access; the API also checks the user's role and district on every request, so permissions cannot be bypassed from the browser.
- All database access goes through parameterised queries (Drizzle). Rich text is sanitised on save and on render.
- File uploads: type allow-list (JPEG, PNG, WebP, PDF), size limits (images 15 MB, PDFs 50 MB), random R2 keys, and no executable files.
- Turnstile plus rate limiting on the contact form and search API.
- Security headers: Content-Security-Policy, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
- Secrets (email key) live only in Cloudflare encrypted environment variables. No AI key is stored on the server; Gemini keys stay in each admin's browser (section 6).
- Dependency updates are automated (Renovate); CI blocks merges with known high-severity vulnerabilities.

**Testing**

- Automated unit tests for the API, permissions and importer.
- End-to-end tests (Playwright) for the key journeys: search and open a GO, read an article, switch ML/EN, admin login, publish a post, approve English, upload an order.
- Device and browser matrix: low-end and mid-range Android (Chrome, Samsung Internet), small and current iPhone (Safari), desktop Chrome, Edge and Firefox.
- Admin acceptance script: 15 real tasks, signed off by the state office and two district admins.
- Load test at 10× expected peak (for example, the day a pay revision order is released), on both cached and uncached pages.
- Security review against the OWASP Top 10, including tests that a district admin cannot edit another district through the API.

**Monitoring**

- Uptime checks every minute on the home page, orders, API and admin, with email and phone alerts.
- Error tracking (Sentry) for the public site, admin app and Workers.
- A weekly report of broken links and 404s, taken from analytics.
- Usage alerts at 80 % of D1, R2 and Workers plan limits.

**Backups and recovery**

| What | How | Kept for |
| --- | --- | --- |
| Database | D1 Time Travel (restore to any minute) + a nightly `wrangler d1 export` to a separate R2 backup bucket | Time Travel 7 days on the free plan, 30 on Workers Paid; nightly exports 90 days |
| Files | R2 bucket versioning or nightly sync to a backup bucket | 90 days |
| Content edits | Version history per item in the app | Forever |
| Code | GitHub repository | Forever |

A restore drill is run before launch and every 6 months: restore last night's export into a new D1 database and open the site against it.

**Privacy**

- No tracking cookies; Cloudflare Web Analytics is cookie-less. The only cookie on the public site stores the ML/EN choice.
- Office-bearer pages show names, roles and photos. Personal phone numbers are not shown; only office phone numbers are published.
- Contact-form messages are kept 12 months, then deleted automatically.
- A short privacy page explains what is collected and who to contact.

## 14. Analytics

The site records its own cookie-less analytics. Admins get visits, page views, top articles and downloads without Google Analytics or a consent banner, and every article shows its view count.

**What is measured**

| Metric | Definition |
| --- | --- |
| Unique visitors (day, week, month) | Counted with an anonymous hash of IP + browser that changes every day; the raw IP is never stored |
| Visits | A run of page views from one visitor with no gap longer than 30 minutes |
| Page views | Every page load by a person; bots and admin previews excluded |
| Article views | One per visitor per article per day, so refreshing does not inflate the count |
| Read rate | Share of article views that scroll past 75 % of the article body |
| Reading time | Average active time on the page (only while the tab is visible) |
| Order PDF opens and downloads | Per order and per subject |
| Magazine reads | Issues opened and pages read per issue |
| Search | Top search terms, and searches with zero results (shows which GOs members cannot find) |
| Traffic sources | WhatsApp, Facebook, Google, direct, other sites |
| Devices | Mobile, tablet or desktop; operating system; browser |
| Location | Country and state or city, approximate, from Cloudflare; nothing finer |
| Language | Malayalam vs English views; ML/EN switch use |
| Shares | WhatsApp, Facebook and copy-link clicks per article and order |
| Events | Event page views and add-to-calendar clicks |
| Broken links | 404 URLs and how often they are hit, so redirects can be added |
| Speed | Core Web Vitals per page, from Cloudflare Web Analytics |

**How it works**

1. A tiny script (under 1 KB) sends a beacon to `/api/e` on each page view and on key actions: 75 % scroll, PDF open, share, search, add to calendar.
2. A Worker drops bots (Cloudflare bot score and known crawlers) and admin previews, computes the daily anonymous visitor hash, and writes one data point to Workers Analytics Engine.
3. An hourly scheduled Worker rolls the raw points up into D1 tables: `content_views_daily` (content type, id, date, views, unique visitors, reads, average reading time, shares), `site_stats_daily` (visitors, visits and page views by device, source, language, district) and `search_terms_daily`.
4. Raw events are kept for Analytics Engine's retention period (about 3 months); daily rollups are kept permanently.
5. The dashboard reads the rollups for history and the raw store for the "last 30 minutes" view.

**View count on each article**

- Articles, orders and magazine issues show "1,245 views" with an eye icon next to the date.
- The count is total article views (one per visitor per day) since publishing. The old site has no counts, so all items start from zero at launch.
- Pages stay fully cached. The number loads from a small endpoint, `/api/views/{type}/{id}`, which is cached at the edge for 5 minutes, so counts stay fresh without purging pages.
- Counts are hidden on the public site until an item reaches 50 views; the super admin can change the threshold or hide public counts. Admins always see exact figures.
- "Most read this week" lists on the home page and news page come from the same data.

**Analytics dashboard in admin**

- Date range: today, 7 days, 30 days, 12 months or custom, with comparison to the previous period.
- Summary cards: visitors, visits, page views, average reading time, PDF downloads, each with % change.
- Daily line chart of visitors and page views.
- Live view: visitors in the last 30 minutes and the pages they are reading.
- Ranked tables: top articles, top orders, top magazine issues, top search terms, zero-result searches, traffic sources, devices, locations, 404s.
- Per-post panel inside the editor: views over time, read rate, shares and sources for that post.
- District comparison table for state staff: views of each district hub and its articles.
- Export any table to CSV; optional monthly summary email to the state office.

**Who sees what**

| Role | Analytics access |
| --- | --- |
| Super admin, state editor | Whole site, all districts, settings for public view counts |
| District admin | Their district's hub, articles, events and albums, plus site-wide totals |
| District editor | Stats for their own posts |

**Privacy.** No cookies, no personal data and no cross-day tracking; only aggregate numbers are shown. This keeps the site free of consent banners and matches section 13.

## 15. Roadmap and deliverables

Version 1 takes about 15 weeks with one full-time developer and a part-time designer. Four gates need the union's sign-off before work moves on.

Phases: 0 · Design → 1 · Foundations → 2 · Demo data and core site → 3 · Feature pages → 4 · Admin panel and translation → 5 · Import, testing and launch. The union signs off at four gates along the way.

> **Where things stand, 22 Oct 2026.** Phase 0's design work is done, built as real pages rather than static screens (the redesign steps in section 1); its interviews, tree test and usability test with members are still to do. Much of the public side of Phases 2 and 3 already runs in the preview on crawled data without a database: every template, search, the orders library and the events page. The next build phase is Phase 1: union-owned accounts, D1 and R2, the edge cache test and admin login. **Update, 22 Oct 2026:** Phase 1's local part is done: the D1 tables, the crawl loaded into a local D1, every content page reading D1, and the edge cache tested with an in-memory stand-in (section 4). What is left needs the union's Cloudflare account: create the real D1 database and R2 bucket, deploy, confirm the cache at the edge, and set up admin login.

The weeks are estimates; the gates matter more than the dates, because each one catches problems while they are still cheap to fix.

**Done when**

| Phase | Done when |
| --- | --- |
| 0 · Design | Interviews, wireframes, tree test and prototype test done; style guide, component library and all screens in section 8 approved at 360 px and 1440 px |
| 1 · Foundations | A preview URL shows a "hello" page served from Cloudflare, reading from D1 and R2; a second visit is served from the edge cache with no D1 read, and a purge makes the next visit read D1 again; admins can log in |
| 2 · Demo data and core site | All crawled posts, pages and district data load; core templates pass the section 9 budgets |
| 3 · Feature pages | Search, orders, magazine reader and calendar meet their acceptance tests in section 11 |
| 4 · Admin panel and translation | Two district admins publish a post, an event and an office-bearer change from a phone without help |
| 5 · Import, testing and launch | Final WordPress import is verified; every old URL redirects correctly; go-live checklist passes |

**Go-live checklist**

- [ ] DNS for keralangounion.in on Cloudflare, SSL active, www → apex redirect
- [ ] Final import done and spot-checked; district office-bearers confirmed
- [ ] Redirect test: 100 % of old sitemap URLs resolve
- [ ] Lighthouse 95 + and axe checks clean on every template
- [ ] Backups running and one restore drill completed
- [ ] All admins invited, trained (one 1-hour session plus a short Malayalam how-to guide) and able to log in
- [ ] Search Console and Bing Webmaster set up; new sitemap submitted
- [ ] Old WordPress site set to read-only and kept for 3 months

**Launch and after**

- **Content freeze:** posting on the old site stops 48 hours before the switch; the final import runs, then DNS is switched.
- **Announcement:** a Malayalam WhatsApp message with the link and a 60-second how-to video, a Facebook post, and a notice in Kerala Service.
- **First 2 weeks:** daily check of errors, analytics and admin questions; blocking bugs are fixed the same day.
- **30-day review:** analytics against the success measures in section 1, an admin feedback survey, and a ranked fix list.
- **90-day review:** decide the next features (for example Malayalam menus or a member area) from the change-request list.

## 16. Project governance, maintenance and risks

One named decision-maker, union-owned accounts and a maintenance agreement keep the site alive after launch. Most union websites fail here, not in the build.

**Who does what**

| Role | Who | Responsibilities |
| --- | --- | --- |
| Project owner | Nominee of the state office | Signs off each gate, settles disagreements, owns all accounts |
| Content lead | State office staff member | Gathers content, chases districts, checks migrated data |
| Designer | Part-time | Phase 0 research and design; reviews during build |
| Developer | Full-time during build, part-time after | Build, deploy, maintain, train admins |
| District admins | One per district (15) | Office-bearer data, district news, testing in Phase 4 |

During the build there is a 30-minute weekly review call, a demo at each gate, and a shared task tracker.

**Effort estimate**

| Work | Effort |
| --- | --- |
| Design and research | about 5 weeks part-time (Phase 0, plus reviews) |
| Development | about 15 weeks full-time |
| Content checking by the union | 2–3 days per district, plus 1 week at state level |
| Admin training | One 1-hour session plus the Malayalam guide |
| Running cost | $0–5 a month (section 4), domain renewal, and Gemini use on admins' own keys |

**After launch**

- The union owns every account: domain, Cloudflare, GitHub and Google. Developers get delegated access only, which can be removed at any time.
- A maintenance agreement covers monthly updates, a backup check and bug fixes, with response times: site down within 4 hours, broken feature within 2 working days, small changes within 1 week.
- A handover pack lives in the repository: setup guide, architecture notes, and a runbook for deploying, restoring backups, adding an admin and rotating keys.
- The domain and SSL renew automatically, with reminders 60 days ahead.

**Risks**

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| District admins stop posting | High | High | Phone-first editor, Malayalam guide, training, monthly activity report to the state office |
| Final WordPress export never arrives | Medium | Medium | Crawled data is already a complete fallback |
| Office-bearer lists go out of date | Medium | Medium | Districts confirm before launch; admin shows a "last checked" date |
| Key person leaves | Medium | High | Union-owned accounts, handover pack, documented runbook |
| Scope grows (member login, payments) | Medium | Medium | New requests go on a version 2 list, reviewed at 90 days |
| AI translation misreads union terms | Medium | Low | Glossary, mandatory review, English hidden until approved |
| Free-tier limits exceeded | Low | Low | Alerts at 80 %; paid tiers cost a few dollars a month |

## 17. Open questions and assumptions

These do not block the design work, but each needs an answer before the phase noted.

**Open questions**

- [ ] Who owns the domain keralangounion.in and its DNS? It must move to (or point at) a Cloudflare account owned by the union. *Before Phase 1*
- [ ] Which Cloudflare and GitHub accounts should be used, and in whose name? Union-owned accounts are recommended. *Before Phase 1*
- [ ] Is there a vector (SVG/AI/PDF) version of the union logo and any colour rules? *Before Phase 0 design*
- [ ] Official contact email and phone for the State Centre (both are blank on the current site). *Before Phase 2*
- [x] Menus will be English-only. Many members may prefer Malayalam menus; Malayalam labels can be added later if the union asks. Confirm English-only for launch. *Before Phase 2* — **Confirmed Oct 2026: interface text is English on both sites; only content switches.**
- [ ] Who will hold Gemini keys: one union-owned key shared with approved editors, or a separate key per district admin? (Article text sent for translation is already public.) *Before Phase 3*
- [ ] Who will be the first super admin and state editors, and who is each district's admin? *Before Phase 4*
- [ ] Should scanned GO PDFs be OCR'd so their text is searchable? This adds a small cost per page. *Phase 4*
- [ ] Is there a target launch date (for example, ahead of a conference or campaign)? *Now*
- [ ] Build the Tools & guides calculators and how-to guides, or hide their home-page tiles? *Before launch*
- [ ] How long are done inbox messages kept? Section 13 says 12 months; confirm it, and the privacy page states it. *Before Phase 4*
- [ ] Turn on old-link redirects before launch? On hold for now (section 12). *Before Phase 5*
- [x] Which database? *Before Phase 1* — **Decided 22 Oct 2026: Cloudflare D1 (section 4).**
- [x] Is a dark theme wanted at launch, or later? *Before Phase 0 design* — **At launch: built in the redesign, follows the phone's setting with a manual switch.**

**Assumptions**

- Malayalam is the primary language of all existing content; English is new.
- The 15 district committees in the current menu (with Thiruvananthapuram split into North and South) are complete and stable.
- The YouTube channel already linked from the site remains the official one.
- The external articles site (ngoukeralaservice.in) stays separate and is linked, not migrated.
- Member login, membership records and payments are out of scope for version 1.
- Development uses crawled public data only; nothing is published on the real domain until the union approves.
