import { useEffect, useRef, useState } from 'preact/hooks';
import { ArrowRight, MapPin, Newspaper } from 'lucide-static';

export interface MapDistrict { slug: string; d: string; cx: number; cy: number }
export interface DistrictInfo {
  en: string;
  hq: string;
  url: string;
  posts: number;
  latest?: { title: string; titleLang: 'ml' | 'en'; url: string; date: string };
}
interface Props {
  viewBox: string;
  districts: MapDistrict[];
  info: Record<string, DistrictInfo>;
  initial?: string;
  /** Taller map and larger panel on the /districts page */
  size?: 'home' | 'full';
}

const Svg = ({ svg, size = 16 }: { svg: string; size?: number }) => (
  <span aria-hidden="true" class="inline-grid shrink-0" dangerouslySetInnerHTML={{ __html: svg.replace(/width="24"/, `width="${size}"`).replace(/height="24"/, `height="${size}"`) }} />
);

export default function KeralaMap({ viewBox, districts, info, initial, size = 'home' }: Props) {
  const [active, setActive] = useState(initial ?? districts[0].slug);
  const wrap = useRef<HTMLDivElement>(null);
  const chips = useRef<HTMLDivElement>(null);
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

  // Keep the selected chip in view on phones
  useEffect(() => {
    chips.current?.querySelector(`[data-slug="${active}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [active]);

  const a = info[active];
  const ordered = [...districts].sort((x, y) => x.cy - y.cy);
  const activeShape = districts.find((d) => d.slug === active);

  return (
    <div ref={wrap} class={`kmap grid items-start gap-6 lg:gap-10 ${size === 'full' ? 'lg:grid-cols-[minmax(0,460px)_1fr]' : 'md:grid-cols-[minmax(0,380px)_1fr]'}`}>
      <div class="relative mx-auto w-full max-w-[380px] lg:max-w-none">
        <svg viewBox={viewBox} class={`h-auto w-full ${size === 'full' ? 'max-h-[78vh]' : 'max-h-[68vh]'}`} role="group" aria-label="Map of Kerala's district committees">
          <defs>
            <filter id="kshadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000" flood-opacity=".25" />
            </filter>
            <pattern id="sea" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
              <path d="M0 7c3.5-3 7-3 10.5 0" fill="none" stroke="var(--line-strong)" stroke-width="1" />
            </pattern>
          </defs>
          <rect x="0" y="0" width="150" height="640" fill="url(#sea)" opacity=".7" />
          <text x="34" y="420" transform="rotate(-72 34 420)" class="fill-gold" style="font: italic 600 12px var(--font-sans); letter-spacing: .3em">ARABIAN SEA</text>
          {ordered.map((d, i) => {
            const on = d.slug === active;
            const inf = info[d.slug];
            return (
              <a
                key={d.slug}
                href={inf.url}
                aria-label={`${inf.en} district committee`}
                onMouseEnter={() => setActive(d.slug)}
                onFocus={() => setActive(d.slug)}
                onClick={(e) => {
                  if (coarse && !on) { e.preventDefault(); setActive(d.slug); }
                }}
                class="kmap-d outline-none"
                style={{ '--i': i } as any}
              >
                <path
                  d={d.d}
                  class={`transition-[fill] duration-200 ${on ? 'fill-brand-solid' : inf.posts ? 'fill-brand-soft hover:fill-[color-mix(in_oklab,var(--brand)_45%,var(--surface))]' : 'fill-surface hover:fill-paper-2'}`}
                  stroke="var(--line-strong)"
                  stroke-width="1.1"
                  stroke-linejoin="round"
                />
              </a>
            );
          })}
          {/* Raised copy of the active district, drawn last so it sits on top */}
          {activeShape && (
            <path d={activeShape.d} class="pointer-events-none fill-brand-solid" stroke="var(--gold-line)" stroke-width="2" filter="url(#kshadow)" style="transform: translate(-3px,-4px); transition: d .3s" />
          )}
          {districts.filter((d) => info[d.slug].posts > 0).map((d) => (
            <g key={`dot-${d.slug}`} class="pointer-events-none" transform={`translate(${d.cx} ${d.cy})`}>
              <circle r="4" class={d.slug === active ? 'fill-white' : 'fill-brand-solid'} style="animation: pulse-dot 2.2s ease-out infinite; transform-box: fill-box; transform-origin: center" />
              <circle r="3" class={d.slug === active ? 'fill-white' : 'fill-brand-solid'} />
            </g>
          ))}
        </svg>
        <p lang="en" class="mt-2 flex items-center justify-center gap-2 text-xs text-ink-3 lg:justify-start">
          <span class="inline-block size-2.5 rounded-sm bg-brand-soft ring-1 ring-line-strong" /> has recent news
          <span class="ml-3 inline-block size-2.5 rounded-full bg-brand-solid" /> new this season
        </p>
      </div>

      <div class="min-w-0">
        {/* District picker — the main control on phones */}
        <div ref={chips} class="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0" role="listbox" aria-label="Choose a district">
          {[...districts].sort((x, y) => y.cy - x.cy).map((d) => (
            <button
              type="button"
              role="option"
              aria-selected={d.slug === active}
              data-slug={d.slug}
              onClick={() => setActive(d.slug)}
              class="chip shrink-0"
              lang="en"
            >
              {info[d.slug].en.replace('Thiruvananthapuram', 'TVM')}
            </button>
          ))}
        </div>

        <div key={active} class="kmap-panel card relative overflow-hidden p-5 sm:p-7">
          <div class="pointer-events-none absolute -right-10 -top-10 size-48 rounded-full bg-brand-soft opacity-70" aria-hidden="true" />
          <p lang="en" class="eyebrow relative">District committee</p>
          <h3 lang="en" class="display relative mt-2 !text-[clamp(2rem,1.4rem+2.4vw,3rem)] text-brand">{a.en}</h3>
          <p lang="en" class="relative mt-1 flex items-center gap-1.5 text-ink-2">
            <Svg svg={MapPin} /> HQ {a.hq}
          </p>

          <div class="kasavu-thin relative my-5 opacity-80" aria-hidden="true" />

          {a.latest ? (
            <a href={a.latest.url} class="group relative flex items-start gap-3 rounded-xl border border-line bg-paper p-4 transition hover:border-brand">
              <span class="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand"><Svg svg={Newspaper} size={19} /></span>
              <span class="min-w-0">
                <span lang="en" class="block text-xs font-semibold uppercase tracking-wider text-ink-3">Latest · {a.latest.date}</span>
                <span lang={a.latest.titleLang} class="mt-0.5 block text-lg font-bold leading-snug group-hover:text-brand">{a.latest.title}</span>
              </span>
            </a>
          ) : (
            <p lang="en" class="relative rounded-xl border border-dashed border-line-strong p-4 text-sm text-ink-3">
              No district news yet. District admins will post from their phones once the admin panel is live.
            </p>
          )}

          <div lang="en" class="relative mt-5 flex flex-wrap items-center gap-3">
            <a href={a.url} class="btn btn-primary">
              Open {a.en.replace('Thiruvananthapuram', 'TVM')} hub <Svg svg={ArrowRight} size={17} />
            </a>
            <span class="text-sm text-ink-3">{a.posts} {a.posts === 1 ? 'post' : 'posts'} · office-bearers · gallery</span>
          </div>
        </div>
      </div>
    </div>
  );
}
