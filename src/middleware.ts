// In dev and the local cache test, logs how many D1 queries each request ran, so a page served
// from the cache can be seen to read nothing: "[d1] GET /news · 0 queries · HIT". Pages stream,
// and their components query while streaming, so the count is taken when the body has finished.
import { defineMiddleware } from 'astro:middleware';
import { queryCount } from '~/db/client';

export const onRequest = defineMiddleware(async (ctx, next) => {
  if (ctx.isPrerendered || !(import.meta.env.DEV || import.meta.env.LOCAL_CACHE_TEST)) return next();
  const before = queryCount();
  const response = await next();
  const cache = response.headers.get('X-Astro-Cache');
  const log = () => {
    const n = queryCount() - before;
    console.log(`[d1] ${ctx.request.method} ${ctx.url.pathname}${ctx.url.search} · ${n} ${n === 1 ? 'query' : 'queries'}${cache ? ` · ${cache}` : ''}`);
  };
  if (!response.body) return log(), response;
  const body = response.body.pipeThrough(new TransformStream({ flush: log }));
  return new Response(body, response);
});
