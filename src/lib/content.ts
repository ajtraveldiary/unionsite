// Read-side content queries. In Phase 2 these become D1 queries with the same signatures,
// so pages and components don't change.
import { posts } from '~/data/news';
import { orders, subjectBySlug } from '~/data/orders';
import { districts } from '~/data/districts';
import { events, notice } from '~/data/site';
import type { Lang, Order, Post } from './types';
import { href, t, langOf, formatDate } from './i18n';

const byDateDesc = <T extends { date: string }>(a: T, b: T) => b.date.localeCompare(a.date) || 0;

export const allPosts = () => [...posts].sort(byDateDesc);

export function homeStories() {
  const sorted = allPosts();
  const hero = sorted.find((p) => p.featured) ?? sorted[0];
  const rest = sorted.filter((p) => p !== hero);
  return { hero, secondary: rest.slice(0, 3), rest };
}

export const postsForDistrict = (slug: string) => allPosts().filter((p) => p.district === slug);
export const postsForTopic = (slug: string) => allPosts().filter((p) => p.topic === slug);
export const latestForDistrict = (slug: string) => postsForDistrict(slug)[0];

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

/** Per-district data for the interactive map (home page and /districts). */
export function districtMapInfo(lang: Lang) {
  return Object.fromEntries(
    sortedDistricts().map((d) => {
      const ps = postsForDistrict(d.slug);
      const latest = ps[0];
      return [d.slug, {
        en: d.name.en, hq: d.hq.en ?? d.hq.ml, url: districtUrl(d.slug, lang), posts: ps.length,
        latest: latest && { title: t(latest.title, lang), titleLang: langOf(latest.title, lang), url: postUrl(latest, lang), date: formatDate(latest.date, 'en', 'short') },
      }];
    }),
  );
}

/** The district with the most recent post, so the map opens on something live. */
export const liveliestDistrict = () =>
  sortedDistricts().map((d) => ({ d, p: latestForDistrict(d.slug) })).filter((x) => x.p).sort((a, b) => b.p!.date.localeCompare(a.p!.date))[0]?.d.slug;

/** The home-page notice, if there is one and it hasn't expired. */
export const activeNotice = () =>
  notice && (!notice.until || new Date(`${notice.until}T23:59:59+05:30`) >= NOW()) ? notice : null;

export const issuePath =(year: number, month: number) => `/kerala-service/${year}/${String(month).padStart(2, '0')}`;
