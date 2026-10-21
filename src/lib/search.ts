// Shared search helpers. The site searches a static JSON index in the browser;
// Phase 4 moves the same normalisation into the D1 full-text search API.

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
function goNumbersIn(s: string): string[] {
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

/**
 * Short English words (up to 3 letters, like "da", "ta", "hra") must match a whole word, so
 * "da" doesn't find "day" or "update". Longer words and Malayalam match anywhere.
 */
function contains(text: string, word: string) {
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
    const expanded = [tok, ...(ALIASES[tok] ?? [])];
    if (expanded.some((x) => contains(hay, x))) matched++;
  }
  if (tokens.length) score += (matched / tokens.length) * 30 * (matched === tokens.length ? 1.5 : 0.6);
  if (score > 0 && doc.imp) score += 4;
  if (score > 0 && doc.k === 'order') score += 2;
  return score;
}

export function search(docs: SearchDoc[], q: string, limit = 30) {
  return docs
    .map((d) => ({ d, s: scoreDoc(d, q) }))
    .filter((x) => x.s >= 12)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.d);
}
