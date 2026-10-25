// The D1 database through Drizzle. The binding is loaded on first use, so modules that import
// content.ts for its URL helpers (prerendered wireframes, the style guide) never touch D1.
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from './schema';

let db: DrizzleD1Database<typeof schema> | undefined;
let raw: D1Database | undefined;
let queries = 0;

/** Queries run since the worker started; the local cache test reads it (src/middleware.ts) */
export const queryCount = () => queries;

export async function getDb() {
  if (!db) db = drizzle(await getD1(), { schema });
  return db;
}

/** The D1 binding itself, for the few statements Drizzle can't batch (raw SQL with parameters, FTS5) */
export async function getD1() {
  if (!raw) {
    const { env } = await import('cloudflare:workers');
    // Count every statement prepared, so a page served from the cache can be shown to read nothing
    raw = new Proxy(env.DB, {
      get(target, prop) {
        if (prop === 'prepare') return (query: string) => (queries++, target.prepare(query));
        const value = Reflect.get(target, prop);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }
  return raw;
}
