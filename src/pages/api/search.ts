import type { APIRoute } from 'astro';
import { searchSite } from '~/lib/search-db';
import { cachePage, tags } from '~/lib/cache';

// Site search (?q=): orders, news, districts, events and pages, best first, for the Search page.
// Replaces /search-index.json, which sent everything to the browser. Paths are Malayalam; the
// English page adds /en. Cached at the edge per query, so a popular search reads D1 once.
export const prerender = false;

export const GET: APIRoute = async (context) => {
  const q = (context.url.searchParams.get('q') ?? '').slice(0, 100);
  const docs = await searchSite(q);
  cachePage(context, 'list', [tags.posts, tags.orders, tags.events]);
  return Response.json(docs);
};
