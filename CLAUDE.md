# Kerala NGO Union website

The new keralangounion.in: an Astro 7 site on Cloudflare for the union of Kerala State Government
employees. The master plan is `docs/plan.md`; code comments that say "plan, section N" refer to it.
Keep its dated **Update** notes and section 1's status table current when something is decided or built.

`todo.md` (repo root) lists everything left to do, by phase. Keep it current in the same change as
the work: tick an item (`[x]` with the date) and move it to **Done** when it's finished; add an item
when the owner asks for something or the work turns up a new task; delete an item the plan drops;
rewrite an item when the plan changes. Items only the union can do or decide are marked **(union)**.

`wireframelist.md` (repo root) lists every wireframed page, public and admin, with its address, its
built page and its review status. Add a new wireframe as **To review**, mark it **Approved** with the
date when the owner approves it, fill in **Built** when the real page exists, and remove pages the plan drops.

Right now the site is a **preview**. News, GO orders and Kerala Service are real content crawled
from the current keralangounion.in into `src/data/live/*.json`, then loaded into a **local D1
database** (photos and PDFs are still linked from the old site). Pages that show this content read
D1 on request and are cached (plan, section 4, "Caching and database reads"). Events, videos and
the state committee are hand-written in `src/data/site.ts`; events are sample data. The home-page
banner (one post or event, set by a state editor; it stays until replaced) lives in D1
(`site_settings.home_banner`), first set from `firstBanner` in `site.ts`. The Cloudflare account,
R2 file storage and the admin panel are not set up yet.

## Commands

- First time, and after changing the schema or the crawl: `npm run db:migrate`, then `npm run db:seed`.
  Without them the content pages fail (no tables).
- `npm run dev`: dev server on port 4321 (in the desktop app, start it with the "site" entry in `.claude/launch.json`).
  It never caches; the terminal logs D1 queries per request (`[d1] GET /news · 2 queries`).
- `npm run check`: Astro/TypeScript check. Must show 0 errors, 0 warnings.
- `npm run build`: builds the Worker plus the static pages (about 40, ~10 s). Content pages render on request.
- `npm run preview:cached` (the "cached" entry in `.claude/launch.json`, port 4322): builds with an
  in-memory page cache and serves it on the local D1, to see cache hits (0 queries) and purges.
  `GET /api/dev/cache` counts queries; `POST /api/dev/cache?tags=posts` purges a tag. Both are 404 in a normal build.
- `npm run db:generate`: after changing `src/db/schema.ts`, writes the next SQL migration into `migrations/`.
- `npm run map`: regenerates `src/data/geo/kerala-map.json` from the district GeoJSON (rarely needed)
- `node scripts/crawl.mjs`: reads the current site into `scripts/.cache/` (one request at a time,
  cached; a full run from scratch takes hours because the old server is slow). `--cache-only` builds
  from the cache without fetching. Watch it with `node scripts/crawl-progress.mjs` in another terminal.
- `node scripts/import-crawl.mjs`: turns the crawl into `src/data/live/*.json` (topics, districts,
  subjects, GO numbers, transliterated slugs). Never edit those JSON files by hand; change the
  script and rerun it, then `npm run db:seed` to reload D1.

There are no automated tests. Check changes in the browser at phone (375 px) and laptop width,
in light and dark themes.

## Layout of the code

- `src/pages/`: thin route files. Each Malayalam page has an English twin under `src/pages/en/`;
  both render the same view with `lang="ml"` or `lang="en"`.
- `src/views/`: one view per page type (`HomeView`, `OrdersView`, …). The page's markup lives here.
- `src/layouts/AppLayout.astro`: the only layout (header, footer, phone bottom bar, theme, search dialog).
- `src/components/ds/`: design-system components. `src/components/ui/` holds `Icon` (Lucide),
  `Brand` (WhatsApp/Facebook/YouTube marks) and `MagazineCover` (stand-in covers).
- `src/styles/app.css`: design tokens (light/dark) and the few shared classes (`.btn`, `.chip`,
  `.card`, `.field`, `.t-display`/`.t-h1…`, `.wrap`, `.section`, `.col`/`.col-foot`, `.balance-list`).
  Everything else is Tailwind 4 utilities using these tokens.
