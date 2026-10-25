import type { Body } from './richtext';

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
  /** Paragraphs (crawled) or the editor's rich text (src/lib/richtext.ts) */
  body?: { ml: Body; en?: Body };
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
  | 'joint_secretary'
  | 'secretariat_member'
  | 'committee_member'
  | 'convener'
  | 'joint_convener'
  | 'member';

export interface Person {
  name: L10n & { en: string };
  role: PositionRole;
  body: 'state' | 'district' | 'women_subcommittee' | 'area';
  district?: string;
  /** A square photo, when one was uploaded; initials stand in otherwise */
  photo?: string;
  /** Shown on district pages only when the person gave one */
  phone?: string;
}

export interface UnionEvent {
  slug: string;
  title: L10n;
  start: string; // ISO datetime
  end?: string;
  venue: L10n;
  district?: string;
  description?: L10n;
  mapUrl?: string;
  registrationUrl?: string;
  /** The news post about it, once the event is over */
  report?: { title: L10n; path: string };
  sample?: boolean;
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
