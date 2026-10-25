// What every admin save shares, whatever it saves (posts, orders, events, Kerala Service): the
// error the API turns into a message, the search index (plan, section 11) and the edge cache
// (plan, section 4). Search rows are written straight on D1, as the seed script does: Drizzle
// can't batch raw SQL that has parameters.
import { getD1 } from '~/db/client';
import type { SearchEntry } from '~/lib/search-entries';

/** A problem the person can fix; the API replies with its message and status */
export class AdminError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export type SearchKind = 'news' | 'order' | 'event';

/**
 * Rewrites an item's search row and index entry, or removes them (`entry` null) when it's off the
 * site. By the time this runs the item itself is saved, so a failure is logged rather than failing
 * the save; the item's next save writes its entry again.
 */
export async function setSearch(kind: SearchKind, ref: number, entry: SearchEntry | null) {
  try {
    const d1 = await getD1();
    const drop = [
      d1.prepare('DELETE FROM search_fts WHERE rowid IN (SELECT id FROM search_docs WHERE kind = ? AND ref = ?)').bind(kind, ref),
      d1.prepare('DELETE FROM search_docs WHERE kind = ? AND ref = ?').bind(kind, ref),
    ];
    if (!entry) return void (await d1.batch(drop));
    const d = entry.doc;
    await d1.batch([
      ...drop,
      d1.prepare('INSERT INTO search_docs (kind, ref, ml, en, sub, url, kw, important, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(kind, ref, d.ml, d.en ?? null, d.sub ?? null, d.url, d.kw ?? null, d.imp ? 1 : 0, entry.date),
      d1.prepare('INSERT INTO search_fts (rowid, title, kw, body) SELECT id, ?, ?, ? FROM search_docs WHERE kind = ? AND ref = ?')
        .bind(entry.title, entry.kw, entry.body, kind, ref),
    ]);
  } catch (err) {
    console.error(`Search entry for ${kind} ${ref} not updated`, err);
  }
}

/** Purges the cached pages that show what changed (plan, section 4). `astro dev` caches nothing, so it may no-op. */
export async function purge(tagList: string[]) {
  try {
    const { cache } = await import('cloudflare:workers');
    if (cache?.purge) await cache.purge({ tags: tagList });
  } catch (err) {
    if (!import.meta.env.DEV) console.error('Cache purge failed', tagList, err);
  }
}

/** Now in the form SQLite's datetime('now') stores (UTC), optionally some seconds ahead */
export const sqlNow = (aheadSeconds = 0) => new Date(Date.now() + aheadSeconds * 1000).toISOString().replace('T', ' ').slice(0, 19);
/** Today's date in India */
export const todayIst = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
