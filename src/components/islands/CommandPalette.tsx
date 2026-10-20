import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { navigate } from 'astro:transitions/client';
import { Search, FileText, Newspaper, MapPin, CalendarDays, Landmark, CornerDownLeft, X, History, ArrowRight } from 'lucide-static';
import { search, type SearchDoc, type SearchKind } from '~/lib/search';

const ICON: Record<SearchKind, string> = { order: FileText, news: Newspaper, district: MapPin, event: CalendarDays, page: Landmark };
const GROUP: Record<SearchKind, string> = { order: 'Orders', news: 'News', district: 'Districts', event: 'Events', page: 'Pages' };
const ORDER: SearchKind[] = ['order', 'news', 'district', 'event', 'page'];
const SUGGESTIONS = ['DA', 'ക്ഷാമബത്ത', 'Pay Revision', '81/2014', 'Pension', 'Kollam', 'Bonus'];

const Svg = ({ svg, size = 18 }: { svg: string; size?: number }) => (
  <span
    aria-hidden="true"
    class="inline-grid shrink-0 place-items-center"
    dangerouslySetInnerHTML={{ __html: svg.replace(/width="24"/, `width="${size}"`).replace(/height="24"/, `height="${size}"`).replace('stroke-width="2"', 'stroke-width="1.8"') }}
  />
);

function Highlight({ text, q }: { text: string; q: string }) {
  const needle = q.trim().toLowerCase();
  const i = needle.length > 1 ? text.toLowerCase().indexOf(needle) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark class="rounded bg-gold-soft px-0.5 text-ink">{text.slice(i, i + needle.length)}</mark>
      {text.slice(i + needle.length)}
    </>
  );
}

