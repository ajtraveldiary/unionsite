// The page editor's script (src/views/admin/PageEditorView.astro): About pages and district
// histories. Same text boxes and English drafting as the post editor, without autosave: the page
// is saved with the buttons, and leaving with unsaved changes asks first. Every call is checked
// again on the server (src/lib/admin/pages.ts).
import type { Editor } from '@tiptap/core';
import { api, toast } from './client';
import { activeStates, createRichEditor, runCommand } from './rich-editor';
import { askKey, draftEnglish, forgetKey, TranslateError } from './translate';
import { emptyBody, textHash } from './post-doc';
import type { RichDoc } from '../richtext';

interface Boot { id: number; bodyMl: RichDoc; bodyEn: RichDoc | null; enBasedOn: string | null; readOnly: boolean }

export function initPageEditor() {
  const root = document.querySelector<HTMLElement>('[data-page-editor]');
  if (!root || root.dataset.ready) return;
  root.dataset.ready = '1';
  const boot = JSON.parse(document.getElementById('page-boot')!.textContent!) as Boot;
  const field = (name: string) => root.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)!;
  let dirty = false;
  let enBasedOn = boot.enBasedOn;
  const bodies: { ml: RichDoc; en: RichDoc | null } = { ml: boot.bodyMl, en: boot.bodyEn };
  const editors: Partial<Record<'ml' | 'en', Editor>> = {};

  for (const lang of ['ml', 'en'] as const) {
    const el = root.querySelector<HTMLElement>(`[data-rich="${lang}"]`);
    if (!el) continue;
    const ed = createRichEditor(el, {
      content: bodies[lang] ?? emptyBody(),
      placeholder: lang === 'ml' ? 'ഇവിടെ എഴുതുക…' : 'The English text appears here when drafted, or type it.',
      lang, editable: !boot.readOnly,
      onChange: (doc) => { bodies[lang] = doc; dirty = true; },
    });
    editors[lang] = ed;
    const bar = root.querySelector<HTMLElement>(`[data-toolbar="${lang}"]`);
    if (!bar) continue;
    const sync = () => {
      const on = activeStates(ed);
      bar.querySelectorAll<HTMLButtonElement>('[data-cmd]').forEach((b) => { const k = b.dataset.cmd as keyof typeof on; if (k in on) b.setAttribute('aria-pressed', String(!!on[k])); });
    };
    ed.on('transaction', sync);
    bar.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-cmd]');
      if (!b) return;
      if (b.dataset.cmd === 'image') {
        const url = window.prompt('Address of a photo already in the media library (Admin → Media, copy its link)');
        if (!url) return;
        const alt = window.prompt('Describe the photo (read out by screen readers)')?.trim();
        if (!alt) return toast('The photo needs a description.', 'error');
        return void ed.chain().focus().setImage({ src: url.trim(), alt }).run();
      }
      runCommand(ed, b.dataset.cmd as Parameters<typeof runCommand>[1]);
    });
  }
  root.querySelectorAll('input, textarea').forEach((el) => el.addEventListener('input', () => { dirty = true; }));

  const payload = () => ({
    titleMl: field('titleMl').value, summaryMl: field('summaryMl').value, bodyMl: bodies.ml,
    titleEn: field('titleEn').value, summaryEn: field('summaryEn').value, bodyEn: field('titleEn').value.trim() ? bodies.en ?? emptyBody() : null,
    enBasedOn,
  });

  root.querySelector('[data-draft-english]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    if (!field('titleMl').value.trim()) return toast('Write the Malayalam title and text first.', 'error');
    const key = await askKey();
    if (!key) return;
    btn.disabled = true;
    try {
      const ml = { title: field('titleMl').value, summary: field('summaryMl').value, body: bodies.ml };
      const out = await draftEnglish(ml, key);
      field('titleEn').value = out.title;
      field('summaryEn').value = out.summary;
      editors.en?.commands.setContent(out.html, { emitUpdate: false });
      bodies.en = (editors.en?.getJSON() as RichDoc) ?? emptyBody();
      enBasedOn = textHash(ml);
      dirty = true;
      toast('English draft ready. Check it, then approve it.');
    } catch (err) {
      if (err instanceof TranslateError && err.badKey) forgetKey();
      toast(err instanceof Error ? err.message : 'The English draft failed.', 'error');
    } finally {
      btn.disabled = false;
    }
  });

  root.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action!;
    if (action === 'unpublish' && !window.confirm('Take this page off the site? It becomes a draft.')) return;
    btn.disabled = true;
    try {
      const r = await api<{ status: string }>(`/api/admin/pages/${boot.id}`, { body: { action, page: payload() } });
      dirty = false;
      toast(action === 'publish' ? 'Published' : action === 'approve_english' ? 'English approved' : action === 'unpublish' ? 'Taken off the site' : 'Saved');
      setTimeout(() => location.assign(`/admin/pages/${boot.id}?status=${r.status}`), 400);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Not saved.', 'error');
    } finally {
      btn.disabled = false;
    }
  });
  window.addEventListener('beforeunload', (e) => { if (dirty) e.preventDefault(); });
}
