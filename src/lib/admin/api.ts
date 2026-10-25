// Shared by the admin API routes: the signed-in user (the middleware has already refused anyone
// else), the JSON body, and turning an AdminError into a JSON reply with its message.
import type { APIContext } from 'astro';
import { AdminError } from './publish';
import type { AdminUser } from './roles';

export const userOf = (ctx: APIContext): AdminUser => {
  if (!ctx.locals.user) throw new AdminError('You are signed out.', 401);
  return ctx.locals.user;
};

export async function body(ctx: APIContext): Promise<Record<string, unknown>> {
  try {
    const v = await ctx.request.json();
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    throw new AdminError('The request could not be read.');
  }
}

/** Runs an API handler; known problems become { error } with their status, anything else a 500 */
export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    return Response.json((await fn()) ?? { ok: true });
  } catch (err) {
    if (err instanceof AdminError) return Response.json({ error: err.message }, { status: err.status });
    console.error(err);
    return Response.json({ error: 'Something went wrong on the server. Nothing was lost on your screen; try again.' }, { status: 500 });
  }
}

export const idParam = (ctx: APIContext) => {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new AdminError('Not found.', 404);
  return id;
};
