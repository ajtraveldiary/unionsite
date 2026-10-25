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
/** R2 (plan, section 4): uploaded photos and PDFs. Only what the site calls is typed. */
interface R2Range { offset?: number; length?: number; suffix?: number }
interface R2Object {
  key: string;
  size: number;
  httpEtag: string;
  range?: R2Range;
  writeHttpMetadata(headers: Headers): void;
}
interface R2ObjectBody extends R2Object { body: ReadableStream }
interface R2Bucket {
  get(key: string, options?: { range?: R2Range | Headers }): Promise<R2ObjectBody | null>;
  head(key: string): Promise<R2Object | null>;
  put(key: string, value: ArrayBuffer | ReadableStream | Blob | string, options?: { httpMetadata?: { contentType?: string; cacheControl?: string } }): Promise<R2Object | null>;
  delete(keys: string | string[]): Promise<void>;
}
declare module 'cloudflare:workers' {
  export const env: {
    DB: D1Database;
    MEDIA: R2Bucket;
    /** Cloudflare Access (plan, section 10): the team domain (e.g. union.cloudflareaccess.com) and the
     * admin application's audience tag. When both are set, admin requests need a valid Access token. */
    ACCESS_TEAM_DOMAIN?: string;
    ACCESS_AUD?: string;
    /** "1" allows the stand-in login at /admin/login outside `astro dev` (a preview without Access) */
    ADMIN_DEV_LOGIN?: string;
    /** The first super admin: this email is let in (and added) while the users table is empty */
    ADMIN_BOOTSTRAP_EMAIL?: string;
  };
  export const cache: { purge(options: { tags: string[] }): Promise<void> };
}

declare namespace App {
  interface Locals {
    /** The signed-in admin, set by src/middleware.ts on /admin and /api/admin */
    user?: import('./lib/admin/roles').AdminUser;
  }
}
