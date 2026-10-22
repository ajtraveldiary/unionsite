// Shared search helpers: normalising text, GO numbers, other names and spellings of a word, and
// scoring. The search API (src/lib/search-db.ts) runs them on D1's full-text index; the Orders
// page runs scoreDoc on the orders already in the page. No imports, so the seed script can use it.

export type SearchKind = 'order' | 'news' | 'district' | 'page' | 'event';

export interface SearchDoc {
  k: SearchKind;
  /** Title in Malayalam and English */
  ml: string;
  en?: string;
  /** Secondary line (GO number, date, district …) */
  sub?: string;
  /** Malayalam path; English path is /en + this */
  url: string;
  /** Extra matching text: GO number forms, subject names, keywords */
  kw?: string;
  /** Pinned/important */
  imp?: boolean;
}

/**
 * GO numbers are written many ways: "81/2014", "GO(P) 81/2014/Fin", "G.O.(P) No.81/2014/Fin".
 * Reduce them all to "81/2014" so any form finds the order.
 */
export function goCore(s: string): string | null {
  const m = s.match(/(\d{1,5})\s*\/\s*(\d{4})/);
  return m ? `${Number(m[1])}/${m[2]}` : null;
}

/** Every GO number in a text, each reduced by goCore ("112/2026" and "12/2026" stay apart). */
export function goNumbersIn(s: string): string[] {
  return [...s.matchAll(/(?<!\d)(\d{1,5})\s*\/\s*(\d{4})(?!\d)/g)].map((m) => `${Number(m[1])}/${m[2]}`);
}

export function normalise(s: string) {
  return s
    .toLowerCase()
    .normalize('NFC')
    // Old chillu sequences (consonant + virama + ZWJ) → atomic chillu letters
    .replace(/ണ്‍/g, 'ൺ').replace(/ന്‍/g, 'ൻ').replace(/ര്‍/g, 'ർ').replace(/ല്‍/g, 'ൽ').replace(/ള്‍/g, 'ൾ')
    .replace(/[‌‍]/g, '')
    .replace(/g\.?\s*o\.?\s*\((p|rt|ms)\)/g, 'go$1')
    .replace(/[.,:;!?'"“”‘’()\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Other names for a word; each entry matches as a whole phrase ("dearness allowance", not "allowance")
const ALIASES: Record<string, string[]> = {
  da: ['ക്ഷാമബത്ത', 'dearness allowance'],
  'ക്ഷാമബത്ത': ['da', 'dearness allowance'],
  dr: ['dearness relief', 'ക്ഷാമാശ്വാസം'],
  pension: ['പെൻഷൻ'],
  'പെൻഷൻ': ['pension'],
  leave: ['അവധി'],
  nps: ['പങ്കാളിത്ത പെൻഷൻ', 'contributory'],
  bonus: ['ബോണസ്'],
  hra: ['house rent allowance', 'വീട്ടുവാടക'],
  'pay revision': ['ശമ്പള പരിഷ്കരണം'],
};

// Spellings of the same word found in the crawled posts. Each group lists interchangeable stems
// (without the final virama, so inflected forms match too); a search for one finds all.
const VARIANTS: string[][] = [
  ['സെക്രട്ടറിയേറ്റ', 'സെക്രട്ടേറിയറ്റ', 'സെക്രട്ടറിയറ്റ'],
  ['അദ്ധ്യാപക', 'അധ്യാപക'],
  ['കുടിശ്ശിക', 'കുടിശിക'],
];

/** A normalised word with its other names and spellings */
export function expandTerm(word: string): string[] {
  const out = new Set([word, ...(ALIASES[word] ?? [])]);
  for (const group of VARIANTS) {
    const stem = group.find((s) => word.includes(s));
    if (stem) group.forEach((other) => out.add(word.replace(stem, other)));
  }
  return [...out];
}

/** Words that need a whole-word check: short English ones ("da", "nps"), see contains() */
export const isShortWord = (word: string) => /^[a-z0-9]{1,3}$/.test(word);

/**
 * Short English words (up to 3 letters, like "da", "ta", "hra") must match a whole word, so
 * "da" doesn't find "day" or "update". Longer words and Malayalam match anywhere.
 */
export function contains(text: string, word: string) {
  if (!/^[a-z0-9]{1,3}$/.test(word)) return text.includes(word);
  return new RegExp(`(?:^|[^a-z0-9])${word}(?:[^a-z0-9]|$)`).test(text);
}

export function scoreDoc(doc: SearchDoc, q: string): number {
  const query = normalise(q);
  if (!query) return 0;
  const hay = normalise(`${doc.ml} ${doc.en ?? ''} ${doc.kw ?? ''} ${doc.sub ?? ''}`);
  const title = normalise(`${doc.ml} ${doc.en ?? ''}`);
  let score = 0;

  // A GO number in the query asks for that order only: "12/2026" must not find 112/2026
  const go = goCore(q);
  if (go) {
    if (!goNumbersIn(`${doc.kw ?? ''} ${doc.sub ?? ''} ${doc.ml} ${doc.en ?? ''}`).includes(go)) return 0;
    score += 100;
  }

  if (title.startsWith(query) && contains(title, query)) score += 40;
  if (contains(title, query)) score += 25;
  else if (contains(hay, query)) score += 15;

  const tokens = query.split(' ').filter(Boolean);
  let matched = 0;
  for (const tok of tokens) {
    if (expandTerm(tok).some((x) => contains(hay, x))) matched++;
  }
  if (tokens.length) score += (matched / tokens.length) * 30 * (matched === tokens.length ? 1.5 : 0.6);
  if (score > 0 && doc.imp) score += 4;
  if (score > 0 && doc.k === 'order') score += 2;
  return score;
}

/**
 * The FTS5 queries for a search, for D1's trigram index (plan, section 11).
 * - `match`: every word, in any of its other names or spellings, anywhere (body included). A
 *   phrase with other names ("pay revision") also matches as the phrase or its other names.
 * - `any`: for searches of more than one word, any word, in titles and keywords only; these
 *   partial matches rank below full ones, as in the old browser search.
 * - `check`: short English words ("da", "nps") and words under 3 characters, which results
 *   must hold as whole words, since the index matches inside words too.
 * A GO number asks for that number only. `match` is undefined when no word can use the index.
 */
export function ftsQuery(q: string): { match?: string; any?: string; check: string[]; go: string | null } {
  const go = goCore(q);
  const quote = (t: string) => `"${t.replace(/"/g, '""')}"`;
  const anyOf = (terms: string[]) => `(${terms.map(quote).join(' OR ')})`;
  if (go) return { match: quote(go), check: [], go };
  const query = normalise(q);
  const groups: string[] = [];
  const check: string[] = [];
  for (const word of query.split(' ').filter(Boolean)) {
    const terms = expandTerm(word).filter((t) => [...t].length >= 3);
    if (terms.length) groups.push(anyOf(terms));
    if (isShortWord(word) || !terms.length) check.push(word);
  }
  let match = groups.length ? groups.join(' AND ') : undefined;
  const phrase = ALIASES[query] ? anyOf([query, ...ALIASES[query]]) : undefined;
  if (phrase) match = match ? `${phrase} OR (${match})` : phrase;
  const any = groups.length > 1 ? `{title kw} : (${groups.join(' OR ')})` : undefined;
  return { match, any, check: phrase ? [] : check, go: null };
}
