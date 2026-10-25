import type { APIRoute } from 'astro';
import { body, handle, userOf } from '~/lib/admin/api';
import { saveIssue } from '~/lib/admin/issues';

// The Kerala Service screen's "Add an issue" (src/lib/admin/issues.ts has the rules; state roles only):
//   POST /api/admin/issues { issue: { year, month, pdfMediaId, coverMediaId, pageCount, toc }, publish } → { id }
export const prerender = false;

export const POST: APIRoute = (ctx) =>
  handle(async () => {
    const b = await body(ctx);
    const issue = b.issue && typeof b.issue === 'object' ? (b.issue as Record<string, unknown>) : {};
    return { id: await saveIssue(userOf(ctx), null, { ...issue, year: issue.year, month: issue.month }, b.publish === true ? 'published' : 'draft') };
  });
