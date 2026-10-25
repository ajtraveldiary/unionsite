import type { APIRoute } from 'astro';
import { body, handle, userOf } from '~/lib/admin/api';
import { createPost } from '~/lib/admin/posts';

// POST /api/admin/posts  { doc } → { id }: a new post, from the editor's first save
export const prerender = false;

export const POST: APIRoute = (ctx) => handle(async () => ({ id: await createPost(userOf(ctx), (await body(ctx)).doc) }));
