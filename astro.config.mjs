// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import preact from '@astrojs/preact';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://keralangounion.in',
  trailingSlash: 'ignore',
  redirects: { '/about': '/about/state-committee', '/en/about': '/en/about/state-committee' },
  adapter: cloudflare({ imageService: 'passthrough' }),
  integrations: [preact()],
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  vite: { plugins: [tailwindcss()] },
});
