import type { APIRoute } from 'astro';
import { newsPage, postPath } from '~/lib/content';
import { cachePage, tags } from '~/lib/cache';
import { topics, districtBySlug } from '~/data/districts';
import type { Post } from '~/lib/types';

// One page of the News list for its filters (?topic=&district=&q=&offset=&skip=), for the News
// page's filters, search and "Load more". Replaces /news-index.json, which sent every post at
// once. Paths are Malayalam; the English page adds /en. Cached at the edge per address.
export const prerender = false;

const PAGE = 12;
const topicNames = Object.fromEntries(topics.map((t) => [t.slug, t.name.en]));
const districtNames = Object.fromEntries(Object.values(districtBySlug).map((d) => [d.slug, d.name.en.replace('Thiruvananthapuram', 'TVM')]));

/** The smallest listed size that's still at least 300 px wide, for the list thumbnail */
const thumb = (p: Post) => {
  if (p.cover.kind !== 'photo') return undefined;
  const sizes = (p.cover.srcset ?? '').split(',').map((s) => s.trim().split(/\s+/)).filter(([, w]) => w?.endsWith('w')).map(([url, w]) => ({ url, w: parseInt(w) }));
  return sizes.filter((s) => s.w >= 300).sort((a, b) => a.w - b.w)[0]?.url ?? p.cover.src;
};

/** The list shows two lines of summary, so each row carries about that much */
const short = (s: string) => (s.length <= 130 ? s : `${s.slice(0, s.lastIndexOf(' ', 130) > 80 ? s.lastIndexOf(' ', 130) : 130).replace(/…$/, '')}…`);

export const GET: APIRoute = async (context) => {
  const p = context.url.searchParams;
  const topic = p.get('topic') ?? '';
  const district = p.get('district') ?? '';
  const int = (name: string) => Math.max(0, parseInt(p.get(name) ?? '0', 10) || 0);
  const { total, posts } = await newsPage({
    topic: topic in topicNames ? topic : undefined,
    district: district === 'state' || district in districtNames ? district : undefined,
    q: (p.get('q') ?? '').slice(0, 100),
    skip: int('skip') || undefined,
    offset: int('offset'),
    limit: Math.min(int('limit') || PAGE, 48),
  });
  cachePage(context, 'list', [tags.posts]);
  return Response.json({
    topics: topicNames,
    districts: districtNames,
    total,
    posts: posts.map((x) => ({
      id: x.id,
      u: postPath(x),
      d: x.date,
      tp: x.topic,
      ...(x.district && { ds: x.district }),
      t: x.title.ml,
      ...(x.title.en && x.title.en !== x.title.ml && { te: x.title.en }),
      s: short(x.summary.ml),
      ...(x.summary.en && { se: short(x.summary.en) }),
      ...(thumb(x) && { img: thumb(x) }),
    })),
  });
};
