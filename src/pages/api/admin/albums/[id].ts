import type { APIRoute } from 'astro';
import { body, handle, idParam, userOf } from '~/lib/admin/api';
import { addPhotos } from '~/lib/admin/albums';

// POST /api/admin/albums/{id} { mediaIds, captions? }: photos just uploaded, added to the album's end
export const prerender = false;

export const POST: APIRoute = (ctx) =>
  handle(async () => {
    const b = await body(ctx);
    const ids = Array.isArray(b.mediaIds) ? b.mediaIds.map(Number) : [];
    const captions = b.captions && typeof b.captions === 'object' ? (b.captions as Record<string, string>) : {};
    await addPhotos(userOf(ctx), idParam(ctx), ids, captions);
  });
