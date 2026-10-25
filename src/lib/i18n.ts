import type { L10n, Lang } from './types';

/** Menus and UI labels stay in English (plan, section 6); only content switches language. */
export const ui = {
  enMissing: 'English version not yet available — showing Malayalam.',
};

export const ML_MONTHS = ['ജനുവരി', 'ഫെബ്രുവരി', 'മാർച്ച്', 'ഏപ്രിൽ', 'മേയ്', 'ജൂൺ', 'ജൂലൈ', 'ഓഗസ്റ്റ്', 'സെപ്റ്റംബർ', 'ഒക്ടോബർ', 'നവംബർ', 'ഡിസംബർ'];
export const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const EN_MONTHS_SHORT = EN_MONTHS.map((m) => m.slice(0, 3));

/** Pick the text for a language. English falls back to Malayalam when there is no reviewed version. */
export function t(text: L10n | undefined, lang: Lang): string {
  if (!text) return '';
  return lang === 'en' && text.en ? text.en : text.ml;
}

/**
 * Language the text will actually render in — used for the `lang` attribute on content blocks.
 * Text with no Malayalam letters is English, wherever it sits (many GO titles are English only).
 */
export function langOf(text: L10n | undefined, lang: Lang): Lang {
  if (lang === 'en' && text?.en) return 'en';
  return text && !/[ഀ-ൿ]/.test(text.ml) ? 'en' : 'ml';
}

export function hasEn(text: L10n | undefined) {
  return !!text?.en;
}

/** Prefix a site path with /en for English pages. */
export function href(lang: Lang, path: string) {
  if (lang === 'ml') return path;
  return path === '/' ? '/en' : `/en${path}`;
}

/** The same page in the other language. */
export function altPath(pathname: string): { ml: string; en: string } {
  const clean = pathname.replace(/\/+$/, '') || '/';
  const ml = clean === '/en' ? '/' : clean.startsWith('/en/') ? clean.slice(3) : clean;
  return { ml, en: href('en', ml) };
}

export function langFromPath(pathname: string): Lang {
  return pathname === '/en' || pathname.startsWith('/en/') ? 'en' : 'ml';
}

function parts(iso: string) {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00+05:30` : iso);
  // Dates are shown in India time regardless of where the page is rendered.
  const ist = new Date(d.getTime() + (330 + d.getTimezoneOffset()) * 60_000);
  return { y: ist.getFullYear(), m: ist.getMonth(), d: ist.getDate(), h: ist.getHours(), min: ist.getMinutes(), wd: ist.getDay() };
}

export function formatDate(iso: string, lang: Lang, style: 'long' | 'short' = 'long') {
  const { y, m, d } = parts(iso);
  if (lang === 'ml') return `${d} ${ML_MONTHS[m]} ${y}`;
  return style === 'short' ? `${d} ${EN_MONTHS_SHORT[m]} ${y}` : `${d} ${EN_MONTHS[m]} ${y}`;
}

export function dateParts(iso: string) {
  const p = parts(iso);
  return { ...p, monthShort: EN_MONTHS_SHORT[p.m], monthMl: ML_MONTHS[p.m] };
}

export function formatTime(iso: string) {
  const { h, min } = parts(iso);
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${String(min).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export function monthName(month: number, lang: Lang) {
  return (lang === 'ml' ? ML_MONTHS : EN_MONTHS)[month - 1];
}

export function readingMinutes(paragraphs: string[] | undefined) {
  if (!paragraphs?.length) return 1;
  const words = paragraphs.join(' ').split(/\s+/).length;
  return Math.max(1, Math.round(words / 160));
}

export function formatViews(n: number | undefined) {
  if (!n) return '';
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n);
}

export function formatKb(kb: number) {
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
}

/** 1st, 2nd, 3rd, 11th, 63rd */
export const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
