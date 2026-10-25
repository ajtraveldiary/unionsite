// The Import screen's wizard (src/views/admin/ImportView.astro): reads a WordPress export (WXR .xml)
// in the browser, counts what's in it, lets the super admin map each category to a district and a
// topic (prefilled the way the crawl mapped them, src/lib/wp-map.ts), shows a dry run of 20 posts,
// then sends the posts to /api/admin/import 25 at a time with a progress bar and a report.
import { DISTRICT, KEYWORDS, NOT_NEWS, TOPIC, norm } from '~/lib/wp-map';
import { api, toast } from './client';

interface WxrPost { wpId: number; link: string; title: string; html: string; date: string; type: string; status: string; categories: string[]; cover: { url: string; alt?: string } | null }
interface Mapping { district: string; topic: string; skip: boolean }
interface Result { wpId: number; title: string; outcome: string; note: string; id?: number; problems?: string[]; paragraphs?: number }

const BATCH = 25;
const text = (el: Element | null | undefined) => el?.textContent?.trim() ?? '';
const child = (item: Element, tag: string) => item.getElementsByTagName(tag)[0];

function readWxr(xml: string): WxrPost[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('This file is not a WordPress export (WXR .xml) or is damaged.');
  const items = [...doc.getElementsByTagName('item')];
  if (!items.length || !items[0].getElementsByTagName('wp:post_type').length) throw new Error('No WordPress posts found in this file. Export from WordPress: Tools → Export → All content.');
  const attachments = new Map<string, { url: string; alt?: string }>();
  for (const it of items) if (text(child(it, 'wp:post_type')) === 'attachment') attachments.set(text(child(it, 'wp:post_id')), { url: text(child(it, 'wp:attachment_url')), alt: text(child(it, 'title')) || undefined });
  return items.map((it) => {
    const meta = [...it.getElementsByTagName('wp:postmeta')];
    const thumb = meta.find((m) => text(child(m, 'wp:meta_key')) === '_thumbnail_id');
    return {
      wpId: Number(text(child(it, 'wp:post_id'))),
      link: text(child(it, 'link')),
      title: text(child(it, 'title')),
      html: text(child(it, 'content:encoded')),
      date: text(child(it, 'wp:post_date')).slice(0, 10),
      type: text(child(it, 'wp:post_type')),
      status: text(child(it, 'wp:status')),
      categories: [...it.getElementsByTagName('category')].filter((c) => c.getAttribute('domain') === 'category').map((c) => text(c)),
      cover: thumb ? attachments.get(text(child(thumb, 'wp:meta_value'))) ?? null : null,
    };
  });
}

