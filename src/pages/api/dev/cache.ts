import type { APIRoute } from 'astro';
import { queryCount } from '~/db/client';

// Local cache test only (`npm run preview:cached`); 404 everywhere else.
//   GET  /api/dev/cache              → { queries }: D1 queries run since the worker started
//   POST /api/dev/cache?tags=posts   → purges those tags, as publishing will (src/lib/cache.ts)
export const prerender = false;

const off = () => new Response('Not found', { status: 404 });

export const GET: APIRoute = () => (import.meta.env.LOCAL_CACHE_TEST ? Response.json({ queries: queryCount() }) : off());

export const POST: APIRoute = async (context) => {
  if (!import.meta.env.LOCAL_CACHE_TEST) return off();
  const purged = (context.url.searchParams.get('tags') ?? '').split(',').filter(Boolean);
  await context.cache.invalidate({ tags: purged });
  return Response.json({ purged });
};
