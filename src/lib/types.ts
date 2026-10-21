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
  goNumber: string;
  goDate: string;
  department: string;
  group: OrderGroup;
  subject: string;
  title: L10n & { en: string };
  summary?: L10n;
  important?: boolean;
  pdfKb: number;
  pages: number;
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

export interface MagazineIssue {
  year: number;
  month: number; // 1-12
}

export interface Video {
  id: string; // YouTube id
  title: L10n;
  date: string;
}
