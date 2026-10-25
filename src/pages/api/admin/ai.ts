import type { APIRoute } from 'astro';
import { handle, userOf } from '~/lib/admin/api';
import { aiForBrowser } from '~/lib/admin/settings';

// GET /api/admin/ai → { enabled, model, glossary }: what the browser needs to draft English (src/lib/admin/translate.ts)
export const prerender = false;

export const GET: APIRoute = (ctx) => handle(async () => (userOf(ctx), aiForBrowser()));
