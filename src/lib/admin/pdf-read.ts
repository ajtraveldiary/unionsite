// Reading PDFs in the admin's browser (plan, sections 9 and 11), with pdf.js: the page count, the
// text (for search, and to fill in an order's GO number, date and title), and page 1 drawn as a
// Kerala Service cover. Nothing here is sent anywhere; the page script uploads what it needs.
// Scanned PDFs have no text, so their details are typed in. Browser only; loaded on the Orders and
// Kerala Service screens.
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

/** How many pages' text is kept for search; GOs are short, annexures can be long */
const TEXT_PAGES = 40;

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const sha256 = async (data: ArrayBuffer | Blob) => hex(await crypto.subtle.digest('SHA-256', data instanceof Blob ? await data.arrayBuffer() : data));

export async function openPdf(file: File): Promise<{ pdf: PDFDocumentProxy; sha: string }> {
  const data = await file.arrayBuffer();
  const sha = await sha256(data);
  // No extra downloads: fonts the PDF doesn't carry come from the device
  const pdf = await getDocument({ data, useSystemFonts: true, stopAtErrors: false }).promise;
  return { pdf, sha };
}

export async function pdfText(pdf: PDFDocumentProxy) {
  const pages: string[] = [];
  for (let n = 1; n <= Math.min(pdf.numPages, TEXT_PAGES); n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    let line = '';
    for (const item of content.items) {
      if (!('str' in item)) continue;
      line += item.str + (item.hasEOL ? '\n' : ' ');
    }
    pages.push(line);
    page.cleanup();
  }
  return pages.join('\n').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

// ── An order's details, guessed from its text ─────────────────────────────────────────

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const iso = (y: number, m: number, d: number) =>
  y > 1950 && y < 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : '';

/** "G.O.(P) No. 116/2021/Fin" or "Circular No.55/2020/Fin", tidied */
export function findGoNumber(text: string) {
  const go = text.match(/G\s*\.?\s*O\s*\.?\s*\(\s*(P|Ms|MS|Rt|RT)\s*\)\s*No\s*\.?\s*(\d{1,5})\s*\/\s*(\d{4})\s*\/\s*([A-Za-z][A-Za-z&.]{1,15})/);
  if (go) return `G.O.(${go[1][0].toUpperCase()}${go[1].slice(1).toLowerCase()}) No.${go[2]}/${go[3]}/${go[4].replace(/\.$/, '')}`;
  const circ = text.match(/Circular\s*No\s*\.?\s*(\d{1,5})\s*\/\s*(\d{4})(?:\s*\/\s*([A-Za-z][A-Za-z&.]{1,15}))?/i);
  if (circ) return `Circular No.${circ[1]}/${circ[2]}${circ[3] ? `/${circ[3].replace(/\.$/, '')}` : ''}`;
  return '';
}

/** The date after "Dated": 13/08/2021, 13-08-2021, 13.08.2021 or 13th August 2021 */
export function findDate(text: string) {
  const num = text.match(/Dated\s*[,:.\-]*\s*(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(\d{4})/i);
  if (num) return iso(+num[3], +num[2], +num[1]);
  const word = text.match(/Dated\s*[,:.\-]*\s*(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/i);
  if (word) {
    const m = MONTHS.indexOf(word[2].slice(0, 3).toLowerCase());
    if (m >= 0) return iso(+word[3], m + 1, +word[1]);
  }
  return '';
}

/** The subject line: Kerala GOs print it under "Abstract"; circulars after "Sub:" */
export function findTitle(text: string) {
  const flat = text.replace(/\s+/g, ' ');
  const abs = flat.match(/Abstract\s*[:\-–]*\s*(.{15,320}?)\s*(?:[A-Z][A-Z &()]{4,}DEPARTMENT|G\s*\.?\s*O\s*\.?\s*\(|Read\s*[:\-]|Dated)/);
  const sub = flat.match(/\bSub(?:ject)?\s*[:\-–]+\s*(.{10,300}?)\s*(?:Ref(?:erence)?\s*[:\-]|Read\s*[:\-]|\b1\s*\.|$)/i);
  const t = (abs?.[1] ?? sub?.[1] ?? '').replace(/\s*[-–]\s*$/, '').trim();
  return t.length > 250 ? `${t.slice(0, t.lastIndexOf(' ', 250))}…` : t;
}

export function findDepartment(text: string) {
  const m = text.match(/\b([A-Z][A-Z &()]{2,40}?)\s+DEPARTMENT\b/);
  if (!m) return '';
  return `${m[1].trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())} Department`;
}

/** A likely subject from words in the title and text; the editor confirms it */
const HINTS: [RegExp, string][] = [
  [/pension revision|revision of pension/i, 'pension-revision'],
  [/ex-?gratia/i, 'ex-gratia'],
  [/national pension|\bNPS\b|contributory pension/i, 'nps'],
  [/dearness relief|pension/i, 'pension'],
  [/dearness allowance|\bD\.?A\.?\b/i, 'da'],
  [/pay revision|revision of (?:pay|scales)/i, 'pay-revision'],
  [/pay fixation|fixation of pay/i, 'pay-fixation'],
  [/\bbonus\b|festival advance|onam advance/i, 'bonus'],
  [/house building|\bHBA\b/i, 'hba'],
  [/\bGPF\b|provident fund/i, 'gpf'],
  [/\bGIS\b|\bSLI\b|group insurance|state life insurance/i, 'gis-sli'],
  [/\bLTC\b|leave travel/i, 'ltc'],
  [/medisep/i, 'medisep'],
  [/medical reimbursement|medical attendance/i, 'medical'],
  [/travelling allowance|\bT\.?A\.?\b/i, 'ta'],
  [/increment/i, 'increment'],
  [/\bleave\b/i, 'leave'],
  [/part[- ]time|casual/i, 'part-time'],
  [/\bUGC\b|AICTE/i, 'ugc-aicte'],
  [/allowance/i, 'allowance'],
];
export function guessSubject(title: string, text: string) {
  for (const [re, slug] of HINTS) if (re.test(title)) return slug;
  for (const [re, slug] of HINTS) if (re.test(text.slice(0, 1500))) return slug;
  return '';
}

export interface OrderGuess {
  sha: string;
  pages: number;
  text: string;
  /** No text layer: a scanned PDF, typed in by hand */
  scanned: boolean;
  goNumber: string;
  goDate: string;
  title: string;
  department: string;
  subject: string;
}

export async function readOrderPdf(file: File): Promise<OrderGuess> {
  const { pdf, sha } = await openPdf(file);
  const text = await pdfText(pdf);
  const pages = pdf.numPages;
  await pdf.destroy();
  const scanned = text.replace(/\s/g, '').length < 60;
  const title = scanned ? '' : findTitle(text);
  return {
    sha, pages, text: scanned ? '' : text, scanned,
    goNumber: scanned ? '' : findGoNumber(text),
    goDate: scanned ? '' : findDate(text),
    title,
    department: scanned ? '' : findDepartment(text),
    subject: guessSubject(title, text),
  };
}

// ── Kerala Service: cover from page 1, month from the file name ───────────────────────

/** "2026-April.pdf", "April 2026.pdf", "KS_2026_04.pdf", "kerala-service-apr-2026.pdf" */
export function guessIssueMonth(name: string): { year: number; month: number } | null {
  const s = name.toLowerCase();
  const year = Number(s.match(/(20\d{2})/)?.[1]);
  if (!year) return null;
  const word = MONTHS.findIndex((m) => new RegExp(`(^|[^a-z])${m}`).test(s));
  if (word >= 0) return { year, month: word + 1 };
  const num = s.match(/20\d{2}\D{0,3}(\d{1,2})(?!\d)/) ?? s.match(/(?<!\d)(\d{1,2})\D{0,3}20\d{2}/);
  const month = Number(num?.[1]);
  return month >= 1 && month <= 12 ? { year, month } : null;
}

const COVER_WIDTHS = [320, 640];

/** Page 1 drawn at the cover sizes, as the form the photo upload takes (src/lib/admin/media.ts) */
export async function coverForm(pdf: PDFDocumentProxy, alt: string): Promise<FormData> {
  const page = await pdf.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const masterWidth = 1280;
  const viewport = page.getViewport({ scale: masterWidth / base.width });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise;
  page.cleanup();
  const encode = async (w: number) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = Math.round((canvas.height * w) / canvas.width);
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, c.width, c.height);
    const webp = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/webp', 0.8));
    return webp?.type === 'image/webp' ? webp : (await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', 0.82)))!;
  };
  const form = new FormData();
  const master = await encode(masterWidth);
  const ext = master.type === 'image/webp' ? 'webp' : 'jpg';
  form.set('sha256', await sha256(master));
  form.set('alt', alt);
  form.set('width', String(canvas.width));
  form.set('height', String(canvas.height));
  for (const w of COVER_WIDTHS) form.set(`w${w}`, await encode(w), `${w}.${ext}`);
  form.set('master', master, `master.${ext}`);
  return form;
}
