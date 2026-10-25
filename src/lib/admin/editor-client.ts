// The post editor's page script (src/views/admin/PostEditorView.astro). It keeps the whole post
// as one document, saves it every 10 seconds when something changed (the first save of a new post
// creates it), holds the "being edited" lock while open, and runs the buttons: publish, send for
// review, approve English, preview, history and the media library. Rules are checked again on the
// server for every call, so this script only decides what to show.
import type { Editor } from '@tiptap/core';
import { api, ApiError, ago, toast } from './client';
import { activeStates, createRichEditor, runCommand } from './rich-editor';
import { prepareImage } from './image-prep';
import { aiConfig, askKey, autoTranslate, draftEnglish, forgetKey, getKey, TranslateError } from './translate';
import { emptyBody, enState, enStateLabel, textHash, type PostDoc } from './post-doc';
import { isEmptyBody, renderBody } from '../richtext';
import type { Cover, PostStatus } from './posts';
import type { MediaItem } from './media';

interface Boot {
  id: number | null;
  doc: PostDoc;
  status: PostStatus;
  live: boolean;
  hasDraft: boolean;
  savedAt: string | null;
  readOnly: boolean;
  can: { publish: boolean; english: boolean; approveEnglish: boolean; feature: boolean; requestHome: boolean; archive: boolean };
  cover: Cover | null;
  editorRole: boolean;
}

const AUTOSAVE_MS = 10_000;
const HEARTBEAT_MS = 30_000;

