// Read-side content queries. In Phase 2 these become D1 queries with the same signatures,
// so pages and components don't change.
import { posts } from '~/data/news';
import { orders, subjectBySlug } from '~/data/orders';
import { districts } from '~/data/districts';
import { events, notice, magazineIssues } from '~/data/site';
import type { Lang, Order, Post } from './types';
import { href } from './i18n';

const byDateDesc = <T extends { date: string }>(a: T, b: T) => b.date.localeCompare(a.date) || 0;

export const allPosts = () => [...posts].sort(byDateDesc);
export const postById = (id: number) => posts.find((p) => p.id === id);

export const postsForDistrict = (slug: string) => allPosts().filter((p) => p.district === slug);

export function relatedPosts(post: Post, n = 3) {
  return allPosts()
    .filter((p) => p.id !== post.id)
    .sort((a, b) => Number(b.topic === post.topic) - Number(a.topic === post.topic) || byDateDesc(a, b))
    .slice(0, n);
}

export const postPath = (p: Post) => `/news/${p.date.slice(0, 4)}/${p.slug}`;
export const postUrl = (p: Post, lang: Lang) => href(lang, postPath(p));

export const allOrders = () => [...orders].sort((a, b) => b.goDate.localeCompare(a.goDate));
export const latestOrders = (n = 5) => allOrders().slice(0, n);
export const orderById = (id: number) => orders.find((o) => o.id === id);
export const orderPath = (o: Order) => `/orders/${o.id}-${o.slug}`;
export const orderUrl = (o: Order, lang: Lang) => href(lang, orderPath(o));
export const relatedOrders = (o: Order, n = 4) => {
  const same = allOrders().filter((x) => x.id !== o.id && x.subject === o.subject);
  const group = allOrders().filter((x) => x.id !== o.id && x.subject !== o.subject && x.group === o.group);
  return [...same, ...group].slice(0, n);
};
export const subjectName = (slug: string) => subjectBySlug[slug]?.name;

const NOW = () => new Date();
export const upcomingEvents = (n = 3) =>
  events
    .filter((e) => new Date(e.end ?? e.start) >= NOW())
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, n);

export const districtUrl = (slug: string, lang: Lang) => href(lang, `/districts/${slug}`);
export const sortedDistricts = () => [...districts].sort((a, b) => a.sortOrder - b.sortOrder);

export const allEvents = () => [...events].sort((a, b) => a.start.localeCompare(b.start));
export const isUpcoming = (e: { start: string; end?: string }) => new Date(e.end ?? e.start) >= NOW();
export const eventsForDistrict = (slug: string) => allEvents().filter((e) => e.district === slug && isUpcoming(e));

/** The home-page notice, if there is one and it hasn't expired. */
export const activeNotice = () =>
  notice && (!notice.until || new Date(`${notice.until}T23:59:59+05:30`) >= NOW()) ? notice : null;

/** Kerala Service issues, newest first */
export const allIssues = () => [...magazineIssues].sort((a, b) => b.year - a.year || b.month - a.month);
export const issueFor = (year: number, month: number) => magazineIssues.find((i) => i.year === year && i.month === month);
export const issuePath = (year: number, month: number) => `/kerala-service/${year}/${String(month).padStart(2, '0')}`;
