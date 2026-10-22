// Search on D1 (plan, section 11). The FTS5 trigram index finds candidates, best first by bm25 with
// the title weighted highest; scoreDoc() then ranks them the way the browser search did, so
// title and keyword matches come before matches only in an article's text. Districts, events and
// the fixed pages are searched in memory. Every query is normalised the same way as the index.
import { sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import { getDb } from '~/db/client';
import { contains, expandTerm, ftsQuery, goNumbersIn, normalise, scoreDoc, type SearchDoc } from './search';
import { staticDocs } from './search-entries';

/** Most candidates read from the index for one search; results shown are capped lower */
const CANDIDATES = 400;
/** Score given to a match found only in an article's text, below any title or keyword match */
const BODY_ONLY = 8;

interface Row { kind: 'news' | 'order'; ml: string; en: string | null; sub: string | null; url: string; kw: string | null; important: number }

const toDoc = (r: Row): SearchDoc => ({
  k: r.kind,
  ml: r.ml,
  ...(r.en && { en: r.en }),
  ...(r.sub && { sub: r.sub }),
  url: r.url,
  ...(r.kw && { kw: r.kw }),
  ...(r.important && { imp: true }),
});

/** Whether a result holds every word in `check` (or another name for it) in its title or keywords */
const passesCheck = (doc: SearchDoc, check: string[]) => {
  const hay = normalise(`${doc.ml} ${doc.en ?? ''} ${doc.kw ?? ''} ${doc.sub ?? ''}`);
  return check.every((w) => expandTerm(w).some((x) => contains(hay, x)));
};

/**
 * The SQL that picks matching search rows, for one kind or all. With no word the index can use
 * (a search under 3 characters), it falls back to scanning titles and keywords.
 */
function matchClause(q: string, kind?: 'news' | 'order') {
  const { match, check } = ftsQuery(q);
  const onlyKind = kind ? sql`AND d.kind = ${kind}` : sql``;
  if (match) return { where: sql`search_fts MATCH ${match} ${onlyKind}`, check, ranked: true };
  const likes = check.map((w) => sql`(search_fts.title LIKE ${`%${w}%`} OR search_fts.kw LIKE ${`%${w}%`})`);
  return { where: sql`${sql.join(likes, sql` AND `)} ${onlyKind}`, check, ranked: false };
}

const candidates = async (where: SQL, ranked: boolean) => {
  const db = await getDb();
  const rows = await db.all<Row>(sql`
    SELECT d.kind, d.ml, d.en, d.sub, d.url, d.kw, d.important
    FROM search_fts JOIN search_docs d ON d.id = search_fts.rowid
    WHERE ${where}
    ORDER BY ${ranked ? sql`bm25(search_fts, 10.0, 4.0, 1.0),` : sql``} d.date DESC
    LIMIT ${CANDIDATES}`);
  return rows.map(toDoc);
};

/** Site search: orders and news from D1, plus districts, events and pages, best first */
export async function searchSite(q: string, limit = 200): Promise<SearchDoc[]> {
  if (!normalise(q)) return [];
  const { where, check, ranked } = matchClause(q);
  const { any, go } = ftsQuery(q);
  const [full, partial] = await Promise.all([candidates(where, ranked), any ? candidates(sql`search_fts MATCH ${any}`, true) : []]);

  const keep = (d: SearchDoc) =>
    (!check.length || passesCheck(d, check))
    // A GO number asks for that number exactly: the index also finds 112/2026 for 12/2026
    && (!go || goNumbersIn(`${d.kw ?? ''} ${d.sub ?? ''} ${d.ml} ${d.en ?? ''}`).includes(go));
  // Every word matched: a weak title score means the words are in the article's text
  const scored = full.filter(keep).map((d) => {
    const s = scoreDoc(d, q);
    return { d, s: ranked && s < 12 ? BODY_ONLY : s };
  });
  // Some words matched, in a title or keywords: kept when they score as the old search required
  const seen = new Set(full.map((d) => d.url));
  const partly = partial.filter((d) => !seen.has(d.url) && keep(d)).map((d) => ({ d, s: scoreDoc(d, q) }));
  const others = staticDocs().map((d) => ({ d, s: scoreDoc(d, q) }));
  // A stable sort keeps the index's order (bm25, then newest) among equal scores
  return [...scored.filter((x) => x.s >= (ranked ? BODY_ONLY : 12)), ...partly.filter((x) => x.s >= 12), ...others.filter((x) => x.s >= 12)]
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.d);
}

/**
 * Posts matching a news search, as a condition on posts.id, for the News page's filters. The list
 * stays newest first, and short words match anywhere in a word here (no whole-word check), as
 * the News page's own search always did.
 */
export function newsMatching(q: string, postId: SQLWrapper) {
  const { where } = matchClause(q, 'news');
  return sql`${postId} IN (SELECT d.ref FROM search_fts JOIN search_docs d ON d.id = search_fts.rowid WHERE ${where})`;
}
