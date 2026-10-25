import type { APIRoute } from 'astro';

// Files in R2 (plan, section 4), served by the Worker until media.keralangounion.in is connected
// at launch. Keys never change (a replaced photo gets new keys), so browsers and Cloudflare keep
// them for a year. Range requests let a PDF reader open page 1 without the whole file.
export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  const key = params.key ?? '';
  if (!/^(images|pdfs)\/[\w./-]+$/.test(key) || key.includes('..')) return new Response('Not found', { status: 404 });
  const { env } = await import('cloudflare:workers');
  const range = request.headers.get('Range');
  const obj = await env.MEDIA.get(key, range ? { range: request.headers } : undefined);
  if (!obj) return new Response('Not found', { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('ETag', obj.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('Accept-Ranges', 'bytes');
  if (range && obj.range && 'offset' in obj.range) {
    const start = obj.range.offset ?? 0;
    const length = obj.range.length ?? obj.size - start;
    headers.set('Content-Range', `bytes ${start}-${start + length - 1}/${obj.size}`);
    headers.set('Content-Length', String(length));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set('Content-Length', String(obj.size));
  return new Response(obj.body, { headers });
};
