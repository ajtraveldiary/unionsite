// Shared search helpers. The prototype searches a static JSON index in the browser;
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

const ALIASES: Record<string, string> = {
  da: 'ക്ഷാമബത്ത dearness allowance',
  'ക്ഷാമബത്ത': 'da dearness',
  dr: 'dearness relief ക്ഷാമാശ്വാസം',
  pension: 'പെൻഷൻ',
  'പെൻഷൻ': 'pension',
  leave: 'അവധി',
  nps: 'പങ്കാളിത്ത പെൻഷൻ contributory',
  bonus: 'ബോണസ്',
  hra: 'house rent allowance വീട്ടുവാടക',
  'pay revision': 'ശമ്പള പരിഷ്കരണം',
};

export function scoreDoc(doc: SearchDoc, q: string): number {
  const query = normalise(q);
  if (!query) return 0;
  const hay = normalise(`${doc.ml} ${doc.en ?? ''} ${doc.kw ?? ''} ${doc.sub ?? ''}`);
  const title = normalise(`${doc.ml} ${doc.en ?? ''}`);
  let score = 0;

  const go = goCore(q);
  if (go && doc.kw?.includes(go)) score += 100;

  if (title.startsWith(query)) score += 40;
  if (title.includes(query)) score += 25;
  else if (hay.includes(query)) score += 15;

  const tokens = query.split(' ').filter(Boolean);
  let matched = 0;
  for (const tok of tokens) {
    const expanded = [tok, ...(ALIASES[tok]?.split(' ') ?? [])];
    if (expanded.some((x) => hay.includes(x))) matched++;
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
