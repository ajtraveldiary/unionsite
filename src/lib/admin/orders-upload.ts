// The Upload orders screen's page script (src/views/admin/OrdersUploadView.astro). Each dropped PDF
// is read in the browser (pdf-read.ts), uploaded to R2 straight away (the same file is kept once),
// checked against the library for duplicates, and shown as a row to check. "Publish" creates the
// ready rows as published orders; "Save as drafts" keeps them off the site for now.
import { api, toast } from './client';
import { readOrderPdf, type OrderGuess } from './pdf-read';
import type { PdfItem } from './media';

interface Row {
  el: HTMLElement;
  file: File;
  guess?: OrderGuess;
  pdf?: PdfItem;
  /** Waiting on reading or uploading */
  busy: boolean;
  duplicate: boolean;
  done?: { id: number; published: boolean };
  error?: string;
}

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function initOrderUpload() {
  const root = document.querySelector<HTMLElement>('[data-order-upload]');
  if (!root || root.dataset.ready) return;
  root.dataset.ready = '1';
  const $ = <T extends Element = HTMLElement>(sel: string, el: ParentNode = root) => el.querySelector<T>(sel)!;
  const rows: Row[] = [];
  const template = $<HTMLTemplateElement>('[data-row]');

  const value = (row: Row, f: string) => {
    const el = row.el.querySelector<HTMLInputElement>(`[data-f="${f}"]`)!;
    return el.type === 'checkbox' ? el.checked : el.value.trim();
  };
  const ready = (r: Row) => !r.busy && !r.done && !r.error && !!r.pdf && !r.duplicate && !!value(r, 'title') && !!value(r, 'goDate') && !!value(r, 'subject');
  const pending = () => rows.filter((r) => !r.done && !r.error && !r.busy && !!r.pdf && !r.duplicate);

  function refresh() {
    const open = rows.filter((r) => !r.done);
    $('[data-summary-wrap]').classList.toggle('hidden', rows.length === 0);
    $('[data-count]').textContent = `${rows.length} ${rows.length === 1 ? 'file' : 'files'}`;
    const n = { ready: open.filter(ready).length, dup: open.filter((r) => r.duplicate).length, todo: open.filter((r) => !ready(r) && !r.duplicate && !r.busy && !r.error).length, busy: open.filter((r) => r.busy).length, done: rows.filter((r) => r.done).length };
    $('[data-summary]').textContent = [
      n.ready && `${n.ready} ready`, n.todo && `${n.todo} need details`, n.dup && `${n.dup} already in the library`, n.busy && `${n.busy} reading`, n.done && `${n.done} saved`,
    ].filter(Boolean).join(' · ');
    $('[data-ready-text]').textContent = n.ready ? `${n.ready} ready to publish` : n.busy ? 'Reading the PDFs…' : n.todo ? 'Fill in the title, date and subject to publish.' : 'Nothing new to publish.';
    $('[data-publish-label]').textContent = n.ready ? `Publish ${n.ready} ${n.ready === 1 ? 'order' : 'orders'}` : 'Publish';
    $<HTMLButtonElement>('[data-publish]').disabled = !n.ready;
    $<HTMLButtonElement>('[data-save-drafts]').disabled = !pending().some((r) => value(r, 'title') && value(r, 'goDate') && value(r, 'subject'));
  }

  function setState(row: Row, text: string) {
    $('[data-state]', row.el).textContent = `${kb(row.file.size)} · ${text}`;
  }
  function setBadge(row: Row, text: string, tone: 'neutral' | 'warning' | 'success') {
    const b = $('[data-badge]', row.el);
    b.textContent = text;
    b.className = `badge badge-${tone}`;
  }

  async function checkDuplicate(row: Row) {
    if (!row.pdf) return;
    const { duplicates } = await api<{ duplicates: { id: number; goNumber: string; title: string; status: string }[] }>('/api/admin/orders', {
      body: { action: 'check', goNumber: value(row, 'goNumber'), pdfMediaId: row.pdf.id },
    });
    const box = $('[data-dup]', row.el);
    row.duplicate = duplicates.length > 0;
    box.classList.toggle('hidden', !row.duplicate);
    box.textContent = '';
    if (row.duplicate) {
      const d = duplicates[0];
      box.append(`${d.goNumber || 'This file'} is already in the library${d.status === 'archived' ? ' (archived)' : d.status === 'draft' ? ' as a draft' : ''}: `);
      const open = Object.assign(document.createElement('a'), { href: `/admin/orders/${d.id}`, target: '_blank', className: 'font-semibold underline', textContent: d.title || 'open it' });
      const keep = Object.assign(document.createElement('button'), { type: 'button', className: 'ml-2 font-semibold underline', textContent: 'It’s a different order' });
      keep.addEventListener('click', () => { row.duplicate = false; box.classList.add('hidden'); setBadge(row, 'Checked', 'neutral'); refresh(); });
      box.append(open, '. Skip this file, or replace that order’s PDF from its page. ', keep);
      setBadge(row, 'Already in the library', 'warning');
    }
  }

  async function add(file: File) {
    const el = template.content.firstElementChild!.cloneNode(true) as HTMLElement;
    const row: Row = { el, file, busy: true, duplicate: false };
    rows.push(row);
    $('[data-name]', el).textContent = file.name;
    $('[data-rows]').append(el);
    setState(row, 'reading…');
    $('[data-remove]', el).addEventListener('click', () => {
      rows.splice(rows.indexOf(row), 1);
      el.remove();
      refresh();
    });
    el.querySelectorAll('[data-f]').forEach((input) => input.addEventListener('input', refresh));
    el.querySelector('[data-f="goNumber"]')!.addEventListener('change', () => checkDuplicate(row).then(refresh).catch(() => {}));
    refresh();
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error('Larger than 50 MB.');
      const guess = await readOrderPdf(file);
      row.guess = guess;
      for (const [f, v] of Object.entries({ goNumber: guess.goNumber, goDate: guess.goDate, title: guess.title, subject: guess.subject, department: guess.department })) {
        if (v) $<HTMLInputElement>(`[data-f="${f}"]`, el).value = v;
      }
      setState(row, `${guess.pages} ${guess.pages === 1 ? 'page' : 'pages'} · uploading…`);
      const form = new FormData();
      form.set('file', file);
      form.set('sha256', guess.sha);
      const res = await fetch('/api/admin/media?kind=pdf', { method: 'POST', body: form, credentials: 'same-origin' });
      const data = (await res.json().catch(() => ({}))) as { item?: PdfItem; error?: string };
      if (!res.ok || !data.item) throw new Error(data.error ?? 'The upload failed.');
      row.pdf = data.item;
      setState(row, `${guess.pages} ${guess.pages === 1 ? 'page' : 'pages'} · uploaded`);
      if (guess.scanned) setBadge(row, 'Scanned: type the details', 'warning');
      else if (guess.goNumber || guess.title) setBadge(row, 'Read from the PDF', 'neutral');
      else setBadge(row, 'Check the details', 'warning');
      row.busy = false;
      await checkDuplicate(row);
    } catch (err) {
      row.busy = false;
      row.error = err instanceof Error ? err.message : 'This file could not be read.';
      setState(row, row.error);
      setBadge(row, 'Not uploaded', 'warning');
    }
    refresh();
  }

  const addAll = (files: FileList | File[]) => {
    for (const f of files) {
      if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) { toast(`${f.name} is not a PDF.`, 'error'); continue; }
      add(f);
    }
  };
  $<HTMLInputElement>('[data-files]').addEventListener('change', (e) => {
    const input = e.currentTarget as HTMLInputElement;
    if (input.files) addAll([...input.files]);
    input.value = '';
  });
  const drop = $('[data-drop]');
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('border-ink'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('border-ink'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('border-ink');
    if (e.dataTransfer?.files) addAll([...e.dataTransfer.files]);
  });

  async function save(list: Row[], publish: boolean) {
    let saved = 0;
    for (const row of list) {
      try {
        const { id } = await api<{ id: number }>('/api/admin/orders', {
          body: {
            action: 'create', publish,
            order: {
              goNumber: value(row, 'goNumber'), goDate: value(row, 'goDate'), title: value(row, 'title'), subject: value(row, 'subject'),
              department: value(row, 'department'), summaryMl: value(row, 'summaryMl'), important: value(row, 'important'),
              pdfMediaId: row.pdf!.id, pageCount: row.guess?.pages, pdfText: row.guess?.text ?? '',
            },
          },
        });
        row.done = { id, published: publish };
        saved++;
        setBadge(row, publish ? 'Published' : 'Saved as a draft', publish ? 'success' : 'neutral');
        row.el.querySelectorAll<HTMLInputElement>('[data-f]').forEach((i) => (i.disabled = true));
        const open = Object.assign(document.createElement('a'), { href: `/admin/orders/${id}`, className: 'link', textContent: 'Open' });
        $('[data-remove]', row.el).replaceWith(open);
      } catch (err) {
        toast(`${row.file.name}: ${err instanceof Error ? err.message : 'not saved'}`, 'error');
      }
    }
    refresh();
    return saved;
  }

  $('[data-publish]').addEventListener('click', async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    btn.disabled = true;
    const n = await save(rows.filter(ready), true);
    if (n) toast(`${n} ${n === 1 ? 'order' : 'orders'} published. ${n === 1 ? 'It is' : 'They are'} in the Orders library now.`);
  });
  $('[data-save-drafts]').addEventListener('click', async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    btn.disabled = true;
    const list = pending().filter((r) => value(r, 'title') && value(r, 'goDate') && value(r, 'subject'));
    const n = await save(list, false);
    if (n) toast(`${n} saved as ${n === 1 ? 'a draft' : 'drafts'}.`);
  });

  window.addEventListener('beforeunload', (e) => {
    if (rows.some((r) => !r.done && !r.error && r.pdf && !r.duplicate)) e.preventDefault();
  });
  refresh();
}
