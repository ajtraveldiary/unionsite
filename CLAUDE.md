# Kerala NGO Union website

The new keralangounion.in: an Astro 7 site on Cloudflare for the union of Kerala State Government
employees. The master plan is `../Kerala NGO Union — Website Rebuild Plan.md` (one folder up);
code comments that say "plan, section N" refer to it.

Right now the site is a **preview**. News, GO orders and Kerala Service are real content crawled
from the current keralangounion.in (`src/data/live/*.json`; photos and PDFs are still linked from
the old site). Events, videos and the state committee are hand-written in `src/data/site.ts`;
events are sample data. The admin panel, database and file storage are not built yet.

## Commands

- `npm run dev`: dev server on port 4321 (in the desktop app, start it with the "site" entry in `.claude/launch.json`)
- `npm run check`: Astro/TypeScript check. Must show 0 errors, 0 warnings.
- `npm run build`: builds every page (about 4,320 with the crawled archive, ~75 s). Run it after changing pages or data.
- `npm run map`: regenerates `src/data/geo/kerala-map.json` from the district GeoJSON (rarely needed)
- `node scripts/crawl.mjs`: reads the current site into `scripts/.cache/` (one request at a time,
  cached; a full run from scratch takes hours because the old server is slow). `--cache-only` builds
  from the cache without fetching. Watch it with `node scripts/crawl-progress.mjs` in another terminal.
- `node scripts/import-crawl.mjs`: turns the crawl into `src/data/live/*.json` (topics, districts,
  subjects, GO numbers, transliterated slugs). Never edit those JSON files by hand; change the
  script and rerun it.

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
- `src/lib/content.ts`: all content queries. Pages call these, never the data files directly, so the
  Phase 2 database can replace them with the same function signatures.
- `src/lib/search.ts`: search scoring shared by `/search` and the Orders page (index at `/search-index.json`).
- The News page renders only the newest stories; filters, search and "Load more" read
  `/news-index.json`. Lists that could hold the whole archive must stay limited like this.
- `src/lib/i18n.ts`: `t()` / `langOf()` for bilingual text, `href()` for `/en` paths, date formatting.
- `/design-system`: the living style guide. `/wireframes`: the greyscale Phase A wireframes, kept on
  purpose (noindex) with their own `wire.css` and `components/wire/`.

## Design rules (agreed with the owner; ask before changing any)

- Direction is "civic newsroom": calm, flat, content first, one union-red accent. Not campaign-bold.
- The header is a light grey strip (`--bg-subtle`) on every page: sticky, always the same height,
  a shadow once scrolled; the current section has a red underline. On the home page the grey
  carries on as a wave.
- The home page has at most one campaign banner (`banner` in `src/data/site.ts`): real text over an
  optional photo, never a picture of text, no carousel. Without one, the wave is a short band.
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
