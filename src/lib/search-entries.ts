// What search knows about each post and order: the result row it shows (a SearchDoc) and the
// normalised text D1's full-text index holds (title, keywords, body). The seed script builds the
// index with these, and the admin panel will call them on every save, so both stay the same.
// Districts, events and the fixed pages are few and change with the code, so they are searched in
// memory (staticDocs). Relative imports with .ts endings: Node runs this file too.
import { formatDate } from './i18n.ts';
import { goCore, normalise, type SearchDoc } from './search.ts';
import { postPath, orderPath } from './paths.ts';
import { topicBySlug, districtBySlug, districts } from '../data/districts.ts';
import { subjectBySlug } from '../data/orders.ts';
import { events } from '../data/site.ts';
import type { L10n, Order, OrderGroup } from './types.ts';

export interface SearchEntry {
  doc: SearchDoc;
  /** Newest first among equally good matches */
  date: string;
  /** Normalised text for the full-text index */
  title: string;
  kw: string;
  body: string;
}

interface PostInput {
  slug: string;
  date: string;
  topic: string;
  district?: string | null;
  title: L10n;
  summary: L10n;
  body?: { ml?: string[] | null; en?: string[] | null } | null;
}

export function postEntry(p: PostInput): SearchEntry {
  const topic = topicBySlug[p.topic];
  const district = p.district ? districtBySlug[p.district] : undefined;
  const doc: SearchDoc = {
    k: 'news',
    ml: p.title.ml,
    ...(p.title.en && { en: p.title.en }),
    sub: [formatDate(p.date, 'en', 'short'), topic?.name.en, district?.name.en].filter(Boolean).join(' · '),
    url: postPath(p),
    kw: [p.summary.ml, p.summary.en, topic?.name.ml, district?.name.ml].filter(Boolean).join(' '),
  };
  return {
    doc,
    date: p.date,
    title: normalise(`${doc.ml} ${doc.en ?? ''}`),
    kw: normalise(`${doc.kw} ${doc.sub}`),
    body: normalise([...(p.body?.ml ?? []), ...(p.body?.en ?? [])].join(' ')),
  };
}

type OrderInput = Pick<Order, 'id' | 'slug' | 'goNumber' | 'goDate' | 'dateIsUpload' | 'subject' | 'important'> & {
  group: OrderGroup;
  title: L10n;
  summary?: L10n;
  /** Text read from the PDF at upload (plan, section 11); none for crawled orders yet */
  pdfText?: string | null;
};

export function orderEntry(o: OrderInput): SearchEntry {
  const subj = subjectBySlug[o.subject]?.name;
  const doc: SearchDoc = {
    k: 'order',
    ml: o.title.ml,
    ...(o.title.en && { en: o.title.en }),
    sub: [o.goNumber, `${o.dateIsUpload ? 'Added ' : ''}${formatDate(o.goDate, 'en', 'short')}`, subj?.en].filter(Boolean).join(' · '),
    url: orderPath(o),
    kw: [o.goNumber, goCore(o.goNumber), subj?.ml, subj?.en, o.group].filter(Boolean).join(' '),
    ...(o.important && { imp: true }),
  };
  return {
    doc,
    date: o.goDate,
    title: normalise(`${doc.ml} ${doc.en ?? ''}`),
    kw: normalise(`${doc.kw} ${doc.sub} ${o.summary?.ml ?? ''} ${o.summary?.en ?? ''}`),
    body: normalise(o.pdfText ?? ''),
  };
}

/** Districts, events and the main fixed pages, searched in memory alongside D1 */
export const staticDocs = (): SearchDoc[] => [
  ...[...districts].sort((a, b) => a.sortOrder - b.sortOrder).map((d): SearchDoc => ({
    k: 'district',
    ml: d.name.ml,
    en: d.name.en,
    sub: 'District committee',
    url: `/districts/${d.slug}`,
    kw: `${d.hq.ml} ${d.hq.en} ${d.slug}`,
  })),
  ...[...events].sort((a, b) => a.start.localeCompare(b.start)).map((e): SearchDoc => ({
    k: 'event',
    ml: e.title.ml,
    ...(e.title.en && { en: e.title.en }),
    sub: formatDate(e.start, 'en', 'short'),
    url: `/events#${e.slug}`,
  })),
  { k: 'page', ml: 'സംസ്ഥാന കമ്മിറ്റി', en: 'State committee', sub: 'Office-bearers', url: '/about/state-committee', kw: 'president general secretary treasurer leaders ഭാരവാഹികൾ' },
  { k: 'page', ml: 'സർക്കാർ ഉത്തരവുകൾ', en: 'Government orders library', sub: 'All GOs and circulars', url: '/orders', kw: 'go circular ഉത്തരവ്' },
  { k: 'page', ml: 'ജില്ലാ കമ്മിറ്റികൾ', en: 'District committees map', sub: '15 districts', url: '/districts', kw: 'map ഭൂപടം' },
];