export function initEditor() {
  const root = document.querySelector<HTMLElement>('[data-editor]');
  if (!root || root.dataset.ready) return;
  root.dataset.ready = '1';
  const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector<T>(sel);
  const $$ = <T extends Element = HTMLElement>(sel: string) => [...root.querySelectorAll<T>(sel)];

  const boot = JSON.parse(document.getElementById('editor-boot')!.textContent!) as Boot;
  let id = boot.id;
  let doc: PostDoc = boot.doc;
  let readOnly = boot.readOnly;
  let dirty = false;
  let saving: Promise<boolean> | null = null;
  let savedAt = boot.savedAt;
  let saveError = '';
  let cover = boot.cover;

  // ── Save state line ─────────────────────────────────────────────────────────────────
  const stateEl = $('[data-save-state]')!;
  const showState = () => {
    let s: string;
    if (readOnly) s = 'Read only';
    else if (saveError) s = `Not saved: ${saveError}`;
    else if (saving) s = 'Saving…';
    else if (dirty) s = 'Unsaved changes';
    else if (!id) s = 'New post · starts saving when you type';
    else if (savedAt) s = `${boot.live ? (boot.hasDraft ? 'Changes saved' : 'Saved') : 'Draft saved'} ${ago(savedAt)}`;
    else s = '';
    stateEl.textContent = s;
    stateEl.classList.toggle('!text-accent-ink', !!saveError);
    // A published post's Update needs something new to put live
    const main = $<HTMLButtonElement>('[data-main][data-action="publish"]');
    if (main && boot.live) main.disabled = !boot.hasDraft && !dirty && !saving;
  };
  setInterval(showState, 30_000);

  // ── Fields bound to the document ─────────────────────────────────────────────────────
  const ensureEn = () => (doc.en ??= { title: '', summary: '', body: emptyBody(), source: 'ai_draft', basedOn: null });
  const get = (path: string): unknown => path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | null)?.[k], doc);
  const set = (path: string, value: unknown) => {
    const keys = path.split('.');
    if (keys[0] === 'en') ensureEn();
    let o = doc as unknown as Record<string, unknown>;
    for (const k of keys.slice(0, -1)) o = o[k] as Record<string, unknown>;
    o[keys.at(-1)!] = value;
  };
  const grow = (el: HTMLTextAreaElement) => {
    if (CSS.supports('field-sizing', 'content')) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  };

  $$<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('[data-field]').forEach((el) => {
    const path = el.dataset.field!;
    const value = get(path);
    if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = !!value;
    else el.value = (value as string | null) ?? '';
    if (el instanceof HTMLTextAreaElement) grow(el);
    if (readOnly) el.setAttribute('disabled', '');
    el.addEventListener(el instanceof HTMLInputElement && el.type === 'checkbox' ? 'change' : 'input', () => {
      if (el instanceof HTMLInputElement && el.type === 'checkbox') set(path, el.checked);
      else set(path, el instanceof HTMLSelectElement && el.value === '' ? null : el.value);
      if (el instanceof HTMLTextAreaElement) grow(el);
      changed(path);
    });
  });

  function changed(path = '') {
    dirty = true;
    saveError = '';
    if (path.startsWith('ml.') || path === '') refreshReference();
    refreshEnBadge();
    showState();
  }

  // ── Text boxes ───────────────────────────────────────────────────────────────────────
  const editors: Partial<Record<'ml' | 'en', Editor>> = {};
  (['ml', 'en'] as const).forEach((lang) => {
    const el = $(`[data-rich="${lang}"]`);
    if (!el) return;
    const ed = createRichEditor(el, {
      content: lang === 'ml' ? doc.ml.body : (doc.en?.body ?? emptyBody()),
      placeholder: lang === 'ml' ? 'വാർത്ത ഇവിടെ എഴുതുക…' : 'The English text appears here when drafted, or type it.',
      lang,
      editable: !readOnly,
      onChange: (body) => {
        if (lang === 'ml') doc.ml.body = body;
        else ensureEn().body = body;
        changed(`${lang}.body`);
      },
    });
    editors[lang] = ed;
    const bar = $(`[data-toolbar="${lang}"]`);
    if (!bar) return;
    const sync = () => {
      const on = activeStates(ed);
      bar.querySelectorAll<HTMLButtonElement>('[data-cmd]').forEach((b) => {
        const cmd = b.dataset.cmd as keyof typeof on;
        if (cmd in on) b.setAttribute('aria-pressed', String(!!on[cmd]));
      });
    };
    ed.on('selectionUpdate', sync);
    ed.on('transaction', sync);
    bar.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-cmd]');
      if (!b) return;
      if (b.dataset.cmd === 'image') return openMedia((item) => insertImage(ed, item));
      runCommand(ed, b.dataset.cmd as Parameters<typeof runCommand>[1]);
    });
  });

  async function insertImage(ed: Editor, item: MediaItem) {
    let alt = item.alt;
    if (!alt) {
      alt = (window.prompt('Describe this photo (required, read out by screen readers)') ?? '').trim();
      if (!alt) return toast('The photo needs a description before it goes in the text.', 'error');
      await api('/api/admin/media', { method: 'PATCH', body: { id: item.id, alt } }).catch(() => {});
    }
    ed.chain().focus().setImage({ src: item.url, alt }).run();
  }

  // ── English: reference copy of the Malayalam, badge and drafting ────────────────────
  function refreshReference() {
    const t = $('[data-ref-title]');
    if (!t) return;
    t.textContent = doc.ml.title;
    $('[data-ref-summary]')!.textContent = doc.ml.summary;
    $('[data-ref-body]')!.innerHTML = renderBody(doc.ml.body); // renderBody escapes all text
  }
  function refreshEnBadge() {
    const badge = $('[data-en-badge]');
    if (!badge) return;
    const s = enState(doc);
    badge.textContent = enStateLabel[s];
    badge.className = `badge ${s === 'draft' || s === 'outdated' ? 'badge-warning' : 'badge-neutral'}`;
    const label = $('[data-draft-label]');
    if (label) label.textContent = doc.en?.title ? 'Draft again with AI' : 'Draft English with AI';
  }
  refreshReference();

  function fillEnglish() {
    $$<HTMLTextAreaElement>('[data-field^="en."]').forEach((el) => {
      el.value = (get(el.dataset.field!) as string) ?? '';
      grow(el);
    });
    editors.en?.commands.setContent(doc.en?.body ?? emptyBody(), { emitUpdate: false });
    refreshEnBadge();
  }

  $('[data-draft-english]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    if (!doc.ml.title.trim()) return toast('Write the Malayalam title and text first.', 'error');
    const key = await askKey();
    if (!key) return;
    btn.disabled = true;
    const label = btn.querySelector('[data-draft-label]')!;
    const before = label.textContent;
    label.textContent = 'Drafting…';
    try {
      const out = await draftEnglish(doc.ml, key);
      const en = ensureEn();
      en.title = out.title;
      en.summary = out.summary;
      editors.en?.commands.setContent(out.html, { emitUpdate: false });
      en.body = (editors.en?.getJSON() as PostDoc['ml']['body']) ?? emptyBody();
      en.source = 'ai_draft';
      en.basedOn = textHash(doc.ml);
      fillEnglish();
      changed('en.body');
      toast('English draft ready. Check it, then approve it.');
    } catch (err) {
      if (err instanceof TranslateError && err.badKey) forgetKey();
      toast(err instanceof Error ? err.message : 'The English draft failed.', 'error');
    } finally {
      btn.disabled = false;
      label.textContent = before;
      refreshEnBadge();
    }
  });

  // ── Tabs ─────────────────────────────────────────────────────────────────────────────
  const tabs = $$<HTMLButtonElement>('[data-tab]');
  tabs.forEach((tab) => tab.addEventListener('click', () => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.classList.toggle('border-ink', on);
      t.classList.toggle('font-semibold', on);
      t.classList.toggle('border-transparent', !on);
      t.classList.toggle('text-ink-2', !on);
      const panel = $(`[data-panel="${t.dataset.tab}"]`)!;
      panel.hidden = !on;
      panel.classList.toggle('hidden', !on);
    });
    if (tab.dataset.tab === 'en') $$<HTMLTextAreaElement>('[data-field^="en."]').forEach(grow);
  }));

  // ── Cover photo ──────────────────────────────────────────────────────────────────────
  const coverImg = $<HTMLImageElement>('[data-cover-img]');
  const coverAlt = $<HTMLInputElement>('[data-cover-alt]');
  const busy = $('[data-cover-busy]');
  function showCover(c: Cover | null) {
    cover = c;
    coverImg?.classList.toggle('hidden', !c);
    $('[data-cover-empty]')?.classList.toggle('hidden', !!c);
    $('[data-cover-remove]')?.classList.toggle('hidden', !c);
    $('[data-cover-alt-wrap]')?.classList.toggle('hidden', !c);
    if (c && coverImg) coverImg.src = c.url;
    if (coverAlt) coverAlt.value = c?.alt ?? '';
  }
  function setBusy(text: string) {
    if (!busy) return;
    busy.textContent = text;
    busy.classList.toggle('hidden', !text);
    busy.classList.toggle('grid', !!text);
  }
  async function upload(file: File, alt: string): Promise<MediaItem | null> {
    try {
      setBusy('Preparing photo…');
      const form = await prepareImage(file, alt);
      setBusy('Uploading…');
      const res = await fetch('/api/admin/media', { method: 'POST', body: form, credentials: 'same-origin' });
      const data = (await res.json().catch(() => ({}))) as { item?: MediaItem; error?: string };
      if (!res.ok || !data.item) throw new Error(data.error ?? 'The upload failed. Try again.');
      return data.item;
    } catch (err) {
      toast(err instanceof Error ? err.message : 'The upload failed.', 'error');
      return null;
    } finally {
      setBusy('');
    }
  }
  const useCover = (item: MediaItem) => {
    showCover({ id: item.id, url: item.thumb || item.url, alt: item.alt });
    doc.coverMediaId = item.id;
    changed('coverMediaId');
    if (!item.alt) coverAlt?.focus();
  };
  $$<HTMLInputElement>('[data-cover-file]').forEach((input) => input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const item = await upload(file, coverAlt?.value ?? '');
    if (item) useCover(item);
  }));
  $('[data-cover-library]')?.addEventListener('click', () => openMedia(useCover));
  $('[data-cover-remove]')?.addEventListener('click', () => {
    showCover(null);
    doc.coverMediaId = null;
    changed('coverMediaId');
  });
  let altTimer: ReturnType<typeof setTimeout> | undefined;
  coverAlt?.addEventListener('input', () => {
    if (!cover) return;
    cover.alt = coverAlt.value;
    clearTimeout(altTimer);
    const target = cover.id;
    altTimer = setTimeout(() => api('/api/admin/media', { method: 'PATCH', body: { id: target, alt: coverAlt.value } }).catch((e) => toast(e.message, 'error')), 800);
  });

  // ── Media library ────────────────────────────────────────────────────────────────────
  const mediaDialog = $<HTMLDialogElement>('[data-media-dialog]');
  let pick: ((item: MediaItem) => void) | null = null;
  let last: number | undefined;
  async function loadMedia(reset: boolean) {
    if (!mediaDialog) return;
    const grid = mediaDialog.querySelector<HTMLElement>('[data-media-grid]')!;
    const status = mediaDialog.querySelector<HTMLElement>('[data-media-status]')!;
    const more = mediaDialog.querySelector<HTMLElement>('[data-media-more]')!;
    if (reset) { grid.innerHTML = ''; last = undefined; }
    status.textContent = 'Loading…';
    try {
      const q = mediaDialog.querySelector<HTMLInputElement>('[data-media-q]')!.value;
      const { items } = await api<{ items: MediaItem[] }>(`/api/admin/media?q=${encodeURIComponent(q)}${last ? `&before=${last}` : ''}`);
      for (const item of items) {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'card card-hover block w-full overflow-hidden text-left';
        const img = document.createElement('img');
        img.src = item.thumb;
        img.alt = '';
        img.loading = 'lazy';
        img.className = 'aspect-[4/3] w-full bg-bg-subtle object-cover';
        const cap = document.createElement('span');
        cap.className = 'clamp-2 block px-2 py-1.5 text-xs text-ink-2';
        cap.lang = 'ml';
        cap.textContent = item.alt || 'No description';
        b.append(img, cap);
        b.addEventListener('click', () => { mediaDialog.close(); pick?.(item); });
        li.append(b);
        grid.append(li);
        last = item.id;
      }
      status.textContent = grid.children.length ? '' : 'No photos found.';
      more.classList.toggle('hidden', items.length < 30);
    } catch (err) {
      status.textContent = err instanceof Error ? err.message : 'Could not load photos.';
    }
  }
  function openMedia(onPick: (item: MediaItem) => void) {
    if (!mediaDialog) return;
    pick = onPick;
    mediaDialog.showModal();
    loadMedia(true);
  }
  let qTimer: ReturnType<typeof setTimeout> | undefined;
  mediaDialog?.querySelector('[data-media-q]')?.addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(() => loadMedia(true), 300); });
  mediaDialog?.querySelector('[data-media-more]')?.addEventListener('click', () => loadMedia(false));
  mediaDialog?.querySelector<HTMLInputElement>('[data-media-file]')?.addEventListener('change', async (e) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const alt = (window.prompt('Describe this photo (required, read out by screen readers)') ?? '').trim();
    if (!alt) return toast('Add a description to upload the photo.', 'error');
    const status = mediaDialog.querySelector<HTMLElement>('[data-media-status]')!;
    status.textContent = 'Preparing and uploading…';
    const item = await upload(file, alt);
    status.textContent = '';
    if (item) { mediaDialog.close(); pick?.(item); }
  });

  // ── Saving ───────────────────────────────────────────────────────────────────────────
  const isBlank = () => !doc.ml.title.trim() && !doc.ml.summary.trim() && isEmptyBody(doc.ml.body) && !doc.coverMediaId;

  /** Saves now if anything changed; resolves false when the save failed */
  function save(): Promise<boolean> {
    if (readOnly) return Promise.resolve(false);
    if (saving) return saving;
    if (!dirty) return Promise.resolve(true);
    if (!id && isBlank()) return Promise.resolve(true);
    const snapshot = structuredClone(doc);
    dirty = false;
    saving = (async () => {
      showState();
      try {
        if (!id) {
          const r = await api<{ id: number }>('/api/admin/posts', { body: { doc: snapshot } });
          id = r.id;
          history.replaceState(null, '', `/admin/news/${id}`);
          savedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
        } else {
          const r = await api<{ savedAt: string }>(`/api/admin/posts/${id}`, { method: 'PUT', body: { doc: snapshot } });
          savedAt = r.savedAt;
          if (boot.live) boot.hasDraft = true;
        }
        saveError = '';
        return true;
      } catch (err) {
        dirty = true;
        saveError = err instanceof Error ? err.message : 'try again';
        if (err instanceof ApiError && err.status === 409) lockLost(err.message);
        return false;
      } finally {
        saving = null;
        showState();
      }
    })();
    return saving;
  }
  setInterval(() => { if (dirty && !saving) save(); }, AUTOSAVE_MS);

  function lockLost(message: string) {
    readOnly = true;
    $$('[data-field]').forEach((el) => el.setAttribute('disabled', ''));
    Object.values(editors).forEach((ed) => ed?.setEditable(false));
    $$('[data-main], [data-toolbar]').forEach((el) => el.classList.add('hidden'));
    const p = document.createElement('p');
    p.className = 'rounded-[var(--radius-card)] border border-line-strong bg-surface px-4 py-3 text-sm';
    p.textContent = message;
    $('[data-notices]')?.prepend(p);
    showState();
  }

  // While open but idle, keep the hold so nobody else starts editing over this person
  setInterval(async () => {
    if (!id || readOnly || dirty || saving || document.hidden) return;
    try {
      const r = await api<{ lockedBy: string | null }>(`/api/admin/posts/${id}`, { body: { action: 'lock' } });
      if (r.lockedBy) lockLost(`${r.lockedBy} is editing this post now. Reload to see their changes.`);
    } catch { /* offline: try again on the next beat */ }
  }, HEARTBEAT_MS);

  window.addEventListener('beforeunload', (e) => {
    if (dirty || saving) e.preventDefault();
  });
  window.addEventListener('pagehide', () => {
    if (!id || readOnly) return;
    if (dirty) api(`/api/admin/posts/${id}`, { method: 'PUT', body: { doc }, keepalive: true }).catch(() => {});
    api(`/api/admin/posts/${id}`, { body: { action: 'unlock' }, keepalive: true }).catch(() => {});
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && dirty) save(); });

  // ── Publishing and the other actions ───────────────────────────────────────────────
  const schedule = $<HTMLInputElement>('[data-schedule]');
  $$<HTMLInputElement>('[data-when]').forEach((r) => r.addEventListener('change', () => {
    const later = r.value === 'later' && r.checked;
    schedule?.classList.toggle('hidden', !later);
    const label = $('[data-main-label]');
    if (label) label.textContent = later ? 'Schedule' : 'Publish';
    if (later) schedule?.focus();
  }));

  function check(): string | null {
    if (!doc.ml.title.trim()) return 'Give the post a title first.';
    if (cover && !cover.alt.trim()) { coverAlt?.focus(); return 'Describe the cover photo first (for people using screen readers).'; }
    return null;
  }

  const confirmText: Partial<Record<string, string>> = {
    submit: 'Send this post to your district admin for review? You can’t change it while it waits.',
    discard: 'Throw away the changes that aren’t on the site yet? The live post stays as it is.',
    unpublish: 'Take this post off the site? It goes back to being a draft.',
    archive: 'Archive this post? It comes off the site, and can be restored later.',
    restore: 'Restore this post as a draft?',
    send_back: 'Send this post back to its writer as a draft?',
  };
  const doneText: Record<string, string> = {
    publish: 'Published', submit: 'Sent for review', discard: 'Changes discarded', unpublish: 'Taken off the site', archive: 'Archived',
    restore: 'Restored as a draft', send_back: 'Sent back', request_home: 'Request sent to the state editors', approve_english: 'English approved',
  };

  root.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
    if (!btn || btn.disabled) return;
    const action = btn.dataset.action!;
    if (confirmText[action] && !window.confirm(confirmText[action])) return;
    if (action === 'publish' || action === 'submit') {
      const problem = check();
      if (problem) return toast(problem, 'error');
    }
    if (action === 'approve_english' && !doc.en?.title.trim()) return toast('There is no English to approve yet. Draft it or type it first.', 'error');
    btn.disabled = true;
    try {
      // Make sure the post exists and the server has the latest words
      if (!id || dirty || saving) {
        dirty = dirty || !id;
        if (!(await save()) || !id) throw new Error(saveError || 'Save the post first.');
      }
      let scheduleAt: string | null = null;
      if (action === 'publish' && $<HTMLInputElement>('[data-when][value="later"]')?.checked) {
        scheduleAt = schedule?.value ?? '';
        if (!scheduleAt) throw new Error('Pick a date and time to schedule it.');
      }
      // "Draft English automatically when I publish" (Settings): only with a key already kept, never asking
      if (action === 'publish' && boot.can.english && autoTranslate() && ['none', 'outdated'].includes(enState(doc))) {
        const key = await getKey();
        if (key && (await aiConfig()).enabled) {
          try {
            const out = await draftEnglish(doc.ml, key);
            const en = ensureEn();
            en.title = out.title;
            en.summary = out.summary;
            editors.en?.commands.setContent(out.html, { emitUpdate: false });
            en.body = (editors.en?.getJSON() as PostDoc['ml']['body']) ?? emptyBody();
            en.source = 'ai_draft';
            en.basedOn = textHash(doc.ml);
            fillEnglish();
          } catch (err) {
            toast(`Published without an English draft: ${err instanceof Error ? err.message : 'Gemini failed'}`, 'error');
          }
        }
      }
      const r = await api<{ en?: PostDoc['en']; status?: string }>(`/api/admin/posts/${id}`, { body: { action, doc, scheduleAt } });
      if (action === 'approve_english' && r.en) {
        doc.en = r.en;
        refreshEnBadge();
        toast(boot.live ? 'English approved and live on the site.' : 'English approved. It goes live with the post.');
        return;
      }
      if (action === 'request_home') {
        btn.replaceWith(Object.assign(document.createElement('p'), { textContent: 'You asked for a place on the home page. A state editor decides.' }));
        toast(doneText[action]);
        return;
      }
      toast(action === 'publish' && r.status === 'scheduled' ? 'Scheduled' : action === 'publish' && boot.live ? 'Updated on the site' : doneText[action] ?? 'Done');
      dirty = false;
      setTimeout(() => location.assign(`/admin/news/${id}`), 400);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'That didn’t work. Try again.', 'error');
      if (err instanceof ApiError && err.status === 409) lockLost(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  // ── Preview ──────────────────────────────────────────────────────────────────────────
  const preview = $<HTMLDialogElement>('[data-preview-dialog]')!;
  const frame = preview.querySelector<HTMLIFrameElement>('[data-preview-frame]')!;
  let previewLang: 'ml' | 'en' = 'ml';
  const loadPreview = () => { frame.src = `/admin/preview/news/${id}?lang=${previewLang}&v=${Date.now()}`; };
  $('[data-open-preview]')?.addEventListener('click', async () => {
    if (!id || dirty || saving) {
      if (!id && isBlank()) return toast('Write something first.', 'error');
      dirty = true;
      if (!(await save()) || !id) return toast(saveError || 'Save the post first.', 'error');
    }
    preview.showModal();
    loadPreview();
  });
  preview.querySelectorAll<HTMLButtonElement>('[data-preview-size]').forEach((b) => b.addEventListener('click', () => {
    preview.querySelectorAll('[data-preview-size]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    frame.classList.toggle('w-[390px]', b.dataset.previewSize === 'phone');
    frame.classList.toggle('w-full', b.dataset.previewSize === 'laptop');
  }));
  preview.querySelector<HTMLButtonElement>('[data-preview-lang]')?.addEventListener('click', (e) => {
    previewLang = previewLang === 'ml' ? 'en' : 'ml';
    (e.currentTarget as HTMLElement).setAttribute('aria-pressed', String(previewLang === 'en'));
    loadPreview();
  });

  // ── History ──────────────────────────────────────────────────────────────────────────
  const historyDialog = $<HTMLDialogElement>('[data-history-dialog]');
  $('[data-open-history]')?.addEventListener('click', async () => {
    if (!historyDialog || !id) return;
    const list = historyDialog.querySelector<HTMLElement>('[data-history-list]')!;
    list.innerHTML = '<li class="t-meta py-3">Loading…</li>';
    historyDialog.showModal();
    try {
      const { revisions } = await api<{ revisions: { id: number; note: string; at: string; by: string | null; title: string }[] }>(`/api/admin/posts/${id}/revisions`);
      list.innerHTML = '';
      if (!revisions.length) list.innerHTML = '<li class="t-meta py-3">No earlier versions yet. One is kept each time the post is published or updated.</li>';
      for (const r of revisions) {
        const li = document.createElement('li');
        li.className = 'flex flex-wrap items-center gap-3 py-3';
        const text = document.createElement('div');
        text.className = 'min-w-0 flex-1';
        const t = document.createElement('p');
        t.className = 'clamp-2 font-semibold leading-snug';
        t.lang = 'ml';
        t.textContent = r.title || 'Untitled';
        const meta = document.createElement('p');
        meta.className = 't-meta';
        meta.textContent = `${r.note} · ${ago(r.at)}${r.by ? ` · ${r.by}` : ''}`;
        text.append(t, meta);
        li.append(text);
        if (!readOnly) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'btn btn-secondary btn-sm';
          b.textContent = 'Restore';
          b.addEventListener('click', async () => {
            if (!window.confirm('Put this version in the editor? Your current changes are replaced (they stay in History only if they were published).')) return;
            try {
              await api(`/api/admin/posts/${id}`, { body: { action: 'restore_version', revisionId: r.id } });
              dirty = false;
              location.reload();
            } catch (err) { toast(err instanceof Error ? err.message : 'Could not restore.', 'error'); }
          });
          li.append(b);
        }
        list.append(li);
      }
    } catch (err) {
      list.innerHTML = '';
      list.append(Object.assign(document.createElement('li'), { className: 't-meta py-3', textContent: err instanceof Error ? err.message : 'Could not load the history.' }));
    }
  });

  showState();
}