export function initImport() {
  const found = document.querySelector<HTMLElement>('[data-import]');
  if (!found || found.dataset.ready) return;
  const root: HTMLElement = found;
  root.dataset.ready = '1';
  const districts = JSON.parse(root.dataset.districts!) as [string, string][];
  const topics = JSON.parse(root.dataset.topics!) as [string, string][];
  const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const steps = [...root.querySelectorAll<HTMLElement>('[data-step]')];
  const show = (name: string) => { steps.forEach((s) => (s.hidden = s.dataset.step !== name)); root.scrollIntoView({ block: 'start' }); };
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const ml = (s: string) => (/[ഀ-ൿ]/.test(s) ? 'ml' : 'en');

  let all: WxrPost[] = [];
  let fileName = '';
  const map = new Map<string, Mapping>();
  let stop = false;

  /** The posts to import, each with its district and topic from the mapping */
  function chosen() {
    const statuses = new Set(['publish', ...($<HTMLInputElement>('[data-drafts]').checked ? ['draft', 'pending', 'future'] : [])]);
    return all.filter((p) => p.type === 'post' && statuses.has(p.status)).flatMap((p) => {
      const ms = p.categories.map((c) => map.get(c)).filter(Boolean) as Mapping[];
      if (ms.some((m) => m.skip)) return [];
      return [{
        wpId: p.wpId, link: p.link, title: p.title, html: p.html, date: p.date, cover: p.cover,
        status: p.status === 'publish' ? 'published' : 'draft',
        district: ms.map((m) => m.district).find(Boolean) || null,
        topic: ms.map((m) => m.topic).find(Boolean) ?? KEYWORDS.find(([, re]) => re.test(p.title))?.[0] ?? 'organisation',
      }];
    });
  }

  // 1. The file
  $<HTMLInputElement>('[data-file]').addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const status = $('[data-file-status]');
    status.textContent = `Reading ${file.name}…`;
    try {
      all = readWxr(await file.text());
      fileName = file.name;
    } catch (err) {
      status.textContent = (err as Error).message;
      return;
    }
    status.textContent = '';
    await scan();
  });

  // 2. What's in it
  async function scan() {
    const byType: Record<string, Record<string, number>> = {};
    for (const p of all) { byType[p.type] ??= {}; byType[p.type][p.status] = (byType[p.type][p.status] ?? 0) + 1; }
    const statuses = [...new Set(all.map((p) => p.status))].sort();
    $('[data-scan-file]').textContent = fileName;
    $('[data-scan-table]').innerHTML = `<thead><tr class="text-xs uppercase tracking-wide text-ink-3"><th class="py-1 pr-3 font-semibold">Kind</th>${statuses.map((s) => `<th class="py-1 pr-3 text-right font-semibold">${esc(s)}</th>`).join('')}</tr></thead><tbody>${Object.entries(byType).sort((a, b) => (a[0] === 'post' ? -1 : b[0] === 'post' ? 1 : a[0].localeCompare(b[0]))).map(([t, c]) => `<tr class="border-t border-line"><td class="py-1.5 pr-3">${esc(t)}${t === 'post' ? '' : ' <span class="t-meta">· not imported</span>'}</td>${statuses.map((s) => `<td class="py-1.5 pr-3 text-right tabular">${c[s] ?? ''}</td>`).join('')}</tr>`).join('')}</tbody>`;
    const posts = all.filter((p) => p.type === 'post');
    try {
      const { already } = await api<{ already: number }>('/api/admin/import', { method: 'POST', body: { step: 'scan', ids: posts.map((p) => p.wpId), links: posts.map((p) => { try { return decodeURI(p.link); } catch { return p.link; } }) } });
      $('[data-scan-already]').textContent = `Already on the site: ${already.toLocaleString('en-IN')} of the ${posts.length.toLocaleString('en-IN')} posts. Importing again updates them, except those changed in the admin.`;
    } catch (err) { toast((err as Error).message, 'error'); }

    // Categories, prefilled
    const counts = new Map<string, number>();
    for (const p of posts) for (const c of p.categories) counts.set(c, (counts.get(c) ?? 0) + 1);
    map.clear();
    const opts = (list: [string, string][], v: string, none: string) => `<option value="">${none}</option>${list.map(([k, l]) => `<option value="${k}"${k === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}`;
    $('[data-map-rows]').innerHTML = [...counts].sort((a, b) => b[1] - a[1]).map(([c, n], i) => {
      const m = { district: DISTRICT[norm(c)] ?? '', topic: TOPIC[norm(c)] ?? '', skip: NOT_NEWS.has(norm(c)) };
      map.set(c, m);
      return `<tr class="border-t border-line" data-cat="${i}"><td class="py-2 pr-3" lang="${ml(c)}">${esc(c)}</td><td class="py-2 pr-3 text-right tabular">${n}</td>
        <td class="py-2 pr-3"><select class="field" data-k="district" aria-label="District for ${esc(c)}">${opts(districts, m.district, 'No district')}</select></td>
        <td class="py-2 pr-3"><select class="field" data-k="topic" aria-label="Topic for ${esc(c)}">${opts(topics, m.topic, 'From the title')}</select></td>
        <td class="py-2"><label class="flex items-center gap-2 text-sm"><input type="checkbox" data-k="skip"${m.skip ? ' checked' : ''} /> Leave out</label></td></tr>`;
    }).join('');
    const names = [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)!);
    root.querySelectorAll<HTMLElement>('[data-cat]').forEach((row) => row.addEventListener('change', (e) => {
      const el = e.target as HTMLInputElement;
      const m = map.get(names[Number(row.dataset.cat)])!;
      if (el.dataset.k === 'skip') m.skip = el.checked; else (m as unknown as Record<string, string>)[el.dataset.k!] = el.value;
      count();
    }));
    count();
    show('scan');
  }
  const count = () => { $('[data-map-count]').textContent = `${chosen().length.toLocaleString('en-IN')} posts will be imported.`; };
  $<HTMLInputElement>('[data-drafts]').addEventListener('change', count);

  // 3. The dry run
  $('[data-to-check]').addEventListener('click', async () => {
    const items = chosen();
    if (!items.length) return toast('No posts to import with these choices.', 'error');
    const step = Math.max(1, Math.floor(items.length / 20));
    const sample = items.filter((_, i) => i % step === 0).slice(0, 20);
    try {
      const { results } = await api<{ results: Result[] }>('/api/admin/import', { method: 'POST', body: { step: 'check', items: sample } });
      const dn = Object.fromEntries(districts), tn = Object.fromEntries(topics);
      $('[data-check-rows]').innerHTML = results.map((r, i) => `<tr class="border-t border-line align-top"><td class="py-2 pr-3"><span lang="${ml(r.title)}" class="font-medium">${esc(r.title || '(no title)')}</span><span class="t-meta block">${esc(sample[i].date)} · ${r.paragraphs ?? 0} ${r.paragraphs === 1 ? 'paragraph' : 'paragraphs'}</span></td><td class="py-2 pr-3">${esc(dn[sample[i].district ?? ''] ?? 'State')}</td><td class="py-2 pr-3">${esc(tn[sample[i].topic] ?? sample[i].topic)}</td><td class="py-2 pr-3">${esc(r.note)}</td><td class="py-2 text-sm">${(r.problems ?? []).map((p) => `<span class="block text-warning">${esc(p)}</span>`).join('') || '—'}</td></tr>`).join('');
      $('[data-check-total]').textContent = `Import ${items.length.toLocaleString('en-IN')} posts`;
      show('check');
    } catch (err) { toast((err as Error).message, 'error'); }
  });
  $('[data-back-map]').addEventListener('click', () => show('scan'));

  // 4. The import
  $('[data-run]').addEventListener('click', async () => {
    const items = chosen();
    stop = false;
    show('run');
    const bar = $('[data-bar]'), label = $('[data-run-label]');
    let job = 0, done = 0;
    let counts: Record<string, number> = {};
    const problems: Result[] = [];
    try {
      job = (await api<{ job: number }>('/api/admin/import', { method: 'POST', body: { step: 'start', fileName, total: items.length } })).job;
      for (let i = 0; i < items.length && !stop; i += BATCH) {
        const r = await api<{ results: Result[]; counts: Record<string, number> }>('/api/admin/import', { method: 'POST', body: { step: 'batch', job, items: items.slice(i, i + BATCH) } });
        counts = r.counts;
        problems.push(...r.results.filter((x) => x.outcome === 'failed' || x.outcome === 'skipped' || x.outcome === 'kept'));
        done = Math.min(items.length, i + BATCH);
        bar.style.width = `${(done / items.length) * 100}%`;
        label.textContent = `${done.toLocaleString('en-IN')} of ${items.length.toLocaleString('en-IN')} posts · ${counts.created ?? 0} new · ${counts.updated ?? 0} updated`;
      }
      await api('/api/admin/import', { method: 'POST', body: { step: 'finish', job, failed: stop } });
    } catch (err) {
      toast((err as Error).message, 'error');
      if (job) await api('/api/admin/import', { method: 'POST', body: { step: 'finish', job, failed: true } }).catch(() => {});
    }
    // 5. The report
    $('[data-report-head]').textContent = stop ? 'Import stopped' : 'Import finished';
    $('[data-report-counts]').innerHTML = (['created', 'updated', 'kept', 'skipped', 'failed'] as const).map((k) => `<li class="card p-3"><p class="text-xl font-bold tabular">${counts[k] ?? 0}</p><p class="text-sm text-ink-2">${{ created: 'New posts', updated: 'Updated', kept: 'Kept (changed in the admin)', skipped: 'Left out', failed: 'Failed' }[k]}</p></li>`).join('');
    $('[data-report-rows]').innerHTML = problems.slice(0, 100).map((r) => `<li class="py-1.5 text-sm"><span class="font-medium" lang="${ml(r.title)}">${esc(r.title || `WordPress post ${r.wpId}`)}</span> <span class="t-meta">· ${esc(r.outcome)}: ${esc(r.note)}</span></li>`).join('') || '<li class="t-meta py-2">Every post came over.</li>';
    if (job) $<HTMLAnchorElement>('[data-report-csv]').href = `/admin/import-csv?job=${job}`;
    show('report');
  });
  $('[data-stop]').addEventListener('click', () => { stop = true; $('[data-run-label]').textContent = 'Stopping after this batch…'; });
}
