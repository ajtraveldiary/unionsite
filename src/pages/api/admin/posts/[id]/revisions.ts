import type { APIRoute } from 'astro';
import { handle, idParam, userOf } from '~/lib/admin/api';
import { postRevisions } from '~/lib/admin/posts';

// GET /api/admin/posts/{id}/revisions → { revisions }: the editor's History list
export const prerender = false;

export const GET: APIRoute = (ctx) => handle(async () => ({ revisions: await postRevisions(userOf(ctx), idParam(ctx)) }));
