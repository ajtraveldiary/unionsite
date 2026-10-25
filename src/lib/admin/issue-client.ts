// Browser side of Kerala Service uploads (src/views/admin/KeralaServiceView.astro and
// IssueEditorView.astro): the PDF goes to R2, page 1 is drawn as the cover and uploaded as a
// photo, and the year and month are guessed from the file name. Both screens use this.
import { coverForm, guessIssueMonth, openPdf } from './pdf-read';

export interface IssueUpload {
  pdfMediaId: number;
  coverMediaId: number | null;
  coverUrl: string | null;
  pages: number;
  bytes: number;
  guess: { year: number; month: number } | null;
}

async function post<T>(url: string, form: FormData): Promise<T> {
  const res = await fetch(url, { method: 'POST', body: form, credentials: 'same-origin' });
  const data = (await res.json().catch(() => ({}))) as { item?: T; error?: string };
  if (!res.ok || !data.item) throw new Error(data.error ?? 'The upload failed. Try again.');
  return data.item;
}

/** Uploads an issue's PDF and its cover; `onStep` reports progress for the screen */
export async function uploadIssue(file: File, onStep: (text: string) => void): Promise<IssueUpload> {
  if (file.size > 50 * 1024 * 1024) throw new Error('That PDF is larger than 50 MB.');
  onStep('Reading the PDF…');
  const { pdf, sha } = await openPdf(file);
  const pages = pdf.numPages;
  const guess = guessIssueMonth(file.name);
  let cover: { id: number; url: string } | null = null;
  try {
    onStep('Making the cover from page 1…');
    cover = await post<{ id: number; url: string }>('/api/admin/media', await coverForm(pdf, `Kerala Service ${guess ? `${guess.year}-${guess.month}` : ''} cover`.replace('  ', ' ')));
  } catch {
    // Some PDFs can't be drawn here; the site then shows a stand-in cover
    cover = null;
  }
  await pdf.destroy();
  onStep('Uploading the PDF…');
  const form = new FormData();
  form.set('file', file);
  form.set('sha256', sha);
  const item = await post<{ id: number; bytes: number }>('/api/admin/media?kind=pdf', form);
  return { pdfMediaId: item.id, coverMediaId: cover?.id ?? null, coverUrl: cover?.url ?? null, pages, bytes: item.bytes, guess };
}
