// Live progress bar for scripts/crawl.mjs, for a second terminal while the crawl runs: counts
// the pages saved in the crawl cache against the expected total (about 955 for the current
// site: feed 173, year archives ~180, downloads 380 + categories ~72, flipbooks 143, sitemaps).
// Stops when the crawl log says it's done. Run: node scripts/crawl-progress.mjs [total]
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const PAGES = new URL('./.cache/pages/', import.meta.url);
const LOG = new URL('./.cache/crawl.log', import.meta.url);
const TOTAL = Number(process.argv[2]) || 955;
const WIDTH = 40;
const samples = []; // [time, pages] over the last two minutes, for the pace

function draw() {
  const done = existsSync(PAGES) ? readdirSync(PAGES).length : 0;
  const log = existsSync(LOG) ? readFileSync(LOG, 'utf8') : '';
  const stage = log.match(/^[A-Z][^\n]*…$/gm)?.at(-1)?.replace('…', '') ?? 'Starting';
  const finished = log.includes('Done:');
  const share = finished ? 1 : Math.min(done / TOTAL, 0.99);
  const filled = Math.round(share * WIDTH);
  // Time left at the pace of the last two minutes (the old server speeds up and slows down)
  const now = Date.now();
  samples.push([now, done]);
  while (samples.length > 2 && now - samples[0][0] > 120_000) samples.shift();
  const [t0, d0] = samples[0];
  const rate = now > t0 ? (done - d0) / ((now - t0) / 1000) : 0;
  const left = rate > 0 && !finished ? Math.max(1, Math.round((TOTAL - done) / rate / 60)) : 0;
  const eta = finished ? 'done' : now - t0 < 20_000 ? 'measuring…' : rate > 0 ? `about ${left} min left` : 'waiting for the server…';
  process.stdout.write(`\r[${'#'.repeat(filled)}${'-'.repeat(WIDTH - filled)}] ${String(Math.round(share * 100)).padStart(3)}%  ${done}/${TOTAL} pages · ${stage} · ${eta}      `);
  if (finished) { process.stdout.write('\nCrawl finished.\n'); process.exit(0); }
}
draw();
setInterval(draw, 2000);