export default function CommandPalette() {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<SearchDoc[] | null>(null);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [lang, setLang] = useState<'ml' | 'en'>('ml');
  const [recent, setRecent] = useState<string[]>([]);

  const open = () => {
    setLang(document.documentElement.lang === 'en' ? 'en' : 'ml');
    try { setRecent(JSON.parse(localStorage.getItem('recent-searches') ?? '[]')); } catch {}
    if (!docs) fetch('/search-index.json').then((r) => r.json()).then(setDocs).catch(() => setDocs([]));
    if (!dialog.current?.open) dialog.current?.showModal();
    requestAnimationFrame(() => input.current?.select());
  };
  const close = () => dialog.current?.close();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /input|textarea|select/i.test((e.target as HTMLElement)?.tagName) || (e.target as HTMLElement)?.isContentEditable;
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        open();
      }
    };
    const onOpen = () => open();
    addEventListener('keydown', onKey);
    addEventListener('open-search', onOpen);
    return () => { removeEventListener('keydown', onKey); removeEventListener('open-search', onOpen); };
  }, [docs]);

  const results = useMemo(() => (docs && q.trim().length >= 1 ? search(docs, q, 24) : []), [docs, q]);
  const grouped = useMemo(() => ORDER.map((k) => ({ k, items: results.filter((r) => r.k === k) })).filter((g) => g.items.length), [results]);
  const flat = grouped.flatMap((g) => g.items);

  useEffect(() => setActive(0), [q]);

  const urlFor = (d: SearchDoc) => (lang === 'en' ? (d.url === '/' ? '/en' : `/en${d.url}`) : d.url);
  const go = (d: SearchDoc) => {
    try {
      const next = [q.trim(), ...recent.filter((r) => r !== q.trim())].filter(Boolean).slice(0, 5);
      localStorage.setItem('recent-searches', JSON.stringify(next));
    } catch {}
    close();
    navigate(urlFor(d));
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, flat.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && flat[active]) { e.preventDefault(); go(flat[active]); }
  };

  useEffect(() => {
    document.getElementById(`sr-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  // Page and district names are interface text, so they're English on both sites
  const titleLang = (d: SearchDoc) => ((lang === 'en' || d.k === 'page' || d.k === 'district') && d.en ? 'en' : 'ml');
  const title = (d: SearchDoc) => (titleLang(d) === 'en' ? d.en! : d.ml);
  let idx = -1;

  return (
    <dialog
      ref={dialog}
      lang="en"
      aria-label="Search"
      class="palette m-0 h-dvh max-h-none w-full max-w-none bg-transparent p-0 backdrop:bg-black/40 backdrop:backdrop-blur-sm sm:mx-auto sm:mt-[10vh] sm:h-auto sm:max-w-[640px]"
      onClick={(e) => { if (e.target === dialog.current) close(); }}
    >
      <div class="flex h-full flex-col overflow-hidden bg-paper text-ink shadow-2xl sm:h-auto sm:max-h-[72vh] sm:rounded-2xl sm:border sm:border-line">
        <div class="flex items-center gap-3 border-b border-line px-4">
          <span class="text-brand"><Svg svg={Search} size={20} /></span>
          <input
            ref={input}
            value={q}
            onInput={(e) => setQ((e.target as HTMLInputElement).value)}
            onKeyDown={onKeyDown}
            placeholder="Search GO number, subject, news, district…"
            class="h-16 flex-1 bg-transparent text-[1.05rem] outline-none placeholder:text-ink-3"
            role="combobox"
            aria-expanded={flat.length > 0}
            aria-controls="search-results"
            aria-activedescendant={flat.length ? `sr-${active}` : undefined}
            autocomplete="off"
            spellcheck={false}
          />
          <button type="button" onClick={close} class="grid size-10 place-items-center rounded-full text-ink-2 hover:bg-paper-2" aria-label="Close search">
            <Svg svg={X} />
          </button>
        </div>

        <div id="search-results" role="listbox" class="flex-1 overflow-y-auto overscroll-contain p-2 sm:max-h-[56vh]">
          {!q.trim() && (
            <div class="p-3">
              {recent.length > 0 && (
                <>
                  <p class="eyebrow mb-2 !text-ink-3">Recent</p>
                  <ul class="mb-5">
                    {recent.map((r) => (
                      <li>
                        <button type="button" onClick={() => setQ(r)} class="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-paper-2">
                          <span class="text-ink-3"><Svg svg={History} size={16} /></span>{r}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p class="eyebrow mb-3 !text-ink-3">Try</p>
              <div class="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button type="button" class="chip" onClick={() => setQ(s)} lang={/[ഀ-ൿ]/.test(s) ? 'ml' : 'en'}>{s}</button>
                ))}
              </div>
              <p class="mt-6 text-sm leading-relaxed text-ink-3">
                Tip: type any form of a GO number — <span class="go-number">81/2014</span> finds <span class="whitespace-nowrap">G.O.(P) No.81/2014/Fin</span>.
              </p>
            </div>
          )}

          {q.trim() && docs && flat.length === 0 && (
            <div class="px-4 py-12 text-center">
              <p class="font-semibold">No results for “{q}”</p>
              <p class="mt-1 text-sm text-ink-3">Try a GO number, a subject like “DA”, or a district name.</p>
            </div>
          )}

          {q.trim() && !docs && <p class="px-4 py-10 text-center text-sm text-ink-3">Loading…</p>}

          {grouped.map((g) => (
            <div class="mb-2" key={g.k}>
              <p class="px-3 pb-1 pt-2 text-[0.7rem] font-bold uppercase tracking-[0.14em] text-ink-3">{GROUP[g.k]}</p>
              <ul>
                {g.items.map((d) => {
                  idx++;
                  const i = idx;
                  const sel = i === active;
                  return (
                    <li key={d.url} id={`sr-${i}`} role="option" aria-selected={sel}>
                      <a
                        href={urlFor(d)}
                        onClick={(e) => { e.preventDefault(); go(d); }}
                        onMouseMove={() => setActive(i)}
                        class={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${sel ? 'bg-brand-soft' : ''}`}
                      >
                        <span class={`grid size-9 shrink-0 place-items-center rounded-lg ${sel ? 'bg-brand-solid text-white' : 'bg-paper-2 text-ink-2'}`}>
                          <Svg svg={ICON[d.k]} size={17} />
                        </span>
                        <span class="min-w-0 flex-1">
                          <span lang={titleLang(d)} class="block truncate font-medium leading-snug">
                            <Highlight text={title(d)} q={q} />
                          </span>
                          {d.sub && <span class="block truncate text-xs text-ink-3">{d.sub}</span>}
                        </span>
                        {d.imp && <span class="badge badge-gold">Important</span>}
                        <span class={`text-ink-3 ${sel ? 'opacity-100' : 'opacity-0'}`}><Svg svg={sel ? CornerDownLeft : ArrowRight} size={16} /></span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div class="hidden items-center gap-4 border-t border-line px-4 py-2.5 text-xs text-ink-3 sm:flex">
          <span><kbd class="rounded border border-line bg-surface px-1">↑</kbd> <kbd class="rounded border border-line bg-surface px-1">↓</kbd> move</span>
          <span><kbd class="rounded border border-line bg-surface px-1">Enter</kbd> open</span>
          <span><kbd class="rounded border border-line bg-surface px-1">Esc</kbd> close</span>
          <span class="ml-auto">Search covers orders, news, districts and pages</span>
        </div>
      </div>
    </dialog>
  );
}
