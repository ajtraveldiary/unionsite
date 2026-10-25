import type { APIRoute } from 'astro';
import { ContactError, saveMessage } from '~/lib/contact';

// POST /api/contact: the Contact page's message, saved for the admin's Inbox (src/lib/contact.ts)
export const prerender = false;

export const POST: APIRoute = async ({ request, url }) => {
  if (request.headers.get('Origin') !== url.origin) return Response.json({ error: 'This message did not come from the Contact page.' }, { status: 403 });
  try {
    await saveMessage(request, (await request.json()) as Record<string, unknown>);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof ContactError) return Response.json({ error: err.message }, { status: err.status });
    console.error(err);
    return Response.json({ error: 'The message could not be sent. Please try again, or phone the office.' }, { status: 500 });
  }
};
