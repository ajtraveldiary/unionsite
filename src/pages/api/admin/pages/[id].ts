import type { APIRoute } from 'astro';
import { body, handle, idParam, userOf } from '~/lib/admin/api';
import { savePage, type PageAction } from '~/lib/admin/pages';
import { AdminError } from '~/lib/admin/publish';

// POST /api/admin/pages/{id} { action: save · publish · unpublish · approve_english, page } → { status, enSource }
export const prerender = false;

export const POST: APIRoute = (ctx) =>
  handle(async () => {
    const b = await body(ctx);
    const action = (['save', 'publish', 'unpublish', 'approve_english'] as const).find((a) => a === b.action);
    if (!action) throw new AdminError('Unknown action.');
    const page = b.page && typeof b.page === 'object' ? (b.page as Record<string, unknown>) : {};
    return savePage(userOf(ctx), idParam(ctx), page, action as PageAction);
  });
