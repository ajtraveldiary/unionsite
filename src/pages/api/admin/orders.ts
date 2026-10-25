import type { APIRoute } from 'astro';
import { body, handle, userOf } from '~/lib/admin/api';
import { createOrder, findDuplicates } from '~/lib/admin/orders';
import { AdminError } from '~/lib/admin/publish';

// The Upload orders screen's calls (src/lib/admin/orders.ts has the rules; state roles only):
//   POST /api/admin/orders { action: 'check', goNumber, pdfMediaId } → { duplicates }
//   POST /api/admin/orders { action: 'create', order, publish }      → { id }
export const prerender = false;

export const POST: APIRoute = (ctx) =>
  handle(async () => {
    const user = userOf(ctx);
    const b = await body(ctx);
    if (b.action === 'check') return { duplicates: await findDuplicates(user, String(b.goNumber ?? ''), Number(b.pdfMediaId) || null) };
    if (b.action === 'create') {
      const order = b.order && typeof b.order === 'object' ? (b.order as Record<string, unknown>) : {};
      return { id: await createOrder(user, order, b.publish === true) };
    }
    throw new AdminError('Unknown action.');
  });