- `src/lib/content.ts`: all content queries (async, Drizzle on D1) plus the URL helpers. Pages call
  these, never the database or data files directly. Each query reads only what its page shows,
  through an index (`latestPosts({ limit, topic, district, exclude })`, counts by `GROUP BY`);
  never load the whole archive for a page.
- `src/db/`: `schema.ts` (tables, plan section 5) and `client.ts` (the D1 binding, opened on first
  use). `migrations/` holds the generated SQL; `scripts/seed-d1.mjs` loads the crawl.
- `src/lib/cache.ts`: cache rules and tags. Every on-demand page calls `cachePage(Astro, 'list' | 'item', [tags])`;
  `purgeTags` lists what a publish must purge. Content routes set `export const prerender = false`
  and return `new Response(null, { status: 404 })` for missing items (not `Astro.rewrite`).
- `src/lib/sample.ts`: the crawled JSON, synchronous, only for the prebuilt `/wireframes` and `/design-system`.
- Search runs on D1 (plan, section 11): `search_docs` (one result row per post and order) and the
  FTS5 trigram table `search_fts` (normalised title, keywords and body, same id), made by the
  hand-written migration `migrations/0002_search_fts.sql`. `src/lib/search-entries.ts` builds both
  rows for an item (the seed uses it; the admin must call it on every save). `src/lib/search.ts`
  holds normalising, aliases, spelling variants (`VARIANTS`), `ftsQuery()` and `scoreDoc()`;
  `src/lib/search-db.ts` runs them on D1. `/api/search?q=` serves the Search page; the Orders
  page still scores the orders already in its HTML.
- The News page renders only the newest stories; filters, search and "Load more" ask
  `/api/news?topic=&district=&q=&offset=` for one page at a time. Lists that could hold the
  whole archive must stay limited like this.
- `src/lib/i18n.ts`: `t()` / `langOf()` for bilingual text, `href()` for `/en` paths, date formatting.
- `/design-system`: the living style guide. `/wireframes` and `/wireframes/admin`: the greyscale
  wireframes (all listed in `wireframelist.md`), kept on purpose (noindex) with their own `wire.css`
  and `components/wire/`. New public wireframes go in `WireLayout`'s page list, admin ones in
  `AdminWireLayout`'s page list and menu.

## Design rules (agreed with the owner; ask before changing any)

- Direction is "civic newsroom": calm, flat, content first, one union-red accent. Not campaign-bold.
- **Interface text is English only** on both sites. Only content (titles, summaries, names,
  addresses) switches language. Logo, artwork and the മല/EN switch stay bilingual.
- Mark every content block with its real language: `lang={langOf(text, lang)}`; UI blocks get `lang="en"`.
- Fonts: Noto Sans Malayalam for text and UI; Anek Malayalam for titles, drawn 16 % taller
  (size ×1.16, `font-stretch: 86%`, built into the `.t-*` classes). Body text is 16 px.
- Columns side by side must end on the same line: use `.balance-list` beside a `StoryLead`, and
  `.col` + `.col-foot` so "See all" links line up.
- No story repeats across sections of a page. Stories without a photo show a neutral topic tile.
- Text contrast is at least 5.2:1 in both themes; use the tokens, never raw colours.
- Features that aren't built show "Coming soon" without a link (Tools & guides tiles, some About cards).

## Conventions

- Match the surrounding code: a short doc comment at the top of each view/component saying what it
  shows and why, few inline comments, data attributes (`data-…`) as hooks for page scripts.
- Page scripts are plain `<script>` blocks with an `initX()` function guarded by `dataset.ready`;
  there is no client framework.
- Filters live in the URL (`?q=&topic=&district=` etc.) so filtered views can be shared.
- Use `ui/Icon` with Lucide names; don't add icon or UI libraries.
- Commit messages are short and start with the phase, e.g. `Phase D: new Events page …`.
- The owner runs `git` commands themselves unless they ask otherwise; don't commit or push unasked.
