# Kerala NGO Union website

The new website for the [Kerala NGO Union](https://keralangounion.in), the organisation of
Kerala State Government employees since 1962. It replaces the current WordPress site with a fast,
phone-first site on Cloudflare, in Malayalam with English versions of articles.

> **Status: preview, not live.** The public site is designed and built, and it runs on real
> content read from the current site, served from a local Cloudflare D1 database. The admin panel
> is wireframed but not built, and nothing is deployed to keralangounion.in yet.

## What's in it

- **Public site**: home page with a banner, news (about 1,600 posts, filterable and searchable),
  government orders library (about 380 GOs), the 15 district committees with a Kerala map,
  events, the Kerala Service magazine archive (138 issues), the state committee, contact and
  site-wide search. Every page exists in Malayalam (`/…`) and English (`/en/…`).
- **Design system**: a living style guide at `/design-system`.
- **Wireframes**: greyscale wireframes of the public pages at `/wireframes` and of all 18 admin
  screens at `/wireframes/admin` (with a "View as" switch for the four admin roles).

Interface text is English on both sites; only content (headlines, articles, names) switches
language. News, orders and magazine issues are real content from the current site; their photos
and PDFs are still linked from it. Events are sample data.

## Site map

Every public page exists twice: Malayalam at the root and English under `/en/…` with the same
path (for example `/news` and `/en/news`).

```
/                                    Home: banner, Top news, Coming up, columns, Articles,
│                                    Latest orders + Tools & guides, Districts, Kerala Service, Videos
├── /news                            News: newest stories, filters, Load more
│   │   ?topic=…  ?district=…  ?q=…      filtered views (shareable)
│   └── /news/{year}/{slug}          1,611 articles, 2013 → 2026
├── /orders                          Government orders: search, group tabs, subject and year menus
│   │   ?q=…  ?g=govt|nps|pension  ?s={subject}  ?y={year}
│   └── /orders/{id}-{slug}          379 orders: PDF, details, related orders
├── /districts                       All 15 districts + Kerala map
│   └── /districts/{district}        15 district hubs
│           #news  #office-bearers  #offices  #gallery      tabs, each linkable
├── /kerala-service                  Current issue + archive by year (#y2026 … #y2014)
│   └── /kerala-service/{year}/{month}   138 issues, Sep 2014 → Mar 2026
├── /events                          Upcoming by month, calendar, past events
│       ?district=…  #{event-slug}
├── /about                           About hub
│   └── /about/state-committee       Office-bearers, secretariat, women's sub-committee
├── /gallery                         Media: videos (photo albums later)
├── /contact                         State Centre, district committees, message form
├── /useful-links                    Government portals
├── /search                          Site-wide search (?q=…); a GO number opens that order
├── /privacy
├── /accessibility
└── (anything else)                  404 page
```

**District slugs:** `tvm-north`, `tvm-south`, `kollam`, `pathanamthitta`, `alappuzha`,
`kottayam`, `idukki`, `ernakulam`, `thrissur`, `palakkad`, `malappuram`, `kozhikode`, `wayanad`,
`kannur`, `kasaragod`

**News topics (`?topic=`):** `struggles`, `organisation`, `fseto`, `social-work`, `arts-sports`,
`janapaksha`, `seminars`, `secretary`, `articles`

**Order subjects (`?s=`):** `da`, `pay-revision`, `pay-fixation`, `leave`, `bonus`, `allowance`,
`gpf`, `gis-sli`, `hba`, `increment`, `ltc`, `medisep`, `ta`, `medical`, `service`, `part-time`,
`ugc-aicte`, `other`, `nps`, `pension`, `pension-revision`, `ex-gratia`

**Data files, not pages:** `/rss.xml` (newest 30 posts), `/search-index.json` (Search page),
`/news-index.json` (News page filters and Load more).

**Internal, hidden from search engines:**

```
/design-system                       Living style guide
/wireframes                          Public-site wireframes: news, article, orders, district, about
/wireframes/admin                    Admin wireframes (18 screens, "View as" role switch):
                                     news, editor, events, orders, kerala-service, pages,
                                     people, districts, media, banner, inbox, analytics,
                                     users, audit, import, settings, help
```

**Planned, not built yet** (from the rebuild plan): `/about/history`, `/about/conferences`,
`/about/struggles`, `/about/documents`, one page per event (`/events/{slug}`), photo albums
(`/gallery/{album}`), the admin panel (`/admin`), and the Tools & guides calculators.

## Tech

- [Astro](https://astro.build) 7 with the Cloudflare adapter. Content pages render on request from
  [Cloudflare D1](https://developers.cloudflare.com/d1/) (through [Drizzle](https://orm.drizzle.team))
  and are kept in Cloudflare's edge cache until something they show is published; the other pages
  are built ahead of time
- [Tailwind CSS](https://tailwindcss.com) 4 with the project's own design tokens (`src/styles/app.css`)
- Noto Sans Malayalam and Anek Malayalam (self-hosted via Fontsource), Lucide icons
- No client-side framework: small page scripts only

Planned for later phases: the union's Cloudflare account (the D1 database so far runs only
locally), FTS5 trigram search in D1, Cloudflare R2 for PDFs and photos, Cloudflare Access for
admin login, and the admin panel itself.

## Getting started

You need Node.js 22.12 or newer.

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

`db:migrate` creates the tables in a local D1 database (wrangler keeps it in `.wrangler/`), and
`db:seed` loads the crawled content into it. The dev server runs at http://localhost:4321 and
logs the D1 queries of each request.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 4321 (never caches) |
| `npm run check` | Type check (should report 0 errors, 0 warnings) |
| `npm run build` | Builds the Worker and the static pages into `dist/` (about 10 seconds) |
| `npm run preview` | Serves the built site locally on the local D1 |
| `npm run preview:cached` | Builds with an in-memory page cache and serves it, to try caching and purges locally |
| `npm run db:migrate` | Applies the migrations in `migrations/` to the local D1 |
| `npm run db:seed` | Replaces the local D1 content with the crawl in `src/data/live/` |
| `npm run db:generate` | Writes a new migration after a change to `src/db/schema.ts` |
| `npm run map` | Rebuilds the Kerala district map data (rarely needed) |

There are no automated tests yet; changes are checked in the browser at phone and laptop width,
in light and dark themes.

## Content from the current site

The preview's news, orders and magazine issues come from a polite crawl of the public site
(one request at a time, every page cached). Its WordPress API doesn't work, so the crawl reads the
RSS feed, the year archives, and the download and flipbook pages.

```bash
node scripts/crawl.mjs          # read the site into scripts/.cache/ (cached; a first run takes hours)
node scripts/crawl-progress.mjs # progress bar, in a second terminal
node scripts/import-crawl.mjs   # turn the crawl into src/data/live/*.json
```

`src/data/live/` is generated: change `scripts/import-crawl.mjs` and rerun it rather than editing
the JSON, then run `npm run db:seed` to load it into D1. Pages read content only through
`src/lib/content.ts`; the prebuilt wireframes and style guide read the JSON directly (`src/lib/sample.ts`).

## Project layout

```
src/
  pages/        thin route files; English twins under pages/en/
  views/        one view per page type (HomeView, NewsView, OrderView …)
  layouts/      AppLayout: header, footer, phone bottom bar
  components/
    ds/         design-system components (Banner, StoryLead, OrderRow …)
    ui/         Icon, Brand, MagazineCover
    wire/       wireframe kit (public and admin)
  db/           D1 tables (schema.ts) and the database client
  lib/          content queries, cache rules, search, i18n, types
  data/         site data; live/ holds the crawled content
  styles/       app.css (design system), wire.css (wireframes)
migrations/     SQL migrations generated from src/db/schema.ts
scripts/        crawl, import, D1 seed and map scripts
docs/           plan.md, the rebuild plan
todo.md         everything left to do, by phase
```

`CLAUDE.md` has the full working notes: design rules agreed with the union, conventions, and
where everything lives.

## Planning

The project follows the rebuild plan in [`docs/plan.md`](docs/plan.md): goals, information
architecture, tech stack and costs, content model, design, page specifications, admin panel,
features, migration, SEO and security, analytics, roadmap and open questions. Code comments that
say "plan, section N" refer to it. What's left to do is listed in [`todo.md`](todo.md).
