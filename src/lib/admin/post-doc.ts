// A post as the editor holds it: every field the editor shows, in both languages. Autosave sends
// it, the API checks it with cleanDoc(), and publishing writes it to `posts` and
// `post_translations` (src/lib/admin/posts.ts). Pure functions: the editor's page script uses them too.
import { bodyText, isRich, type RichDoc } from '../richtext';
import { topics, districts } from '../../data/districts';

export type EnSource = 'human' | 'ai_draft' | 'ai_reviewed';

export interface DocText {
  title: string;
  summary: string;
  body: RichDoc;
}

export interface PostDoc {
  /** Latin address shared by both languages; made from the title on first publish when empty */
  slug: string;
  /** The date shown on the post (ISO). Set to the publishing day when a draft goes live */
  date: string;
  topic: string;
  /** null = state level */
  district: string | null;
  coverMediaId: number | null;
  eventSlug: string | null;
  /** Lead story in Top news (state roles) */
  featured: boolean;
  /** Put in the home banner when published (state roles); the banner stays until replaced */
  banner: boolean;
  ml: DocText;
  /** English: an AI draft until a person approves it; the site shows only approved English */
  en: (DocText & { source: EnSource; basedOn: string | null }) | null;
}

export const emptyBody = (): RichDoc => ({ type: 'doc', content: [{ type: 'paragraph' }] });

/** A fingerprint of a language version's words (formatting changes don't count). When the
 * Malayalam's fingerprint no longer matches the one the English was made from, the English is "Out of date". */
export function textHash(t: Pick<DocText, 'title' | 'summary' | 'body'>) {
  const s = JSON.stringify([t.title.trim(), t.summary.trim(), bodyText(t.body)]);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Where the English stands, for badges and filters */
export type EnState = 'none' | 'draft' | 'outdated' | 'ok';
export function enState(doc: Pick<PostDoc, 'ml' | 'en'>): EnState {
  if (!doc.en || !doc.en.title.trim()) return 'none';
  if (doc.en.source === 'ai_draft') return 'draft';
  if (doc.en.basedOn && doc.en.basedOn !== textHash(doc.ml)) return 'outdated';
  return 'ok';
}
export const enStateLabel: Record<EnState, string> = {
  none: 'Needs translation',
  draft: 'English to approve',
  outdated: 'English out of date',
  ok: 'English live',
};

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
/** Body text can be long (the longest crawled article is about 95,000 characters) */
const MAX_BODY_JSON = 600_000;

function cleanBody(v: unknown): RichDoc | null {
  if (!isRich(v as RichDoc)) return null;
  if (JSON.stringify(v).length > MAX_BODY_JSON) return null;
  return v as RichDoc;
}

function cleanText(v: unknown): DocText | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const body = cleanBody(o.body);
  if (!body) return null;
  return { title: str(o.title, 300), summary: str(o.summary, 600), body };
}

/**
 * The editor's document from a request, checked field by field: unknown topics, districts and
 * events are refused, text is trimmed and capped. District roles always post to their own
 * district. Returns an error message instead when something can't be used.
 */
export function cleanDoc(input: unknown, opts: { forcedDistrict: string | null }): PostDoc | string {
  if (!input || typeof input !== 'object') return 'Nothing to save.';
  const o = input as Record<string, unknown>;
  const ml = cleanText(o.ml);
  if (!ml) return 'The Malayalam text could not be read.';
  const topic = str(o.topic, 40);
  if (!topics.some((t) => t.slug === topic)) return 'Choose a topic.';
  let district = o.district ? str(o.district, 40) : null;
  if (district && !districts.some((d) => d.slug === district)) return 'Unknown district.';
  if (opts.forcedDistrict) district = opts.forcedDistrict;
  // Whether the event exists is checked on the server (src/lib/admin/posts.ts), against D1
  const eventSlug = o.eventSlug ? str(o.eventSlug, 120) : null;
  const date = str(o.date, 25);
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(date)) return 'The date could not be read.';
  const cover = Number(o.coverMediaId);
  let en: PostDoc['en'] = null;
  if (o.en) {
    const t = cleanText(o.en);
    if (!t) return 'The English text could not be read.';
    const e = o.en as Record<string, unknown>;
    const source: EnSource = e.source === 'ai_reviewed' || e.source === 'human' ? e.source : 'ai_draft';
    en = { ...t, source, basedOn: typeof e.basedOn === 'string' ? e.basedOn.slice(0, 16) : null };
  }
  return {
    slug: str(o.slug, 80).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, ''),
    date,
    topic,
    district,
    coverMediaId: Number.isInteger(cover) && cover > 0 ? cover : null,
    eventSlug,
    featured: o.featured === true,
    banner: o.banner === true,
    ml,
    en,
  };
}
