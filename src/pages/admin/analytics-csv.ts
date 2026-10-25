import type { APIRoute } from 'astro';
import { dashboard, PERIODS, toCsv, type Period } from '~/lib/admin/analytics';

// GET /admin/analytics-csv?table=posts|orders|searches|districts&days=: one Analytics table as CSV
export const prerender = false;

export const GET: APIRoute = async ({ locals, url }) => {
  const days = (Number(url.searchParams.get('days')) in PERIODS ? Number(url.searchParams.get('days')) : 30) as Period;
  const d = await dashboard(locals.user!, days);
  const table = url.searchParams.get('table');
  const rows: (string | number | null)[][] =
    table === 'orders' ? [['order', 'title', 'views', 'pdf opens'], ...d.topOrders.map((o) => [o.id, o.title, o.views, o.opens])]
    : table === 'searches' ? [['search', 'times', 'found nothing'], ...d.searches.map((s) => [s.term, s.count, s.zero])]
    : table === 'districts' ? [['district', 'hub page views', 'article views', 'posts this month'], ...d.districtsCompared.map((x) => [x.name, x.hub, x.articles, x.postsThisMonth])]
    : [['post', 'title', 'district', 'views', 'reads', 'shares'], ...d.topPosts.map((p) => [p.id, p.title, p.district, p.views, p.reads, p.shares])];
  return new Response(`﻿${toCsv(rows)}`, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="analytics-${table ?? 'posts'}-${d.range.from}-${d.range.to}.csv"` },
  });
};
