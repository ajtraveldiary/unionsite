// Malayalam → Latin slugs for URLs (plan, section 3: "lowercase Latin, transliterated from the
// Malayalam title, editable by the admin"). Shared by the crawl importer (scripts/import-crawl.mjs)
// and the admin's post editor, so both make the same addresses. No imports: Node runs this too.

/** Old chillu sequences (consonant + virama + ZWJ) → atomic chillu letters, stray joiners out */
export const tidyMl = (s: string) => s.replace(/ണ്‍/g, 'ൺ').replace(/ന്‍/g, 'ൻ').replace(/ര്‍/g, 'ർ').replace(/ല്‍/g, 'ൽ').replace(/ള്‍/g, 'ൾ').replace(/ക്‍/g, 'ൿ').replace(/[‌‍]/g, '');

// Malayalam → readable Latin for slugs ("സെക്രട്ടറിയറ്റ് മാർച്ച്" → "sekrattariyatt-maarch")
const CONS: Record<string, string> = { 'ക': 'k', 'ഖ': 'kh', 'ഗ': 'g', 'ഘ': 'gh', 'ങ': 'ng', 'ച': 'ch', 'ഛ': 'chh', 'ജ': 'j', 'ഝ': 'jh', 'ഞ': 'nj', 'ട': 't', 'ഠ': 'th', 'ഡ': 'd', 'ഢ': 'dh', 'ണ': 'n', 'ത': 'th', 'ഥ': 'th', 'ദ': 'd', 'ധ': 'dh', 'ന': 'n', 'പ': 'p', 'ഫ': 'ph', 'ബ': 'b', 'ഭ': 'bh', 'മ': 'm', 'യ': 'y', 'ര': 'r', 'റ': 'r', 'ല': 'l', 'ള': 'l', 'ഴ': 'zh', 'വ': 'v', 'ശ': 'sh', 'ഷ': 'sh', 'സ': 's', 'ഹ': 'h' };
const VOW: Record<string, string> = { 'അ': 'a', 'ആ': 'aa', 'ഇ': 'i', 'ഈ': 'ee', 'ഉ': 'u', 'ഊ': 'oo', 'ഋ': 'ru', 'എ': 'e', 'ഏ': 'e', 'ഐ': 'ai', 'ഒ': 'o', 'ഓ': 'o', 'ഔ': 'au' };
const SIGN: Record<string, string> = { 'ാ': 'aa', 'ി': 'i', 'ീ': 'ee', 'ു': 'u', 'ൂ': 'oo', 'ൃ': 'ru', 'െ': 'e', 'േ': 'e', 'ൈ': 'ai', 'ൊ': 'o', 'ോ': 'o', 'ൌ': 'au', 'ൗ': 'au' };
const OTHER: Record<string, string> = { 'ം': 'm', 'ഃ': 'h', 'ൺ': 'n', 'ൻ': 'n', 'ർ': 'r', 'ൽ': 'l', 'ൾ': 'l', 'ൿ': 'k' };
// Clusters that read differently from their letters (ന്റ is "nt", റ്റ is "tt"), as stand-in consonants
const CLUSTERS: [RegExp, string, string][] = [[/ന്റ/g, '', 'nt'], [/റ്റ/g, '', 'tt'], [/ങ്ക/g, '', 'nk'], [/ഞ്ച/g, '', 'nch'], [/ച്ച/g, '', 'cch'], [/ത്ത/g, '', 'tth']];
for (const [, mark, latin] of CLUSTERS) CONS[mark] = latin;
export function translit(input: string) {
  const s = CLUSTERS.reduce((acc, [re, mark]) => acc.replace(re, mark), tidyMl(input));
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i], next = s[i + 1];
    if (CONS[c]) { out += CONS[c]; if (next === '്') { i++; } else if (!SIGN[next]) out += 'a'; continue; }
    out += VOW[c] ?? SIGN[c] ?? OTHER[c] ?? c;
  }
  return out;
}
/** Lowercase Latin slug: at most `words` words and 60 characters, cut between words */
export function slugify(s: string, words = 7) {
  let out = '';
  for (const w of translit(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').split('-').filter(Boolean).slice(0, words)) {
    if (out && out.length + w.length >= 60) break;
    out = out ? `${out}-${w}` : w;
  }
  return out;
}
