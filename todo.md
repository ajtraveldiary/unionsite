# To do

Everything left to build or decide for the new keralangounion.in, roughly in order. The plan
([`docs/plan.md`](docs/plan.md)) says what and why; this list says what's left. § numbers are plan sections.

How this list is kept:

- When an item is finished, tick it (`[x]`), add the date and move it to **Done** at the bottom.
- When the owner asks for something, or the work turns up a new task, add it under the right heading.
- If the plan drops something, delete its item; if the plan changes, rewrite the item to match.
- **(union)** marks items only the union or the owner can do or decide.

## Answers needed from the union (§17)

- [ ] **(union)** Conferences page order: newest first (as wireframed, with a switch) or from the 1st (as the plan says)?
- [ ] **(union)** Offline copy: keep only recently opened orders, or also the home page and the Orders list?

- [ ] **(union)** Who owns keralangounion.in and its DNS? It must move to, or point at, a union-owned Cloudflare account. *Before launch: the owner decided (22 Oct 2026) the domain is connected only in the last phase*
- [ ] **(union)** Which Cloudflare and GitHub accounts to use, and in whose name (union-owned recommended). *Before Phase 1 deploy*
- [ ] **(union)** A vector version of the logo (SVG, AI or PDF) and any colour rules
- [ ] **(union)** The State Centre's official email and phone (blank on the old site)
- [ ] **(union)** Gemini keys: one union-owned key shared with editors, or one per district admin? *Before Phase 3*
- [ ] **(union)** The first super admin and state editors, and each district's admin. *Before Phase 4*
- [ ] **(union)** OCR scanned GO PDFs so their text is searchable? *Phase 4*
- [ ] **(union)** Target launch date
- [ ] **(union)** Tools & guides: build the calculators and how-to guides, or hide their home-page tiles?
- [ ] **(union)** How long done inbox messages are kept (§13 says 12 months; the inbox wireframe says undecided). The privacy page then states it
- [ ] **(union)** Old-link redirects: on hold by the owner's decision (§12). Turn them on before launch?
- [ ] **(union)** Which service sends the admin's emails (review notifications), on whose account: Resend or Cloudflare's email sending? (§17)
- [ ] **(union)** How many admins and editors in all? Cloudflare Access's free plan allows 50 (§16)
- [ ] **(union)** Office-bearers' personal phone numbers on district pages, with their agreement (as the People wireframe shows), or office phones only (§13)?
- [ ] **(union)** Leadership confirms the old site's content may be migrated and republished (§12)

## Phase 0 · Design: what's left (§7)

- [ ] **(union)** 6–8 short interviews with members and 2–3 district admins
- [ ] **(union)** Tree test of the menu with 10–15 members, using Malayalam tasks (target: 80 % right first time)
- [ ] **(union)** Usability test with 5 members on their own phones: find a DA order, read your district's news, open the current Kerala Service (redesign step E)
- [ ] One person owns the interface wording (English labels, errors, empty states, emails) with a one-page style sheet

## Phase 1 · Foundations: the part that needs the account (§15)

