// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://keralangounion.in',
  trailingSlash: 'ignore',
  adapter: cloudflare({ imageService: 'passthrough' }),
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  vite: { plugins: [tailwindcss()] },
});
