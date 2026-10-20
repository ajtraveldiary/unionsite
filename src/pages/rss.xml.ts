import type { APIRoute } from 'astro';
import { allPosts, postPath } from '~/lib/content';
import { site } from '~/data/site';

export const prerender = true;

const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

export const GET: APIRoute = ({ site: base }) => {
  const items = allPosts().slice(0, 30).map((p) => {
    const url = new URL(postPath(p), base).toString();
    return `<item><title>${esc(p.title.ml)}</title><link>${url}</link><guid>${url}</guid><pubDate>${new Date(`${p.date}T12:00:00+05:30`).toUTCString()}</pubDate><description>${esc(p.summary.ml)}</description></item>`;
  });
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(site.name.ml)}</title><link>${base}</link><description>Kerala NGO Union news</description><language>ml</language>${items.join('')}</channel></rss>`;
  return new Response(xml, { headers: { 'content-type': 'application/rss+xml; charset=utf-8' } });
};
