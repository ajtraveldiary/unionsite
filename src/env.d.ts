interface ImportMetaEnv {
  /** True in builds made by `npm run preview:cached` (in-memory page cache, D1 query log) */
  readonly LOCAL_CACHE_TEST: boolean;
}

// The bindings in wrangler.jsonc. Only the parts of D1 the site calls are typed here: Cloudflare's
// full runtime types (`wrangler types`) replace the browser's DOM types, which page scripts need.
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(column?: string): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  raw<T = unknown[]>(): Promise<T[]>;
  run(): Promise<unknown>;
}
interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
}
declare module 'cloudflare:workers' {
  export const env: { DB: D1Database };
}
