import type { APIRoute } from 'astro';
import { allPosts, postPath } from '~/lib/content';
import { topics, districtBySlug } from '~/data/districts';
import type { Post } from '~/lib/types';

// Every news post in a compact form for the News page's filters, search and "Load more"
// (the page itself renders only the newest stories). Paths are Malayalam; the English page
// adds /en. Phase 2 answers the same filters from the database instead.
export const prerender = true;

/** The smallest listed size that's still at least 300 px wide, for the list thumbnail */
const thumb = (p: Post) => {
  if (p.cover.kind !== 'photo') return undefined;
  const sizes = (p.cover.srcset ?? '').split(',').map((s) => s.trim().split(/\s+/)).filter(([, w]) => w?.endsWith('w')).map(([url, w]) => ({ url, w: parseInt(w) }));
  return sizes.filter((s) => s.w >= 300).sort((a, b) => a.w - b.w)[0]?.url ?? p.cover.src;
};

/** The list shows two lines of summary, so the index carries about that much */
const short = (s: string) => (s.length <= 130 ? s : `${s.slice(0, s.lastIndexOf(' ', 130) > 80 ? s.lastIndexOf(' ', 130) : 130).replace(/…$/, '')}…`);

export const GET: APIRoute = () => {
  const data = {
    topics: Object.fromEntries(topics.map((t) => [t.slug, t.name.en])),
    districts: Object.fromEntries(Object.values(districtBySlug).map((d) => [d.slug, d.name.en.replace('Thiruvananthapuram', 'TVM')])),
    posts: allPosts().map((p) => ({
      id: p.id,
      u: postPath(p),
      d: p.date,
      tp: p.topic,
      ...(p.district && { ds: p.district }),
      t: p.title.ml,
      ...(p.title.en && p.title.en !== p.title.ml && { te: p.title.en }),
      s: short(p.summary.ml),
      ...(p.summary.en && { se: short(p.summary.en) }),
      ...(thumb(p) && { img: thumb(p) }),
    })),
  };
  return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300' } });
};
