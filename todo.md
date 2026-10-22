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

- [ ] **(union)** Who owns keralangounion.in and its DNS? It must move to, or point at, a union-owned Cloudflare account. *Before Phase 1 deploy*
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
- [ ] **(union)** Leadership confirms the old site's content may be migrated and republished (§12)

## Phase 0 · Design: what's left (§7)

- [ ] **(union)** 6–8 short interviews with members and 2–3 district admins
- [ ] **(union)** Tree test of the menu with 10–15 members, using Malayalam tasks (target: 80 % right first time)
- [ ] **(union)** Usability test with 5 members on their own phones: find a DA order, read your district's news, open the current Kerala Service (redesign step E)
- [ ] One person owns the interface wording (English labels, errors, empty states, emails) with a one-page style sheet

## Phase 1 · Foundations: the part that needs the account (§15)

- [ ] Create the real D1 database, put its id in `wrangler.jsonc`, apply the migrations remotely and load the content
- [ ] Create the R2 bucket and the `media.keralangounion.in` domain
- [ ] Deploy a preview from GitHub through Cloudflare, with a preview URL per branch and its own D1 database
- [ ] Confirm the edge cache on Cloudflare: a second visit reads no D1, and a tag purge makes the next visit read D1 again
- [ ] Decide on the `SESSION` KV binding the Cloudflare adapter adds to every build: create the namespace, or turn sessions off (the site doesn't use them)
- [ ] Admin login: Cloudflare Access with an email code, plus the users and roles tables
- [ ] Usage alerts at 80 % of the D1, R2 and Workers limits (§13)

## Phase 2 · Demo data and core site (§12, §9)

- [ ] Copy the crawled photos and PDFs into R2 in the standard WebP sizes, and stop linking to the old site (§9 "Media and thumbnails")
- [ ] Turn on the disabled "Open PDF" and "Read the PDF" buttons once every file is in R2
- [ ] District data from the ~100 district posts (office-bearers, committees, history, addresses, galleries) into people and positions tables, with a "Needs checking" queue; show it on the district hub tabs
- [ ] Move events, videos and the state committee from `src/data/site.ts` into D1 tables
- [ ] Review the topics the importer guessed from title keywords
- [ ] Fix crawl data: post 15526 has an empty title
- [ ] Core templates pass the §9 performance budgets (LCP under 2 s, Lighthouse 95+, JavaScript under 50 KB on articles)

## Phase 3 · Feature pages (§11)

- [ ] Search in D1: an FTS5 trigram table filled on every save, a search API, and `/search` and the Orders page using it instead of `/search-index.json` and `/news-index.json`
- [ ] Search: a list of Malayalam spelling variants (for example the three spellings of "secretariat"), the fallback for queries under 3 characters, suggestions after 2 characters, highlighted snippets, and logging of zero-result searches
- [ ] Search acceptance test: "ക്ഷാമബത്ത", "DA 2024" and "81/2014" each return the right orders in the top 3 within 300 ms
- [ ] Order PDFs' text extracted at upload (`pdf_text`) and searchable
- [ ] Kerala Service reader on pdf.js: first page while the rest loads, two-page spreads on desktop, thumbnails, zoom, page jump, deep links (`#p=12`). Acceptance: a 20 MB issue shows page 1 in under 3 s on 4G
- [ ] Events: one page per event (`/events/{slug}`), "Add to calendar" (.ics and Google), a public calendar feed, multi-day spans, and past events linking to their report and album
- [ ] Photo albums (`/gallery/{album}`) with a lightbox
- [ ] About pages from the old site: History, Conferences (timeline and one page per conference), Struggles, Documents (their cards say "Coming soon" now)
- [ ] Contact form that sends: Worker + Turnstile + email, saved for the admin inbox
- [ ] Orders acceptance test: a member opens a specific GO's PDF from the home page in 3 taps or fewer
- [ ] Site extras (§8): add-to-home-screen app (manifest, 192/512 maskable icons, offline page with recent orders), a favicon set from the vector logo, print layout for orders and articles

## Phase 4 · Admin panel and translation (§6, §10, §14)

- [ ] The admin app at `/admin`, built from the 18 wireframes: Dashboard, News, Post editor, Events, Orders upload, Kerala Service upload, Pages & documents, People & committees, Districts, Media, Home & banner, Inbox, Analytics, Users, Audit log, Import, Settings, Help
- [ ] Post editor: TipTap, autosave every 10 s, version history with restore, phone/desktop preview, "Being edited by …" lock
- [ ] Roles and district limits enforced in the API on every request (§10 table)
- [ ] Publishing purges the edge cache by tag (`purgeTags` in `src/lib/cache.ts`)
- [ ] Review workflow: Submit for review, notifications (dashboard and email), Request home feature
- [ ] AI translation with each admin's own Gemini key: drafts, side-by-side review, Approve English, "Out of date" flags, the glossary
- [ ] Upload pipeline: WebP sizes made in the browser, focal point, signed uploads straight to R2, duplicate check, required alt text
- [ ] Orders upload reads the GO number and date from the PDF; Kerala Service upload makes the cover from page 1
- [ ] People & committees with terms, and "start new term"
- [ ] Inbox, Users (invite, deactivate), Settings, Audit log
- [ ] Analytics (§14): the beacon, Workers Analytics Engine, hourly roll-ups, the dashboard, view counts on articles
- [ ] Admin help at `/admin/help`: a short Malayalam how-to guide with screenshots
- [ ] Done when: two district admins publish a post, an event and an office-bearer change from a phone without help

## Phase 5 · Import, testing and launch (§12, §13, §15)

- [ ] WordPress import wizard (WXR, uploads archive, optional SQL dump): scan, map, dry run, re-runnable import, report
- [ ] Redirects, if turned on: the `redirects` table, the Worker lookup, 410 for junk pages, and a test that 100 % of old sitemap URLs resolve
- [ ] SEO: XML sitemaps by type, `robots.txt`, structured data for events, the organisation and breadcrumbs (articles already have it), 1200 × 630 share images, an RSS feed for orders, Search Console and Bing
- [ ] Security: CSP, HSTS and the other headers; rate limits on the contact form and search; Renovate; an OWASP review including tests that one district can't edit another
- [ ] Tests: unit tests (API, permissions, importer), Playwright tests of the key journeys, axe checks in CI, the device matrix, a load test at 10× peak, the 15-task admin acceptance script
- [ ] Monitoring: uptime checks every minute, error tracking (Sentry), a weekly 404 report
- [ ] Backups: nightly D1 export to a backup R2 bucket, R2 versioning, and a restore drill before launch
- [ ] Accessibility checklist (§9) verified on every template
- [ ] Before launch (§12): the final export imported and spot-checked, districts confirm their office-bearers, the old site kept read-only for 3 months
- [ ] Go-live checklist (§15): DNS and SSL, www → apex, Lighthouse 95+, admins invited and trained, content freeze 48 hours before the switch, the announcement
- [ ] After launch: daily checks for 2 weeks, then the 30-day and 90-day reviews

## Done

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
