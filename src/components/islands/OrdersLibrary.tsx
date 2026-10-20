import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Search, FileText, Star, X, ChevronRight, SlidersHorizontal, ArrowDownUp } from 'lucide-static';
import { scoreDoc, goCore, type SearchDoc } from '~/lib/search';

export interface LibOrder {
  id: number;
  url: string;
  goNumber: string;
  goDate: string;
  dateLabel: string;
  group: string;
  subject: string;
  title: string;
  titleLang: 'ml' | 'en';
  altTitle: string;
  important?: boolean;
  pdf: string;
}
interface Named { slug: string; label: string; group?: string }
interface Props { orders: LibOrder[]; groups: Named[]; subjects: Named[] }

const Svg = ({ svg, size = 18, cls = '' }: { svg: string; size?: number; cls?: string }) => (
  <span aria-hidden="true" class={`inline-grid shrink-0 ${cls}`} dangerouslySetInnerHTML={{ __html: svg.replace(/width="24"/, `width="${size}"`).replace(/height="24"/, `height="${size}"`).replace('stroke-width="2"', 'stroke-width="1.8"') }} />
);

export default function OrdersLibrary({ orders, groups, subjects }: Props) {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('all');
  const [subject, setSubject] = useState('all');
  const [year, setYear] = useState('all');
  const [sort, setSort] = useState<'new' | 'old'>('new');
  const [sheet, setSheet] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Read filters from the URL (?q=&g=&s=&y=) so filtered views can be shared on WhatsApp
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    if (p.get('q')) setQ(p.get('q')!);
    if (p.get('g')) setGroup(p.get('g')!);
    if (p.get('s')) { const s = p.get('s')!; setSubject(s); const g = subjects.find((x) => x.slug === s)?.group; if (g) setGroup(g); }
    if (p.get('y')) setYear(p.get('y')!);
  }, []);

  useEffect(() => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (group !== 'all') p.set('g', group);
    if (subject !== 'all') p.set('s', subject);
    if (year !== 'all') p.set('y', year);
    const qs = p.toString();
    history.replaceState(history.state, '', qs ? `?${qs}` : location.pathname);
  }, [q, group, subject, year]);

  const years = useMemo(() => [...new Set(orders.map((o) => o.goDate.slice(0, 4)))].sort().reverse(), [orders]);
  const visibleSubjects = subjects.filter((s) => group === 'all' || s.group === group);
  const counts = useMemo(() => Object.fromEntries(groups.map((g) => [g.slug, orders.filter((o) => o.group === g.slug).length])), [orders]);

  const results = useMemo(() => {
    let list = orders.filter(
      (o) => (group === 'all' || o.group === group) && (subject === 'all' || o.subject === subject) && (year === 'all' || o.goDate.startsWith(year)),
    );
    if (q.trim()) {
      const scored = list
        .map((o) => {
          const doc: SearchDoc = { k: 'order', ml: o.titleLang === 'ml' ? o.title : o.altTitle, en: o.titleLang === 'en' ? o.title : o.altTitle, url: o.url, kw: `${o.goNumber} ${goCore(o.goNumber)} ${subjects.find((s) => s.slug === o.subject)?.label ?? ''} ${o.subject}` };
          return { o, s: scoreDoc(doc, q) };
        })
        .filter((x) => x.s >= 12)
        .sort((a, b) => b.s - a.s);
      return scored.map((x) => x.o);
    }
    list = [...list].sort((a, b) => (sort === 'new' ? b.goDate.localeCompare(a.goDate) : a.goDate.localeCompare(b.goDate)));
    return [...list.filter((o) => o.important), ...list.filter((o) => !o.important)];
  }, [orders, q, group, subject, year, sort]);

  const active = (group !== 'all' ? 1 : 0) + (subject !== 'all' ? 1 : 0) + (year !== 'all' ? 1 : 0);
  const reset = () => { setQ(''); setGroup('all'); setSubject('all'); setYear('all'); };

  const Filters = (
    <div class="space-y-5">
      <div>
        <p class="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-ink-3">Subject</p>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="chip" aria-pressed={subject === 'all'} onClick={() => setSubject('all')}>All subjects</button>
          {visibleSubjects.map((s) => (
            <button type="button" class="chip" aria-pressed={subject === s.slug} onClick={() => setSubject(subject === s.slug ? 'all' : s.slug)}>{s.label}</button>
          ))}
        </div>
      </div>
      <div class="flex flex-wrap items-end gap-4">
        <label class="block">
          <span class="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-ink-3">Year</span>
          <select value={year} onChange={(e) => setYear((e.target as HTMLSelectElement).value)} class="h-11 rounded-xl border border-line-strong bg-surface px-3 pr-8 font-medium">
            <option value="all">All years</option>
            {years.map((y) => <option value={y}>{y}</option>)}
          </select>
        </label>
        {!q && (
          <button type="button" onClick={() => setSort(sort === 'new' ? 'old' : 'new')} class="btn btn-ghost h-11">
            <Svg svg={ArrowDownUp} size={16} /> {sort === 'new' ? 'Newest first' : 'Oldest first'}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div lang="en">
      {/* Search */}
      <div class="relative">
        <span class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-brand"><Svg svg={Search} size={22} /></span>
        <input
          ref={input}
          type="search"
          value={q}
          onInput={(e) => setQ((e.target as HTMLInputElement).value)}
          placeholder="GO number, subject or keyword — e.g. 81/2014, DA, ക്ഷാമബത്ത"
          aria-label="Search orders"
          class="h-16 w-full rounded-2xl border-2 border-line-strong bg-surface pl-14 pr-12 text-[1.05rem] shadow-[0_8px_30px_-18px_rgb(0_0_0/0.4)] outline-none transition placeholder:text-ink-3 focus:border-brand"
        />
        {q && (
          <button type="button" onClick={() => { setQ(''); input.current?.focus(); }} class="absolute right-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full text-ink-3 hover:bg-paper-2" aria-label="Clear search">
            <Svg svg={X} />
          </button>
        )}
      </div>

      {/* Group tabs */}
      <div class="mt-5 flex items-center gap-3">
        <div role="tablist" aria-label="Order group" class="no-scrollbar flex flex-1 gap-1 overflow-x-auto rounded-2xl border border-line bg-paper-2 p-1">
          {[{ slug: 'all', label: 'All' }, ...groups].map((g) => (
            <button
              type="button"
              role="tab"
              aria-selected={group === g.slug}
              onClick={() => { setGroup(g.slug); setSubject('all'); }}
              class={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${group === g.slug ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'}`}
            >
              {g.label}
              <span class={`rounded-md px-1.5 text-xs tabular ${group === g.slug ? 'bg-brand-soft text-brand' : 'bg-line text-ink-3'}`}>{g.slug === 'all' ? orders.length : counts[g.slug]}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setSheet(true)} class="relative grid size-12 shrink-0 place-items-center rounded-2xl border border-line-strong bg-surface lg:hidden" aria-label="Filters">
          <Svg svg={SlidersHorizontal} />
          {active > 0 && <span class="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-brand-solid text-[0.7rem] font-bold text-white">{active}</span>}
        </button>
      </div>

      {/* Desktop filters inline */}
      <div class="mt-5 hidden lg:block">{Filters}</div>

      {/* Phone filters in a bottom sheet */}
      {sheet && (
        <div class="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Filters">
          <div class="absolute inset-0 bg-black/45" onClick={() => setSheet(false)} />
          <div class="sheet-up absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-paper p-4 pb-[max(env(safe-area-inset-bottom),16px)]">
            <div class="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line-strong" />
            <div class="mb-4 flex items-center justify-between">
              <h2 class="title text-[1.3rem] font-bold">Filters</h2>
              <button type="button" onClick={reset} class="text-sm font-semibold text-brand">Reset</button>
            </div>
            {Filters}
            <button type="button" onClick={() => setSheet(false)} class="btn btn-primary mt-6 w-full">Show {results.length} orders</button>
          </div>
        </div>
      )}

      {/* Result summary */}
      <div class="mt-7 flex items-center justify-between gap-3 border-b border-line pb-3">
        <p class="text-sm text-ink-2" aria-live="polite">
          <strong class="text-ink tabular">{results.length}</strong> {results.length === 1 ? 'order' : 'orders'}
          {q && <> for “<span class="font-semibold text-ink">{q}</span>”</>}
        </p>
        {(active > 0 || q) && <button type="button" onClick={reset} class="text-sm font-semibold text-brand hover:underline">Clear all</button>}
      </div>

      {/* Results */}
      {results.length === 0 ? (
        <div class="py-16 text-center">
          <div class="mx-auto grid size-16 place-items-center rounded-2xl bg-paper-2 text-ink-3"><Svg svg={FileText} size={28} /></div>
          <p class="mt-4 font-semibold">No orders match</p>
          <p class="mt-1 text-sm text-ink-3">Try just the number (e.g. “81/2014”) or a subject like “DA”.</p>
          <button type="button" onClick={reset} class="btn btn-ghost mt-5">Clear filters</button>
        </div>
      ) : (
        <ul class="divide-y divide-line">
          {results.map((o) => (
            <li key={o.id} class="group relative">
              <a href={o.url} class="grid grid-cols-[auto_1fr_auto] items-start gap-x-3 gap-y-1 rounded-xl px-2 py-4 transition-colors hover:bg-paper-2 sm:px-3 lg:grid-cols-[210px_1fr_auto_auto] lg:items-center lg:gap-x-6">
                <span class="relative grid size-11 place-items-center rounded-lg bg-brand-soft text-brand lg:hidden">
                  <Svg svg={FileText} size={20} />
                </span>
                <span class="hidden lg:block">
                  <span class="go-number">{o.goNumber}</span>
                  <span class="mt-1.5 block text-xs text-ink-3 tabular">{o.dateLabel}</span>
                </span>
                <span class="min-w-0">
                  <span class="flex flex-wrap items-center gap-2">
                    {o.important && <span class="badge badge-gold"><Svg svg={Star} size={11} /> Important</span>}
                    <span class="text-xs font-semibold text-brand">{subjects.find((s) => s.slug === o.subject)?.label}</span>
                  </span>
                  <span lang={o.titleLang} class="mt-0.5 block font-semibold leading-snug group-hover:text-brand">{o.title}</span>
                  <span class="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-3 lg:hidden">
                    <span class="go-number !py-0.5 !text-[0.7rem]">{o.goNumber}</span>
                    <span class="tabular">{o.dateLabel}</span>
                  </span>
                </span>
                <span class="hidden rounded-full border border-line px-2.5 py-1 text-xs font-semibold text-ink-2 lg:inline">PDF · {o.pdf}</span>
                <span class="mt-3 text-ink-3 transition-transform group-hover:translate-x-0.5 lg:mt-0"><Svg svg={ChevronRight} /></span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
