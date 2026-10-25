import type { APIRoute } from 'astro';
import { record } from '~/lib/analytics';

// POST /api/e: the analytics beacon (src/lib/analytics.ts). Always answers 204, whatever it keeps.
export const prerender = false;

export const POST: APIRoute = async ({ request, url }) => {
  if (request.headers.get('Origin') && request.headers.get('Origin') !== url.origin) return new Response(null, { status: 204 });
  try {
    const text = await request.text();
    if (text.length < 2000) await record(request, JSON.parse(text));
  } catch { /* a malformed beacon is simply dropped */ }
  return new Response(null, { status: 204 });
};
