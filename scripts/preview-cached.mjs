// Builds the site with an in-memory page cache and serves it on the local D1, to try the edge
// cache before Cloudflare is set up (plan, section 15, Phase 1). The terminal logs each request's
// D1 queries; /api/dev/cache counts them and purges tags.
//
//   npm run preview:cached
//
// The build lands in dist/ like a normal one; run `npm run build` again before deploying.
import { spawn, spawnSync } from 'node:child_process';

const env = { ...process.env, ASTRO_LOCAL_CACHE: '1' };
const astro = (args, wait) =>
  (wait ? spawnSync : spawn)(['npx', 'astro', ...args].join(' '), { stdio: 'inherit', env, shell: true });

if (astro(['build'], true).status !== 0) process.exit(1);
astro(['preview', ...process.argv.slice(2)]);
