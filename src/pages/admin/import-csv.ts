import type { APIRoute } from 'astro';
import { jobLog } from '~/lib/admin/import';
import { toCsv } from '~/lib/admin/analytics';

// GET /admin/import-csv?job=: one import run's report, a line per post
export const prerender = false;

export const GET: APIRoute = async ({ locals, url }) => {
  if (locals.user?.role !== 'super_admin') return new Response(null, { status: 403 });
  const r = await jobLog(locals.user, Number(url.searchParams.get('job')));
  if (!r) return new Response(null, { status: 404 });
  const csv = toCsv([['outcome', 'wordpress id', 'post id', 'title', 'note'], ...r.rows.map((x) => [x.outcome, x.wpId, x.id, x.title, x.note])]);
  return new Response(`﻿${csv}`, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="import-${r.job.id}.csv"` } });
};
