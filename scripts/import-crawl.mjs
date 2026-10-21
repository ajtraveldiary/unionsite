// Turns the crawl (scripts/.cache/raw.json, from scripts/crawl.mjs) into the preview's data:
//   src/data/live/posts.json   news posts: topic + district from the old categories (plan, section 3)
//   src/data/live/orders.json  GO orders: group + subject from the old download categories
//   src/data/live/issues.json  Kerala Service issues: month, PDF and cover
// New URLs follow the plan's rules (section 3): lowercase Latin slugs transliterated from the
// Malayalam title, the old WordPress address kept as `legacyUrl` for redirects.
// Run: node scripts/import-crawl.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const raw = JSON.parse(readFileSync(new URL('./.cache/raw.json', import.meta.url), 'utf8'));
const OUT = new URL('../src/data/live/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const report = [];
const note = (s) => { report.push(s); console.log(s); };

// ── Text helpers ──────────────────────────────────────────────────────────────────────────
const entities = (s) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[e]);
/** Old chillu sequences (consonant + virama + ZWJ) → atomic chillu letters, stray joiners out */
const tidyMl = (s) => s.replace(/ണ്‍/g, 'ൺ').replace(/ന്‍/g, 'ൻ').replace(/ര്‍/g, 'ർ').replace(/ല്‍/g, 'ൽ').replace(/ള്‍/g, 'ൾ').replace(/ക്‍/g, 'ൿ').replace(/[‌‍]/g, '');
const clean = (s) => tidyMl(entities(s)).replace(/\s+/g, ' ').trim();
const paragraphs = (html) => html
  .replace(/<(script|style|figure|figcaption)[\s\S]*?<\/\1>/g, '')
  .split(/<\/p>|<br\s*\/?>|<\/h\d>|<\/li>|<\/div>/i)
  .map((p) => clean(p.replace(/<[^>]+>/g, ' ')))
  .filter((p) => p && !/^(&nbsp;|\.|-)+$/.test(p));
const cut = (s, n) => (s.length <= n ? s : `${s.slice(0, s.lastIndexOf(' ', n) > n * 0.6 ? s.lastIndexOf(' ', n) : n)}…`);
const istDate = (iso) => new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 10);

