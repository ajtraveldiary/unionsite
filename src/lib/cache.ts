// Edge-cache rules for pages read from D1 (plan, section 4, "Caching and database reads"). A page
// is built from D1 on its first visit, then served from the cache until it expires or its tags are
// purged. Publishing purges by tag (`purgeTags` below), so the expiry is only a safety net: one
// hour for lists, whose "upcoming" events change with the clock, one day for single items.
import type { CacheOptions, InvalidateOptions } from 'astro';

const RULES = {
  list: { maxAge: 60 * 60, swr: 60 * 60 * 24 },
  item: { maxAge: 60 * 60 * 24, swr: 60 * 60 * 24 * 7 },
} satisfies Record<string, CacheOptions>;

/** Tags a page carries: what it shows, so a change purges exactly the pages that show it */
export const tags = {
  posts: 'posts',
  post: (id: number) => `post:${id}`,
  orders: 'orders',
  order: (id: number) => `order:${id}`,
  issues: 'issues',
  banner: 'banner',
};

interface HasCache {
  cache: { set(options: CacheOptions): void; invalidate(options: InvalidateOptions): Promise<void> };
}

export const cachePage = (ctx: HasCache, kind: keyof typeof RULES, pageTags: string[]) => ctx.cache.set({ ...RULES[kind], tags: pageTags });

/**
 * The tags to purge when something is published or edited: the item's own pages and every list
 * that shows it (home, News, district hubs, the indexes). The admin API calls this on save.
 */
export const purgeTags = {
  post: (id: number) => [tags.posts, tags.post(id)],
  order: (id: number) => [tags.orders, tags.order(id)],
  issue: () => [tags.issues],
  banner: () => [tags.banner],
};
