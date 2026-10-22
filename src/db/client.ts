// The D1 database through Drizzle. The binding is loaded on first use, so modules that import
// content.ts for its URL helpers (prerendered wireframes, the style guide) never touch D1.
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from './schema';

let db: DrizzleD1Database<typeof schema> | undefined;
let queries = 0;

/** Queries run since the worker started; the local cache test reads it (src/middleware.ts) */
export const queryCount = () => queries;

export async function getDb() {
  if (!db) {
    const { env } = await import('cloudflare:workers');
    const binding = env.DB;
    // Count every statement prepared, so a page served from the cache can be shown to read nothing
    const counted = new Proxy(binding, {
      get(target, prop) {
        if (prop === 'prepare') return (query: string) => (queries++, target.prepare(query));
        const value = Reflect.get(target, prop);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    db = drizzle(counted, { schema });
  }
  return db;
}