// Malayalam → readable Latin for slugs ("സെക്രട്ടറിയറ്റ് മാർച്ച്" → "sekrattariyatt-maarch")
const CONS = { 'ക': 'k', 'ഖ': 'kh', 'ഗ': 'g', 'ഘ': 'gh', 'ങ': 'ng', 'ച': 'ch', 'ഛ': 'chh', 'ജ': 'j', 'ഝ': 'jh', 'ഞ': 'nj', 'ട': 't', 'ഠ': 'th', 'ഡ': 'd', 'ഢ': 'dh', 'ണ': 'n', 'ത': 'th', 'ഥ': 'th', 'ദ': 'd', 'ധ': 'dh', 'ന': 'n', 'പ': 'p', 'ഫ': 'ph', 'ബ': 'b', 'ഭ': 'bh', 'മ': 'm', 'യ': 'y', 'ര': 'r', 'റ': 'r', 'ല': 'l', 'ള': 'l', 'ഴ': 'zh', 'വ': 'v', 'ശ': 'sh', 'ഷ': 'sh', 'സ': 's', 'ഹ': 'h' };
const VOW = { 'അ': 'a', 'ആ': 'aa', 'ഇ': 'i', 'ഈ': 'ee', 'ഉ': 'u', 'ഊ': 'oo', 'ഋ': 'ru', 'എ': 'e', 'ഏ': 'e', 'ഐ': 'ai', 'ഒ': 'o', 'ഓ': 'o', 'ഔ': 'au' };
const SIGN = { 'ാ': 'aa', 'ി': 'i', 'ീ': 'ee', 'ു': 'u', 'ൂ': 'oo', 'ൃ': 'ru', 'െ': 'e', 'േ': 'e', 'ൈ': 'ai', 'ൊ': 'o', 'ോ': 'o', 'ൌ': 'au', 'ൗ': 'au' };
const OTHER = { 'ം': 'm', 'ഃ': 'h', 'ൺ': 'n', 'ൻ': 'n', 'ർ': 'r', 'ൽ': 'l', 'ൾ': 'l', 'ൿ': 'k' };
// Clusters that read differently from their letters (ന്റ is "nt", റ്റ is "tt"), as stand-in consonants
const CLUSTERS = [[/ന്റ/g, '', 'nt'], [/റ്റ/g, '', 'tt'], [/ങ്ക/g, '', 'nk'], [/ഞ്ച/g, '', 'nch'], [/ച്ച/g, '', 'cch'], [/ത്ത/g, '', 'tth']];
for (const [, mark, latin] of CLUSTERS) CONS[mark] = latin;
function translit(input) {
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
function slugify(s, words = 7) {
  let out = '';
  for (const w of translit(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').split('-').filter(Boolean).slice(0, words)) {
    if (out && out.length + w.length >= 60) break;
    out = out ? `${out}-${w}` : w;
  }
  return out;
}

// ── News posts ────────────────────────────────────────────────────────────────────────────
const norm = (c) => tidyMl(c).toUpperCase().replace(/\s+GALLERY$/, '').replace(/[’']/g, "'").trim();
const DISTRICT = {
  'TVM NORTH': 'tvm-north', 'TVM NORTH COMMITTEE': 'tvm-north', 'THIRUVANANTHAPURAM NORTH': 'tvm-north', 'TVM SOUTH': 'tvm-south', 'THIRUVANANTHAPURAM SOUTH': 'tvm-south',
  KOLLAM: 'kollam', PATHANAMTHITTA: 'pathanamthitta', ALAPPUZHA: 'alappuzha', KOTTAYAM: 'kottayam', 'കോട്ടയം': 'kottayam', IDUKKI: 'idukki', ERNAKULAM: 'ernakulam',
  THRISSUR: 'thrissur', PALAKKAD: 'palakkad', MALAPPURAM: 'malappuram', KOZHIKODE: 'kozhikode', WAYANAD: 'wayanad', KANNUR: 'kannur', 'കണ്ണൂർ': 'kannur', KASARAGOD: 'kasaragod',
};
const TOPIC = {
  'FSETO NEWS': 'fseto', "SECRETARY'S PAGE": 'secretary', 'JANAPAKSHA CIVIL SERVICE': 'janapaksha', 'VOLUNTARY ACTIVITIES': 'social-work', 'SOCIAL ACTIVITIES': 'social-work',
  SPORTS: 'arts-sports', 'NGO UNION CONFERENCES': 'organisation', 'NGO UNION DISTRICT CONFERENCE': 'organisation', 'DISTRICT CONFERENCE': 'organisation', 'ജില്ലാ സമ്മേളനം': 'organisation',
};
// Office-bearer lists and committee pages: district data, not news (kept for the district hubs later)
const NOT_NEWS = new Set(['DISTRICT MEMBERS', 'DISTRICT COMMITTEE', 'TVM NORTH COMMITTEE', 'WAYANAD LEADERS', 'DISTRICT HISTORY', 'DISTRICT ADDRESSES']);
// Topic from the title when no category says it
const KEYWORDS = [
  ['struggles', /പ്രതിഷേധ|സമര|മാർച്ച്|ധർണ|പണിമുടക്ക|പ്രകടന|ഉപരോധ|വളയൽ|പ്രക്ഷോഭ|strike|protest|dharna|march/i],
  ['seminars', /സെമിനാർ|സെമിനാര|പ്രഭാഷണ|സിമ്പോസിയ|seminar|lecture/i],
  ['arts-sports', /കായിക|കലാ|ചെസ്സ്|ചെസ്|കാരംസ്|ക്രിക്കറ്റ്|ഫുട്ബോൾ|ഷട്ടിൽ|ഓണാഘോഷ|ഓണം|sports|chess|cricket|football/i],
  ['social-work', /രക്തദാന|ദുരിതാശ്വാസ|കിറ്റ്|ശുചീകരണ|പ്രളയ|ലഹരി|വൃക്ഷ|ചികിത്സാ|സഹായ|blood|relief|flood/i],
];

// Posts shown as Articles (old-site post ids, e.g. 18039). Editors tag articles in the admin
// panel later; until then, add ids here and rerun this script.
const ARTICLE_IDS = new Set([2045, 2006, 3605, 11673, 11789]);

const photos = raw.photos;
/**
 * About 70 posts imported into WordPress in 2017 have a web address instead of "?p=123" as
 * their feed id, so they get a stable number made from that address (above any WordPress id).
 */
const stableId = (link) => {
  let h = 2166136261;
  for (const ch of decodeURI(link)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return 1_000_000 + ((h >>> 0) % 9_000_000);
};

const usedSlugs = new Set();
const posts = [];
let skipped = 0;
for (const p of raw.posts) {
  const cats = p.categories.map(norm);
  const title = clean(p.title);
  // Office-bearer lists, committees, histories and addresses are district data, not news; so are
  // the old per-district gallery pages ("ആലപ്പുഴ ഗാലറി") and leftover copies ("… Copy")
  if (cats.some((c) => NOT_NEWS.has(c)) || /ഗാലറി$/.test(title) || /\scopy$/i.test(title)) { skipped++; continue; }
  if (!p.id) p.id = stableId(p.link);
  const body = paragraphs(p.html);
  const district = cats.map((c) => DISTRICT[c]).find(Boolean);
  const topic = ARTICLE_IDS.has(p.id) ? 'articles' : cats.map((c) => TOPIC[c]).find(Boolean) ?? KEYWORDS.find(([, re]) => re.test(title))?.[0] ?? 'organisation';
  const date = istDate(p.date);
  const year = date.slice(0, 4);
  let slug = slugify(title) || `post-${p.id}`;
  if (usedSlugs.has(`${year}/${slug}`)) slug = `${slug}-${p.id}`;
  usedSlugs.add(`${year}/${slug}`);
  const photo = photos[p.link];
  const latin = !/[ഀ-ൿ]/.test(title);
  posts.push({
    id: p.id,
    slug,
    date,
    topic,
    ...(district && { district }),
    title: latin ? { ml: title, en: title } : { ml: title },
    summary: { ml: cut(body.join(' '), 220) },
    ...(body.length && { body: { ml: body } }),
    cover: photo ? { kind: 'photo', src: photo.src, ...(photo.srcset && { srcset: photo.srcset }), alt: { ml: title } } : { kind: 'none' },
    ...(cats.includes('HOME-SLIDER') && { featured: true }),
    legacyUrl: decodeURI(p.link),
  });
}
posts.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
// Only the newest home-slider post leads the home page; the rest are ordinary posts
posts.forEach((p, i) => { if (p.featured && posts.findIndex((x) => x.featured) !== i) delete p.featured; });
note(`Posts: ${posts.length} news posts (${skipped} office-bearer/committee posts kept out), ${posts.filter((p) => p.cover.kind === 'photo').length} with a photo`);
note(`  by topic: ${JSON.stringify(Object.fromEntries(Object.entries(Object.groupBy(posts, (p) => p.topic)).map(([k, v]) => [k, v.length])))}`);
note(`  with a district: ${posts.filter((p) => p.district).length}`);

// ── Government orders ─────────────────────────────────────────────────────────────────────
// 34 old download categories → 3 groups × subjects, duplicates merged (plan, section 3)
const SUBJECT = {
  advance: 'bonus', bonus: 'bonus', da: 'da', 'pay-revision': 'pay-revision', 'pay-fixation': 'pay-fixation', leave: 'leave', allowance: 'allowance', 'charge-allowance': 'allowance',
  gpf: 'gpf', gis: 'gis-sli', 'gis-2': 'gis-sli', sli: 'gis-sli', gpais: 'gis-sli', hba: 'hba', increment: 'increment', ltc: 'ltc', ta: 'ta', mr: 'medical',
  'casual-sweepers': 'part-time', 'part-time': 'part-time', 'foreign-service': 'service', suspension: 'service', 'ugc-aicte': 'ugc-aicte',
  nps: 'nps', 'new-pension-scheme': 'nps', 'new-pension-scheme-p': 'nps',
  'pension-order': 'pension', 'order-related-pension': 'pension', 'pension-orders-p': 'pension', 'pension-directlyrecruite-personal': 'pension',
  'orders-related-pension-revision-1-7-2009': 'pension-revision', exgratia: 'ex-gratia', 'govt-orders-p': 'other',
};
const GROUP_OF = { nps: 'nps', pension: 'pension', 'pension-revision': 'pension', 'ex-gratia': 'pension' };
// A specific category beats a parent ("…-p") one
const rank = (c) => (c.endsWith('-p') ? 2 : c === 'important-orders' ? 3 : 1);
const ACRONYMS = new Set(['DA', 'DR', 'GPF', 'NPS', 'UGC', 'AICTE', 'HRA', 'LTC', 'GIS', 'SLI', 'GPAIS', 'HBA', 'TA', 'DA/DR', 'KSR', 'PF', 'GO', 'MEDISEP', 'SPARK', 'KSEB', 'PSC', 'NGO', 'DCRG', 'CCA', 'BIMS', 'OBC', 'SC', 'ST', 'II', 'III', 'IV', 'KASEPF', 'SDO', 'PRISM', 'ESI', 'LSGD', 'KSRTC']);
/** ALL-CAPS titles → sentence case, keeping acronyms ("DEARNESS ALLOWANCE (DA)" → "Dearness allowance (DA)") */
function titleCase(s) {
  const letters = s.replace(/[^A-Za-z]/g, '');
  if (!letters || letters.replace(/[^A-Z]/g, '').length / letters.length < 0.8) return s;
  const out = s.toLowerCase().replace(/[a-z][a-z/]*/g, (w) => (ACRONYMS.has(w.toUpperCase()) ? w.toUpperCase() : w));
  return out.charAt(0).toUpperCase() + out.slice(1);
}
// GO references are typed loosely: "GO(P) No 226-2015-Fin dated 12-06-2015", "GO P No116-2021-FinDated13-08-2021",
// "GO(Ms) No.49 Fin Dated23-03-2021", "CircularNo55-2020-FinDated25-09-2020"
const GO_RE = /G\.?\s*O\.?\s*\(?\s*(P|Rt|Ms)\s*\)?\.?\s*No\.?\s*(\d{1,5})(?:\s*[-/]\s*(\d{4}))?(?:\s*[-/ ]\s*(Fin|GAD|P&ARD|LSGD|H&FWD|Gen\.?Edn|Edn)(?=\b|dated))?/i;
const CIRCULAR_RE = /Circular\s*No\.?\s*(\d{1,5})\s*[-/]\s*(\d{4})(?:\s*[-/ ]\s*(Fin)(?=\b|dated))?/i;
const DATED_RE = /dated?\s*[:.]?\s*(\d{1,2})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{2,4})/i;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function goParts(title) {
  const d = title.match(DATED_RE);
  const year = d ? (d[3].length === 2 ? `20${d[3]}` : d[3]) : '';
  const date = d && Number(d[2]) >= 1 && Number(d[2]) <= 12 && Number(d[1]) >= 1 && Number(d[1]) <= 31 ? `${year}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}` : '';
  const go = title.match(GO_RE);
  const cir = title.match(CIRCULAR_RE);
  let number = '';
  if (go) number = `G.O.(${go[1][0].toUpperCase()}${go[1].slice(1).toLowerCase()}) No.${Number(go[2])}/${go[3] ?? year}${go[4] ? `/${go[4]}` : ''}`;
  else if (cir) number = `Circular No.${Number(cir[1])}/${cir[2]}${cir[3] ? `/${cir[3]}` : ''}`;
  if (number.endsWith('/')) number = number.slice(0, -1);
  // A title that is only the reference ("GO P No116-2021-FinDated13-08-2021-KS") reads better rebuilt
  const rest = title.replace(GO_RE, '').replace(CIRCULAR_RE, '').replace(DATED_RE, '').replace(/\b(KS|Fin|dated?)\b/gi, '').replace(/[^A-Za-zഀ-ൿ]/g, '');
  const bare = !!number && rest.length < 6;
  return { number, date, bare };
}
// English subject names (as in src/data/orders.ts), for orders whose title is only their GO number
const SUBJECT_NAME = {
  da: 'DA', 'pay-revision': 'Pay revision', 'pay-fixation': 'Pay fixation', leave: 'Leave', bonus: 'Bonus & advance', allowance: 'Allowances', gpf: 'GPF', 'gis-sli': 'GIS & SLI',
  hba: 'HBA', increment: 'Increment', ltc: 'LTC', medisep: 'MEDISEP', ta: 'TA', nps: 'NPS', pension: 'Pension', 'pension-revision': 'Pension revision', 'ex-gratia': 'Ex-gratia pension',
  medical: 'Medical reimbursement', service: 'Service matters', 'part-time': 'Part-time & casual', 'ugc-aicte': 'UGC & AICTE schemes', other: 'Government',
};
const longDate = (d) => `${Number(d.slice(8))} ${MON[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
const kb = (size) => { const m = size.match(/([\d.]+)\s*([KMG])B/i); return m ? Math.round(Number(m[1]) * { K: 1, M: 1024, G: 1048576 }[m[2].toUpperCase()]) : 0; };
const orders = [];
const seenIds = new Set();
for (const o of raw.orders) {
  if (!o.id || seenIds.has(o.id)) continue;
  seenIds.add(o.id);
  const cleaned = titleCase(clean(o.title)).replace(/\s+[-–]\s*$/, '');
  const cat = [...o.categories].sort((a, b) => rank(a) - rank(b)).find((c) => SUBJECT[c]);
  const subject = cat ? SUBJECT[cat] : 'other';
  const go = goParts(cleaned);
  const kind = go.number.startsWith('Circular') ? 'circular' : 'order';
  const titleEn = go.bare ? `${SUBJECT_NAME[subject]} ${kind}${go.date ? `, dated ${longDate(go.date)}` : ''}` : cleaned;
  const created = o.created ? istDate(new Date(`${o.created} 12:00 GMT+0530`).toISOString()) : '2016-01-01';
  const slugBase = slugify(go.bare ? `${subject} ${go.number.replace(/[^\d/]/g, ' ')}` : cleaned, 8);
  orders.push({
    id: o.id,
    slug: slugBase || 'order',
    goNumber: go.number,
    goDate: go.date || created,
    ...(!go.date && { dateIsUpload: true }),
    group: GROUP_OF[subject] ?? 'govt',
    subject,
    title: { ml: titleEn, en: titleEn },
    ...(o.categories.includes('important-orders') && { important: true }),
    pdfKb: kb(o.size),
    pdfUrl: `${o.url}?wpdmdl=${o.id}`,
    legacyUrl: decodeURI(o.url),
  });
}
orders.sort((a, b) => b.goDate.localeCompare(a.goDate) || b.id - a.id);
note(`Orders: ${orders.length} (${orders.filter((o) => o.goNumber).length} with a GO number in the title, ${orders.filter((o) => o.subject === 'other').length} without a subject)`);
note(`  by subject: ${JSON.stringify(Object.fromEntries(Object.entries(Object.groupBy(orders, (o) => o.subject)).map(([k, v]) => [k, v.length])))}`);

// ── Kerala Service ────────────────────────────────────────────────────────────────────────
const MONTHS = [['ജനുവരി', 'jan'], ['ഫെബ്രുവരി', 'feb'], ['മാർച്ച്', 'mar'], ['ഏപ്രിൽ', 'apr'], ['മേയ്|മെയ്', 'may'], ['ജൂൺ', 'jun'], ['ജൂലൈ|ജൂലായ്', 'jul'], ['ഓഗസ്റ്റ്|ആഗസ്റ്റ്|ആഗസ്ത്', 'aug'], ['സെപ്റ്റംബ|സെപ്തംബ', 'sep'], ['ഒക്ടോബ|ഒക്റ്റോബ', 'oct'], ['നവംബ', 'nov'], ['ഡിസം ?ബ', 'dec']];
const issues = [];
const seenIssues = new Set();
for (const i of raw.issues) {
  const t = tidyMl(clean(i.title));
  const file = decodeURIComponent(i.pdf.split('/').pop() ?? '').toLowerCase();
  let month = MONTHS.findIndex(([ml]) => new RegExp(ml).test(t)) + 1;
  if (!month) month = MONTHS.findIndex(([, en]) => file.includes(en)) + 1;
  // Years are written "2021", or short after the month ("ഡിസംബർ 22", "ജനുവരി-23")
  const year = Number(t.match(/20\d\d/)?.[0] ?? file.match(/20\d\d/)?.[0] ?? (t.match(/[\s–-]+(\d\d)\s*$/) && `20${t.match(/[\s–-]+(\d\d)\s*$/)[1]}`));
  if (!month || !year) { note(`  ! Kerala Service: couldn't read the month of "${t}" (${file})`); continue; }
  if (seenIssues.has(`${year}-${month}`)) { note(`  ! Kerala Service: second copy of ${year}-${month} ("${t}") left out`); continue; }
  seenIssues.add(`${year}-${month}`);
  issues.push({ year, month, ...(i.pdf && { pdfUrl: i.pdf }), ...(i.thumb && { coverUrl: i.thumb }), legacyUrl: decodeURI(i.url) });
}
issues.sort((a, b) => b.year - a.year || b.month - a.month);
note(`Kerala Service: ${issues.length} issues, ${issues.at(-1)?.month}/${issues.at(-1)?.year} to ${issues[0]?.month}/${issues[0]?.year}`);

const write = (name, data) => writeFileSync(new URL(name, OUT), `${JSON.stringify(data, null, 1)}\n`);
write('posts.json', posts);
write('orders.json', orders);
write('issues.json', issues);
write('README.md', `# Data from the current site\n\nCrawled ${raw.crawledAt.slice(0, 10)} by \`scripts/crawl.mjs\`, converted by \`scripts/import-crawl.mjs\`. Don't edit by hand: rerun both scripts.\n\n${report.map((r) => `- ${r.trim()}`).join('\n')}\n`);
