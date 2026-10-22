import type { APIRoute } from 'astro';
import { allEvents, allOrders, postSummaries, orderPath, postPath, sortedDistricts, subjectName } from '~/lib/content';
import { cachePage, tags } from '~/lib/cache';
import { formatDate } from '~/lib/i18n';
import { goCore, type SearchDoc } from '~/lib/search';
import { topicBySlug, districtBySlug } from '~/data/districts';

// Built from D1 on the first request, then served from the edge cache
export const prerender = false;

export const GET: APIRoute = async (context) => {
  cachePage(context, 'list', [tags.posts, tags.orders]);
  const [orders, posts] = await Promise.all([allOrders(), postSummaries()]);
  const docs: SearchDoc[] = [
    ...orders.map((o): SearchDoc => {
      const subj = subjectName(o.subject);
      return {
        k: 'order',
        ml: o.title.ml,
        en: o.title.en,
        sub: [o.goNumber, `${o.dateIsUpload ? 'Added ' : ''}${formatDate(o.goDate, 'en', 'short')}`, subj?.en].filter(Boolean).join(' · '),
        url: orderPath(o),
        kw: [o.goNumber, goCore(o.goNumber), subj?.ml, subj?.en, o.group].filter(Boolean).join(' '),
        imp: o.important,
      };
    }),
    ...posts.map((p): SearchDoc => ({
      k: 'news',
      ml: p.title.ml,
      en: p.title.en,
      sub: [formatDate(p.date, 'en', 'short'), topicBySlug[p.topic]?.name.en, p.district && districtBySlug[p.district]?.name.en].filter(Boolean).join(' · '),
      url: postPath(p),
      kw: [p.summary.ml, p.summary.en, topicBySlug[p.topic]?.name.ml, p.district && districtBySlug[p.district]?.name.ml].filter(Boolean).join(' '),
    })),
    ...sortedDistricts().map((d): SearchDoc => ({
      k: 'district',
      ml: d.name.ml,
      en: d.name.en,
      sub: 'District committee',
      url: `/districts/${d.slug}`,
      kw: `${d.hq.ml} ${d.hq.en} ${d.slug}`,
    })),
    ...allEvents().map((e): SearchDoc => ({
      k: 'event',
      ml: e.title.ml,
      en: e.title.en,
      sub: formatDate(e.start, 'en', 'short'),
      url: `/events#${e.slug}`,
    })),
    { k: 'page', ml: 'സംസ്ഥാന കമ്മിറ്റി', en: 'State committee', sub: 'Office-bearers', url: '/about/state-committee', kw: 'president general secretary treasurer leaders ഭാരവാഹികൾ' },
    { k: 'page', ml: 'സർക്കാർ ഉത്തരവുകൾ', en: 'Government orders library', sub: 'All GOs and circulars', url: '/orders', kw: 'go circular ഉത്തരവ്' },
    { k: 'page', ml: 'ജില്ലാ കമ്മിറ്റികൾ', en: 'District committees map', sub: '15 districts', url: '/districts', kw: 'map ഭൂപടം' },
  ];
  return new Response(JSON.stringify(docs), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300' },
  });
};
