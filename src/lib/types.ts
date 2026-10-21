// Content types. They mirror the tables in the rebuild plan (section 5) so Phase 2 can
// swap these seed files for D1 queries without touching the templates.

export type Lang = 'ml' | 'en';

/** Text that exists in Malayalam and may have a reviewed English version. */
export interface L10n {
  ml: string;
  en?: string;
}

export interface District {
  slug: string;
  name: L10n & { en: string };
  /** Headquarters town, for cards */
  hq: L10n;
  sortOrder: number;
}

export interface Topic {
  slug: string;
  name: L10n & { en: string };
}

/** A post without a photo; it shows a neutral tile with its topic instead. */
export interface NoCover {
  kind: 'none';
}
export interface PhotoCover {
  kind: 'photo';
  src: string;
  /** Other sizes of the same photo ("url 300w, url 768w"), so small spots load a small file */
  srcset?: string;
  alt: L10n;
  focal?: [number, number];
}
export type Cover = NoCover | PhotoCover;

export interface Post {
  id: number;
  slug: string;
  date: string; // ISO date
  topic: string; // topic slug
  district?: string; // district slug, undefined = state level
  title: L10n;
  summary: L10n;
  body?: { ml: string[]; en?: string[] };
  cover: Cover;
  featured?: boolean;
  views?: number;
  legacyUrl?: string;
  /** Placeholder content for the preview; removed by the import */
  sample?: boolean;
}

export type OrderGroup = 'govt' | 'nps' | 'pension';

export interface OrderSubject {
  slug: string;
  group: OrderGroup;
  name: L10n & { en: string };
}

export interface Order {
  id: number;
  slug: string;
  /** "G.O.(P) No.112/2026/Fin"; empty when the title doesn't give it (most crawled orders) */
  goNumber: string;
  /** The GO's date, or the day it was uploaded when `dateIsUpload` is set */
  goDate: string;
  dateIsUpload?: boolean;
  department?: string;
  group: OrderGroup;
  subject: string;
  title: L10n & { en: string };
  summary?: L10n;
  important?: boolean;
  pdfKb: number;
  pages?: number;
  pdfUrl?: string;
  legacyUrl?: string;
  sample?: boolean;
}

export type PositionRole =
  | 'president'
  | 'general_secretary'
  | 'treasurer'
  | 'vice_president'
  | 'secretary'
  | 'secretariat_member'
  | 'convener'
  | 'joint_convener';

export interface Person {
  name: L10n & { en: string };
  role: PositionRole;
  body: 'state' | 'district' | 'women_subcommittee';
  district?: string;
}

export interface UnionEvent {
  slug: string;
  title: L10n;
  start: string; // ISO datetime
  end?: string;
  venue: L10n;
  district?: string;
  sample?: boolean;
}

/** The home page's campaign banner: real text over an optional photo, never a picture of text. */
export interface CampaignBanner {
  /** Small line above the title, in English like all labels ("Campaign", "Strike call") */
  label: string;
  title: L10n;
  text?: L10n;
  /** Button text (English) and where it goes: a site path ("/news/…") or a full URL */
  cta?: string;
  path?: string;
  /** Photo behind the text; without one the banner is a white card */
  image?: string;
  /** Last day to show it (inclusive, India time); after that the home page drops it */
  until?: string;
}

export interface MagazineIssue {
  year: number;
  month: number; // 1-12
  pdfUrl?: string;
  /** Cover image (page 1); without one the archive draws a stand-in cover */
  coverUrl?: string;
  legacyUrl?: string;
}

export interface Video {
  id: string; // YouTube id
  title: L10n;
  date: string;
}
