// @ts-check
import { defineConfig, memoryCache } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import { cacheCloudflare } from '@astrojs/cloudflare/cache';
import tailwindcss from '@tailwindcss/vite';

// Pages read from D1 are cached at Cloudflare's edge and purged by tag on publish (src/lib/cache.ts).
// `npm run preview:cached` swaps in an in-memory cache so the same behaviour can be tried locally,
// where Cloudflare's Worker cache doesn't run. (`astro dev` never caches.)
const localCache = /** @type {any} */ (globalThis).process.env.ASTRO_LOCAL_CACHE === '1';

export default defineConfig({
  site: 'https://keralangounion.in',
  trailingSlash: 'ignore',
  adapter: cloudflare({ imageService: 'passthrough' }),
  cache: { provider: localCache ? memoryCache() : cacheCloudflare() },
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  vite: {
    plugins: [tailwindcss()],
    define: { 'import.meta.env.LOCAL_CACHE_TEST': JSON.stringify(localCache) },
  },
});
