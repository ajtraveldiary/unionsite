# Wireframes

Every wireframed page, where to see it (run `npm run dev`, then open the address), whether the real
page is built, and where its review stands. The wireframes are greyscale and structure only; the
real pages use the design system (`/design-system`). Each wireframe has numbered notes explaining
its choices; the toolbar's **Notes** switch hides them, and the admin wireframes have a
**View as** switch for the four roles.

How this list is kept:

- A new wireframe is added here as **To review**.
- When the owner approves it, it becomes **Approved** with the date; changes asked for go into
  `todo.md` and the wireframe is updated, then reviewed again.
- When the real page is built, the **Built** column gets its address.
- If the plan drops a page, its row and wireframe are removed.

## Public site

| Page | Wireframe | Built | Review |
| --- | --- | --- | --- |
| Home | `/wireframes` | `/` | Approved (Phase A, Oct 2026) |
| News | `/wireframes/news` | `/news` | Approved (Phase A, Oct 2026) |
| Article | `/wireframes/article` | `/news/{year}/{slug}` | Approved (Phase A, Oct 2026) |
| Orders | `/wireframes/orders` | `/orders` | Approved (Phase A, Oct 2026) |
| District | `/wireframes/district` | `/districts/{district}` | Approved (Phase A, Oct 2026) |
| About | `/wireframes/about` | `/about` | Approved (Phase A, Oct 2026) |
| History | `/wireframes/history` | Not yet | Approved 22 Oct 2026 |
| Conferences | `/wireframes/conferences` | Not yet | Approved 22 Oct 2026 (open: newest first, or from the 1st as the plan says; see todo.md) |
| One conference | `/wireframes/conference` | Not yet | Approved 22 Oct 2026 |
| Struggles | `/wireframes/struggles` | Not yet | Approved 22 Oct 2026 |
| Documents | `/wireframes/documents` | Not yet | Approved 22 Oct 2026 |
| One document | `/wireframes/document` | Not yet | Approved 22 Oct 2026 |
| One event | `/wireframes/event` | Not yet | Approved 22 Oct 2026 |
| Photo album | `/wireframes/album` | Not yet | Approved 22 Oct 2026 |
| Kerala Service reader | `/wireframes/reader` | Not yet | Approved 22 Oct 2026 |
| Offline page | `/wireframes/offline` | Not yet | Approved 22 Oct 2026 (open: also save the home page and the Orders list; see todo.md) |

Built without a wireframe (straight from the design system in Phase D, approved 21 Oct 2026):
Single order, Search, Districts, Events, Kerala Service and issue page, State committee, Contact,
Media, Useful links, Privacy, Accessibility, 404.

Not wireframed, waiting for the union's decision: the Tools & guides calculators and how-to guides
(see `todo.md`).

## Admin panel

| Screen | Wireframe | Built | Review |
| --- | --- | --- | --- |
| Dashboard | `/wireframes/admin` | Not yet | Approved 21 Oct 2026 |
| News list | `/wireframes/admin/news` | Not yet | Approved 21 Oct 2026 |
| Post editor | `/wireframes/admin/editor` | Not yet | Approved 21 Oct 2026 |
| Orders upload | `/wireframes/admin/orders` | Not yet | Approved 21 Oct 2026 |
| Home & banner | `/wireframes/admin/banner` | Not yet | Approved 21 Oct 2026 |
| Users | `/wireframes/admin/users` | Not yet | Approved 21 Oct 2026 |
| Events | `/wireframes/admin/events` | Not yet | Approved 21 Oct 2026 |
| Kerala Service upload | `/wireframes/admin/kerala-service` | Not yet | Approved 21 Oct 2026 |
| People & committees | `/wireframes/admin/people` | Not yet | Approved 21 Oct 2026 |
| Media (with albums and videos) | `/wireframes/admin/media` | Not yet | Approved 21 Oct 2026 |
| Inbox | `/wireframes/admin/inbox` | Not yet | Approved 21 Oct 2026 |
| Settings (with the glossary and AI key) | `/wireframes/admin/settings` | Not yet | Approved 21 Oct 2026 |
| Pages & documents | `/wireframes/admin/pages` | Not yet | Approved 22 Oct 2026 |
| Districts | `/wireframes/admin/districts` | Not yet | Approved 22 Oct 2026 |
| Analytics | `/wireframes/admin/analytics` | Not yet | Approved 22 Oct 2026 |
| Audit log | `/wireframes/admin/audit` | Not yet | Approved 22 Oct 2026 |
| Import | `/wireframes/admin/import` | Not yet | Approved 22 Oct 2026 |
| Help | `/wireframes/admin/help` | Not yet | Approved 22 Oct 2026 |

Login is Cloudflare Access's own screen (an email and a 6-digit code), so it has no wireframe.
