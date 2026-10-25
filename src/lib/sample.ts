// Crawled content straight from src/data/live/, for the pages that are built ahead of time without
// a database: the wireframes and the /design-system style guide. Everything else reads D1 through
// content.ts. Same names as content.ts, but synchronous.
import livePosts from '~/data/live/posts.json';
import liveOrders from '~/data/live/orders.json';
import liveIssues from '~/data/live/issues.json';
import { events, firstBanner } from '~/data/site';
import type { MagazineIssue, Order, Post } from './types';
import type { ActiveBanner } from './content';

export { districtUrl, sortedDistricts, subjectName, issuePath } from './content';

export const allEvents = () => [...events].sort((a, b) => a.start.localeCompare(b.start));
const upcoming = (e: { start: string; end?: string }) => new Date(e.end ?? e.start) >= new Date();
export const upcomingEvents = (n = 3) => allEvents().filter(upcoming).slice(0, n);
export const eventsForDistrict = (slug: string) => allEvents().filter((e) => e.district === slug && upcoming(e));

const posts = livePosts as Post[];
const orders = liveOrders as Order[];
const byDateDesc = <T extends { date: string }>(a: T, b: T) => b.date.localeCompare(a.date);

export const allPosts = () => [...posts].sort(byDateDesc);
export const postById = (id: number) => posts.find((p) => p.id === id);
export const postsForDistrict = (slug: string) => allPosts().filter((p) => p.district === slug);
export const relatedPosts = (post: Post, n = 3) =>
  allPosts()
    .filter((p) => p.id !== post.id)
    .sort((a, b) => Number(b.topic === post.topic) - Number(a.topic === post.topic) || byDateDesc(a, b))
    .slice(0, n);

export const allOrders = () => [...orders].sort((a, b) => b.goDate.localeCompare(a.goDate));
export const latestOrders = (n = 5) => allOrders().slice(0, n);

export const allIssues = () => [...(liveIssues as MagazineIssue[])].sort((a, b) => b.year - a.year || b.month - a.month);

export function activeBanner(): ActiveBanner | null {
  if ('post' in firstBanner) {
    const post = postById(firstBanner.post);
    return post ? { kind: 'post', post, headline: firstBanner.headline } : null;
  }
  const slug = firstBanner.event;
  const event = events.find((e) => e.slug === slug);
  return event ? { kind: 'event', event, headline: firstBanner.headline } : null;
}
