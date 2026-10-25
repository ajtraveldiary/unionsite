// How the old WordPress site's categories map onto the new site (plan, section 3): 56 categories
// become a district and about 8 topics; office-bearer and committee pages are district data, not
// news; posts without a topic category get one from words in their title. Shared by the crawl
// importer (scripts/import-crawl.mjs) and the admin's WordPress import, so both map the same way.
// Relative imports with .ts endings: Node runs this file too.
import { tidyMl } from './slug.ts';

/** A category name as the maps below spell it */
export const norm = (c: string) => tidyMl(c).toUpperCase().replace(/\s+GALLERY$/, '').replace(/[’']/g, "'").trim();
export const DISTRICT: Record<string, string> = {
  'TVM NORTH': 'tvm-north', 'TVM NORTH COMMITTEE': 'tvm-north', 'THIRUVANANTHAPURAM NORTH': 'tvm-north', 'TVM SOUTH': 'tvm-south', 'THIRUVANANTHAPURAM SOUTH': 'tvm-south',
  KOLLAM: 'kollam', PATHANAMTHITTA: 'pathanamthitta', ALAPPUZHA: 'alappuzha', KOTTAYAM: 'kottayam', 'കോട്ടയം': 'kottayam', IDUKKI: 'idukki', ERNAKULAM: 'ernakulam',
  THRISSUR: 'thrissur', PALAKKAD: 'palakkad', MALAPPURAM: 'malappuram', KOZHIKODE: 'kozhikode', WAYANAD: 'wayanad', KANNUR: 'kannur', 'കണ്ണൂർ': 'kannur', KASARAGOD: 'kasaragod',
};
export const TOPIC: Record<string, string> = {
  'FSETO NEWS': 'fseto', "SECRETARY'S PAGE": 'secretary', 'JANAPAKSHA CIVIL SERVICE': 'janapaksha', 'VOLUNTARY ACTIVITIES': 'social-work', 'SOCIAL ACTIVITIES': 'social-work',
  SPORTS: 'arts-sports', 'NGO UNION CONFERENCES': 'organisation', 'NGO UNION DISTRICT CONFERENCE': 'organisation', 'DISTRICT CONFERENCE': 'organisation', 'ജില്ലാ സമ്മേളനം': 'organisation',
};
// Office-bearer lists and committee pages: district data, not news (kept for the district hubs later)
export const NOT_NEWS = new Set(['DISTRICT MEMBERS', 'DISTRICT COMMITTEE', 'TVM NORTH COMMITTEE', 'WAYANAD LEADERS', 'DISTRICT HISTORY', 'DISTRICT ADDRESSES']);
// Topic from the title when no category says it
export const KEYWORDS: [string, RegExp][] = [
  ['struggles', /പ്രതിഷേധ|സമര|മാർച്ച്|ധർണ|പണിമുടക്ക|പ്രകടന|ഉപരോധ|വളയൽ|പ്രക്ഷോഭ|strike|protest|dharna|march/i],
  ['seminars', /സെമിനാർ|സെമിനാര|പ്രഭാഷണ|സിമ്പോസിയ|seminar|lecture/i],
  ['arts-sports', /കായിക|കലാ|ചെസ്സ്|ചെസ്|കാരംസ്|ക്രിക്കറ്റ്|ഫുട്ബോൾ|ഷട്ടിൽ|ഓണാഘോഷ|ഓണം|sports|chess|cricket|football/i],
  ['social-work', /രക്തദാന|ദുരിതാശ്വാസ|കിറ്റ്|ശുചീകരണ|പ്രളയ|ലഹരി|വൃക്ഷ|ചികിത്സാ|സഹായ|blood|relief|flood/i],
];

/** A post's district, topic and whether it is news, from its old categories and title */
export function mapPost(categories: string[], title: string): { district: string | null; topic: string; news: boolean } {
  const cats = categories.map(norm);
  return {
    district: cats.map((c) => DISTRICT[c]).find(Boolean) ?? null,
    topic: cats.map((c) => TOPIC[c]).find(Boolean) ?? KEYWORDS.find(([, re]) => re.test(title))?.[0] ?? 'organisation',
    news: !(cats.some((c) => NOT_NEWS.has(c)) || /ഗാലറി$/.test(title) || /\scopy$/i.test(title)),
  };
}

// ── Text from WordPress HTML ──────────────────────────────────────────────────────────────
const entities = (s: string) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' } as Record<string, string>)[e]);
/** Plain text: entities decoded, Malayalam tidied, spaces folded */
export const cleanText = (s: string) => tidyMl(entities(s)).replace(/\s+/g, ' ').trim();
/** A post's HTML as a list of paragraphs (the crawled body format); photos and scripts left out */
export const htmlParagraphs = (html: string) => html
  .replace(/<(script|style|figure|figcaption)[\s\S]*?<\/\1>/g, '')
  .split(/<\/p>|<br\s*\/?>|<\/h\d>|<\/li>|<\/div>/i)
  .map((p) => cleanText(p.replace(/<[^>]+>/g, ' ')))
  .filter((p) => p && !/^(&nbsp;|\.|-)+$/.test(p));
/** Shortened at a word, with an ellipsis */
export const cutText = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, s.lastIndexOf(' ', n) > n * 0.6 ? s.lastIndexOf(' ', n) : n)}…`);
