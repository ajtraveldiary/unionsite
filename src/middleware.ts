// Two jobs. The admin (plan, sections 10 and 13): every /admin page and /api/admin call needs a
// signed-in, active user (src/lib/admin/auth.ts), writes must come from our own pages, and admin
// responses are never cached or indexed and carry a strict Content-Security-Policy (only our own
// API and Google's Gemini endpoint may be called, since Gemini keys live in the browser).
//
// And in dev and the local cache test, it logs how many D1 queries each request ran, so a page
// served from the cache can be seen to read nothing: "[d1] GET /news · 0 queries · HIT". Pages
// stream, and their components query while streaming, so the count is taken when the body has finished.
import { defineMiddleware, sequence } from 'astro:middleware';
import { queryCount } from '~/db/client';
import { currentUser } from '~/lib/admin/auth';

const ADMIN_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://generativelanguage.googleapis.com",
  "frame-src 'self' https://www.youtube-nocookie.com",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "base-uri 'none'",
  "object-src 'none'",
].join('; ');

const admin = defineMiddleware(async (ctx, next) => {
  const path = ctx.url.pathname;
  const isApi = path.startsWith('/api/admin/') || path === '/api/admin';
  const isPage = path === '/admin' || path.startsWith('/admin/');
  if (ctx.isPrerendered || !(isApi || isPage)) return next();

  const done = (res: Response) => {
    const headers = new Headers(res.headers);
    headers.set('Cache-Control', 'private, no-store');
    headers.set('X-Robots-Tag', 'noindex, nofollow');
    headers.set('Content-Security-Policy', ADMIN_CSP);
    headers.set('Referrer-Policy', 'same-origin');
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };

  // Writes only from our own pages (the browser always sends Origin on these)
  if (isApi && ctx.request.method !== 'GET' && ctx.request.headers.get('Origin') !== ctx.url.origin) {
    return done(Response.json({ error: 'This request did not come from the admin.' }, { status: 403 }));
  }
  if (path === '/admin/login') return done(await next());

  const user = await currentUser(ctx.request, ctx.cookies);
  if (!user) {
    if (isApi) return done(Response.json({ error: 'You are signed out. Sign in again and retry.' }, { status: 401 }));
    return done(ctx.redirect(`/admin/login?next=${encodeURIComponent(path + ctx.url.search)}`));
  }
  ctx.locals.user = user;
  return done(await next());
});

const queryLog = defineMiddleware(async (ctx, next) => {
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

export const onRequest = sequence(queryLog, admin);
