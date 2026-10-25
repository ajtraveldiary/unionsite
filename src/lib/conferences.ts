// When a state conference was, as the Conferences timeline and a conference's page show it.
import type { Conference } from './types';
import { EN_MONTHS_SHORT } from './i18n';

const day = (iso: string) => ({ d: Number(iso.slice(8, 10)), m: Number(iso.slice(5, 7)) - 1, y: Number(iso.slice(0, 4)) });

/** "12–14 Jan 2024", "30 Dec 2023 – 2 Jan 2024", "2024", or '' when nothing is known; 'year' gives the year alone */
export function confWhen(c: Conference, style: 'dates' | 'year' = 'dates') {
  const year = c.year ?? (c.start ? day(c.start).y : undefined);
  if (style === 'year' || !c.start) return year ? String(year) : '';
  const a = day(c.start);
  const b = c.end ? day(c.end) : a;
  if (a.y === b.y && a.m === b.m) return `${a.d === b.d ? a.d : `${a.d}–${b.d}`} ${EN_MONTHS_SHORT[a.m]} ${a.y}`;
  if (a.y === b.y) return `${a.d} ${EN_MONTHS_SHORT[a.m]} – ${b.d} ${EN_MONTHS_SHORT[b.m]} ${a.y}`;
  return `${a.d} ${EN_MONTHS_SHORT[a.m]} ${a.y} – ${b.d} ${EN_MONTHS_SHORT[b.m]} ${b.y}`;
}
