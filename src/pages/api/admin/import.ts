import type { APIRoute } from 'astro';
import { body, handle, userOf } from '~/lib/admin/api';
import { alreadyHere, checkItems, finishJob, importBatch, startJob } from '~/lib/admin/import';
import { AdminError } from '~/lib/admin/publish';

// The WordPress import's steps (src/lib/admin/import.ts), super admin only:
//   POST { step: 'scan', ids, links }       → { already }: how many of these posts are on the site
//   POST { step: 'check', items }           → { results }: the dry run, nothing written
//   POST { step: 'start', fileName, total } → { job }
//   POST { step: 'batch', job, items }      → { results, counts }: up to 25 posts
//   POST { step: 'finish', job, failed? }   → { counts }
export const prerender = false;

const list = (v: unknown) => (Array.isArray(v) ? v : []);

export const POST: APIRoute = (ctx) =>
  handle(async () => {
    const user = userOf(ctx);
    const b = await body(ctx);
    switch (b.step) {
      case 'scan': return { already: await alreadyHere(user, list(b.ids).map(Number).filter(Number.isInteger).slice(0, 20000), list(b.links).map(String).slice(0, 20000)) };
      case 'check': return { results: await checkItems(user, list(b.items)) };
      case 'start': return { job: await startJob(user, String(b.fileName ?? ''), Number(b.total) || 0) };
      case 'batch': return importBatch(user, Number(b.job), list(b.items));
      case 'finish': return finishJob(user, Number(b.job), b.failed === true);
      default: throw new AdminError('Unknown step.');
    }
  });
