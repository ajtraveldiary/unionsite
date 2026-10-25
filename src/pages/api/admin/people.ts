import type { APIRoute } from 'astro';
import { handle, userOf } from '~/lib/admin/api';
import { findPeople } from '~/lib/admin/people';

// GET /api/admin/people?q= → { people }: people already on the site, to reuse in a committee
export const prerender = false;

export const GET: APIRoute = (ctx) =>
  handle(async () => {
    userOf(ctx);
    return { people: await findPeople(ctx.url.searchParams.get('q') ?? '') };
  });
