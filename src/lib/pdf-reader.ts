// The PDF reader on a document's page (approved wireframe "One document"), with pdf.js: page 1
// first, then each page drawn as it scrolls near, so a long document starts at once on 4G.
// Zoom in and out, full screen, and "Page n of N" following the scroll. Loaded only on pages
// that have a reader (components/ds/PdfReader.astro imports this on demand). A PDF on another
// site that doesn't allow reading it here shows the Download link instead.
import { getDocument, GlobalWorkerOptions, PDFDataRangeTransport, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

const ZOOMS = [0.75, 1, 1.25, 1.5, 2];

/**
 * Fetches only the byte ranges pdf.js asks for. pdf.js does this itself only when the response
 * carries Content-Length, which a streamed response may not; with the size known from the
 * database, this works however the file is served.
 */
class RangeTransport extends PDFDataRangeTransport {
  constructor(private url: string, length: number) { super(length, null); }
  requestDataRange(begin: number, end: number) {
    fetch(this.url, { headers: { Range: `bytes=${begin}-${end - 1}` } })
      .then((r) => r.arrayBuffer())
      .then((buf) => this.onDataRange(begin, new Uint8Array(buf)));
  }
}

export async function startReader(root: HTMLElement) {
  const pagesBox = root.querySelector<HTMLElement>('[data-reader-pages]')!;
  const status = root.querySelector<HTMLElement>('[data-reader-status]')!;
  const fail = () => { root.querySelector<HTMLElement>('[data-reader-failed]')!.hidden = false; root.querySelector<HTMLElement>('[data-reader-body]')!.hidden = true; };
  let pdf: PDFDocumentProxy;
  try {
    // Byte ranges, not the whole file: only the parts of a 35 MB issue that pages on screen need
    const length = Number(root.dataset.bytes);
    const source = length > 0 ? { range: new RangeTransport(root.dataset.src!, length), length } : { url: root.dataset.src! };
    pdf = await getDocument({ ...source, disableAutoFetch: true, disableStream: true, rangeChunkSize: 256 * 1024, useSystemFonts: true }).promise;
  } catch {
    return fail();
  }
  const first = await pdf.getPage(1);
  const base = first.getViewport({ scale: 1 });
  let zoom = 1;
  const drawn = new Map<number, number>(); // page → width it was drawn at

  const holders = Array.from({ length: pdf.numPages }, (_, i) => {
    const box = document.createElement('div');
    box.className = 'reader-page';
    box.dataset.page = String(i + 1);
    box.style.aspectRatio = `${base.width} / ${base.height}`;
    box.setAttribute('aria-label', `Page ${i + 1}`);
    pagesBox.append(box);
    return box;
  });

  async function draw(box: HTMLElement) {
    const n = Number(box.dataset.page);
    const width = box.clientWidth;
    if (!width || drawn.get(n) === width) return;
    drawn.set(n, width);
    const page = await pdf.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const viewport = page.getViewport({ scale: (width / vp.width) * ratio });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    box.style.aspectRatio = `${vp.width} / ${vp.height}`;
    await page.render({ canvas, viewport }).promise;
    box.replaceChildren(canvas);
  }

  const near = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) void draw(e.target as HTMLElement);
  }, { rootMargin: '800px 0px' });
  holders.forEach((h) => near.observe(h));

  // "Page n of N": the page across the middle of the view
  const current = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) status.textContent = `Page ${(e.target as HTMLElement).dataset.page} of ${pdf.numPages}`;
  }, { rootMargin: '-50% 0px -50% 0px' });
  holders.forEach((h) => current.observe(h));
  status.textContent = `Page 1 of ${pdf.numPages}`;

  const setZoom = (z: number) => {
    zoom = z;
    pagesBox.style.setProperty('--reader-zoom', String(zoom));
    root.querySelector<HTMLButtonElement>('[data-reader-out]')!.disabled = zoom === ZOOMS[0];
    root.querySelector<HTMLButtonElement>('[data-reader-in]')!.disabled = zoom === ZOOMS[ZOOMS.length - 1];
    holders.forEach((h) => { const r = h.getBoundingClientRect(); if (r.bottom > -800 && r.top < innerHeight + 800) void draw(h); });
  };
  root.querySelector('[data-reader-out]')!.addEventListener('click', () => setZoom(ZOOMS[Math.max(0, ZOOMS.indexOf(zoom) - 1)]));
  root.querySelector('[data-reader-in]')!.addEventListener('click', () => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(zoom) + 1)]));
  const full = root.querySelector<HTMLButtonElement>('[data-reader-full]')!;
  if (!document.fullscreenEnabled) full.hidden = true;
  full.addEventListener('click', () => (document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen()));
  let resize = 0;
  window.addEventListener('resize', () => { clearTimeout(resize); resize = window.setTimeout(() => setZoom(zoom), 200); });
  setZoom(1);
}
