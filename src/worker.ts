// The Worker's entry (wrangler.jsonc "main"): Astro's own request handler, plus the jobs the
// Cron Trigger runs every five minutes: publishing scheduled posts (plan, section 10); and once an
// hour, new videos from the union's YouTube channel, the analytics roll-up (section 14) and
// deleting inbox messages older than Settings keeps them (section 13).
import handler from '@astrojs/cloudflare/entrypoints/server';
import { publishDuePosts } from '~/lib/admin/posts';
import { syncChannel } from '~/lib/admin/albums';
import { deleteOldMessages } from '~/lib/admin/inbox';
import { rollup } from '~/lib/analytics';

interface Ctx { waitUntil(p: Promise<unknown>): void }

const job = (name: string, run: () => Promise<unknown>) => run().catch((err) => console.error(`${name} failed`, err));

export default {
  fetch: handler.fetch,
  async scheduled(_controller: unknown, _env: unknown, ctx: Ctx) {
    ctx.waitUntil(job('Scheduled publishing', async () => {
      const n = await publishDuePosts();
      if (n) console.log(`Published ${n} scheduled post${n === 1 ? '' : 's'}`);
    }));
    // The first run of each hour does the hourly jobs
    if (new Date().getUTCMinutes() < 5) {
      ctx.waitUntil(job('Video sync', () => syncChannel(null)));
      ctx.waitUntil(job('Analytics roll-up', rollup));
      ctx.waitUntil(job('Inbox clean-up', deleteOldMessages));
    }
  },
};