- [ ] Create the real D1 database, put its id in `wrangler.jsonc`, apply the migrations remotely and load the content
- [ ] Create the R2 bucket; until launch, files are served through the Worker (or the bucket's r2.dev address, for testing only), and `media.keralangounion.in` is added at launch
- [ ] Deploy to the Worker's `workers.dev` address from GitHub through Cloudflare, with a preview URL per branch and its own D1 database (no domain needed until launch)
- [ ] Confirm the edge cache on the `workers.dev` address: a second visit reads no D1, and a tag purge makes the next visit read D1 again (Cloudflare's Workers cache works on workers.dev and preview URLs, each with its own cache)
- [ ] Decide on the `SESSION` KV binding the Cloudflare adapter adds to every build: create the namespace, or turn sessions off (the site doesn't use them)
- [ ] Switch on admin login: an Access application for `/admin` and `/api/admin` (email one-time code, any email let through to the app), then set `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` and `ADMIN_BOOTSTRAP_EMAIL` (the first super admin). The token check and the users table are built (§10)
- [ ] Usage alerts at 80 % of the D1, R2 and Workers limits (§13)

## Phase 2 · Demo data and core site (§12, §9)

- [ ] Copy the crawled photos and PDFs into R2 in the standard WebP sizes, and stop linking to the old site (§9 "Media and thumbnails")
- [ ] Turn on the disabled "Open PDF" and "Read the PDF" buttons once every file is in R2
- [ ] District data from the ~100 district posts (office-bearers, committees, history, addresses, galleries) into people and positions tables, with a "Needs checking" queue; show it on the district hub tabs
- [ ] Review the topics the importer guessed from title keywords
- [ ] Fix crawl data: post 15526 has an empty title
- [ ] Core templates pass the §9 performance budgets (LCP under 2 s, Lighthouse 95+, JavaScript under 50 KB on articles)

## Phase 3 · Feature pages (§11)

- [ ] Search: suggestions under the header search box after 2 characters (top 5), highlighted words in results, and counting searches that find nothing (with analytics, §14)
- [ ] Search acceptance test with real orders after the import: "ക്ഷാമബത്ത", "DA 2024" and "81/2014" each return the right orders in the top 3 within 300 ms (the crawl has no 2024 DA order and no 81/2014, so only part of it can be checked now)
- [ ] Grow the spelling-variants list (`VARIANTS` in `src/lib/search.ts`) as zero-result searches show new ones
- [ ] Orders page: it puts all 379 orders in its HTML (about 1 MB) and searches them in the browser; page it from the server and use `/api/search` instead
- [ ] Text of the crawled orders' PDFs into `pdf_text` (new uploads have it since 25 Oct 2026), and OCR for scanned ones if the union agrees
- [ ] Kerala Service reader on pdf.js (start from `components/ds/PdfReader.astro`, built for documents): first page while the rest loads, two-page spreads on desktop, thumbnails, zoom, page jump, deep links (`#p=12`). Acceptance: a 20 MB issue shows page 1 in under 3 s on 4G
- [ ] Events: one page per event (`/events/{slug}`), "Add to calendar" (.ics and Google), a public calendar feed, multi-day spans, and past events linking to their album (the report link is built)
- [ ] Kerala Service issues in site search (titles and contents lines), and the reader's deep links to contents pages
- [ ] **(union)** Move the content over from the old site in Admin → Pages & documents: the History text, the Struggles (one heading per struggle, starting with its year), the Bye-Law and resolutions, the 63 past conferences. The pages and their About cards appear as soon as something is published
- [ ] Orders acceptance test: a member opens a specific GO's PDF from the home page in 3 taps or fewer
- [ ] Site extras (§8): add-to-home-screen app (manifest, 192/512 maskable icons, offline page with recent orders), a favicon set from the vector logo, print layout for orders and articles

## Phase 4 · Admin panel and translation (§6, §10, §14)

- [ ] Contact page: the district offices from D1 (Admin → Districts), with Directions
- [ ] Where a district's cover photo shows on the site (the approved hub design has no place for it): design decision
- [ ] Roles, district limits and cache purges for every new screen's API, as posts have them (`src/lib/admin/roles.ts`, `purgeTags` in `src/lib/cache.ts`)
- [ ] Review notifications by email, once a sending service is chosen (the dashboard already lists what waits); the same service sends new contact messages to their district admin and the state office
- [ ] Analytics Engine on the real account: the `ANALYTICS` dataset binding, `CF_ACCOUNT_ID`, a read-only `CF_API_TOKEN`, `ANALYTICS_DATASET` and `ANALYTICS_SALT`; then check that the hourly roll-up fills the dashboard
- [ ] View counts on articles ("1.2k views") from `content_views_daily` (§14)
- [ ] Admin help: screenshots for each step and the 60-second videos; **(union)** the state office corrects the Malayalam drafts in `src/data/help.ts`
- [ ] Photos: focal point after upload, square crop for office-bearers, the blurred placeholder and dominant colour (§9)
- [ ] Order PDF previews (page 1 at 96 and 120 px beside each order, §9)
- [ ] Done when: two district admins publish a post, an event and an office-bearer change from a phone without help

## Phase 5 · Import, testing and launch (§12, §13, §15)

- [ ] WordPress import of the rest, once the real files are in hand: the uploads folder (.zip) into R2, the SQL dump, Download Manager orders, 3D FlipBook issues, and pages (the WXR import of posts is built)
- [ ] Redirects, if turned on: the `redirects` table, the Worker lookup, 410 for junk pages, and a test that 100 % of old sitemap URLs resolve
- [ ] SEO: XML sitemaps by type, `robots.txt`, structured data for events, the organisation and breadcrumbs (articles already have it), 1200 × 630 share images, an RSS feed for orders, Search Console and Bing
- [ ] Turnstile on the contact form: create the widget, set `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET` (the check is built)
- [ ] Security: CSP, HSTS and the other headers; rate limits on search (the contact form has its own daily limit); Renovate; an OWASP review including tests that one district can't edit another
- [ ] Tests: unit tests (API, permissions, importer), Playwright tests of the key journeys, axe checks in CI, the device matrix, a load test at 10× peak, the 15-task admin acceptance script
- [ ] Monitoring: uptime checks every minute, error tracking (Sentry), a weekly 404 report
- [ ] Backups: nightly D1 export to a backup R2 bucket, R2 versioning, and a restore drill before launch
- [ ] Accessibility checklist (§9) verified on every template
- [ ] Before launch (§12): the final export imported and spot-checked, districts confirm their office-bearers, the old site kept read-only for 3 months
- [ ] Connect keralangounion.in to the Worker (the last phase, by the owner's decision) and `media.keralangounion.in` to the R2 bucket, then check the edge cache again on the real domain
- [ ] Go-live checklist (§15): DNS and SSL, www → apex, Lighthouse 95+, admins invited and trained, content freeze 48 hours before the switch, the announcement
- [ ] After launch: daily checks for 2 weeks, then the 30-day and 90-day reviews

## Done

- [x] 2026-10-25 Admin slice 4: contact form saved to the Inbox (honeypot, Turnstile check, 5 a day per sender, kept 12 months), Users, Settings (Gemini key per admin, auto-draft on publish, glossary in D1, site details with a site-wide purge, AI switch and model), Audit log screen, Analytics (beacon, hourly roll-ups, dashboard by role, CSV), WordPress import wizard (WXR posts: scan, map, dry run, batches, report), Help (Malayalam drafts by role); migration `0006_inbox_analytics_import`
- [x] 2026-10-25 Public pages for what the admin manages: History (milestones, contents), Struggles (timeline, recent stories), other About pages, Documents and one page per document with an on-page PDF reader, Conferences timeline (newest first, "From the 1st" switch, "Go to") and one page per conference, photo albums with a lightbox on Media and district Gallery tabs, district histories; About cards link once their content is published
- [x] 2026-10-25 Admin slice 3: People & committees (terms, start and publish a new term, past terms, approvals, photos), Districts (overview, cover, area committees, offices with map pins), Pages & documents (About pages and district histories with English approval, documents, conferences), Media (library with used-in, descriptions, replace, delete; albums; videos with hourly channel sync); migration `0005_people_pages_media`
- [x] 2026-10-25 State committee, About, Media and district hubs read committees, offices and videos from D1 (moved from `site.ts`)
- [x] 2026-10-25 Admin slice 2: Orders (upload many PDFs with GO number, date, title and subject read from the PDF, duplicate check, publish together; list, edit, replace the PDF), Kerala Service (cover from page 1, month from the file name, contents lines, drafts, replace the PDF), Events (moved into D1 and search; drafts, review, English approval, report link), Home & banner (banner, headline, preview, history and Show again, lead story, district requests); migration `0004_events`
- [x] 2026-10-25 Scheduled posts published by a Cron Trigger every five minutes (`src/worker.ts`)
- [x] 2026-10-25 Events read from D1 on the public site, with the `events` cache tag and past events' report links
- [x] 2026-10-23 Admin slice 1: sign-in (Access token check, users table, local stand-in login with one test user per role), roles enforced in the API, Dashboard, News list, post editor (TipTap, autosave every 10 s, working copy of published posts, Update and Discard, history and restore, "being edited by" lock, phone and laptop preview, cover photos resized in the browser and stored in R2, Gemini English drafts and Approve English, "Out of date" flags, send for review, request a home-page place), publishing that updates search and purges the cache, audit log; migration `0003_admin`
- [x] 2026-10-23 Plan reviewed before the admin build; the admin is built inside the Astro app instead of a separate React app (owner's decision)
- [x] 2026-10-22 Search in D1: FTS5 trigram index (`search_docs` + `search_fts`), `/api/search` and `/api/news`, spelling variants, a fallback for short words, partial matches ranked lower; Search and News pages use them, and the 830 KB and 670 KB JSON indexes are gone. Tested against the old search on 21 queries and 8 news filters: nothing lost
- [x] 2026-10-22 Wireframes for the 10 public pages the plan has but the site doesn't yet (listed in `wireframelist.md`), approved by the owner
- [x] 2026-10-22 Wireframes for the last six admin screens (Pages & documents, Districts, Analytics, Audit log, Import, Help), approved by the owner; all 18 admin screens are now wireframed
- [x] 2026-10-22 Phase 1 local work and todo.md committed and pushed
- [x] 2026-10-22 Phase 1, local part: D1 tables and migrations, the crawl loaded into a local D1, every content page reading D1 on request, the edge cache with purge by tag tested locally
- [x] 2026-10-22 The rebuild plan moved into the repo as `docs/plan.md` and brought up to date
- [x] 2026-10-22 Database chosen: Cloudflare D1; Malayalam and GO-number search tested on a local D1
- [x] 2026-10-22 README with the site map
- [x] 2026-10-21 Admin wireframes, all 12 screens, approved
- [x] 2026-10-21 Home banner and Articles section
- [x] 2026-10-21 Real content crawled from the old site (1,611 posts, 379 orders, 138 issues)
- [x] 2026-10-21 Redesign A–D (wireframes, design system, all public pages) and F (clean-up)
