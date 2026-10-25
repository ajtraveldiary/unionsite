// Article bodies (plan, section 5: "body (TipTap JSON)"). Crawled posts store a plain list of
// paragraphs; posts written in the admin's editor store TipTap's JSON. Pages render both through
// renderBody(), which builds HTML from an allow-list of nodes and marks and escapes all text, so
// nothing pasted into the editor can put markup or scripts on the site. Plain functions with no
// imports: the seed script (Node) and the admin's browser code use them too.

export interface RichMark {
  type: string;
  attrs?: Record<string, unknown>;
}
export interface RichNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RichNode[];
  text?: string;
  marks?: RichMark[];
}
export interface RichDoc {
  type: 'doc';
  content: RichNode[];
}
/** A list of paragraphs (crawled posts) or TipTap JSON (written in the editor) */
export type Body = string[] | RichDoc;

export const isRich = (b: Body | null | undefined): b is RichDoc => !!b && !Array.isArray(b) && b.type === 'doc';

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

/** Web, mail and phone links, and paths on this site; anything else (javascript:, data:) is dropped */
export function safeUrl(u: unknown): string | null {
  if (typeof u !== 'string') return null;
  const s = u.trim();
  if (/^(https?:|mailto:|tel:)/i.test(s)) return s;
  if (s.startsWith('/') && !s.startsWith('//')) return s;
  return null;
}

function renderText(n: RichNode) {
  let html = esc(n.text ?? '');
  for (const m of n.marks ?? []) {
    if (m.type === 'bold') html = `<strong>${html}</strong>`;
    else if (m.type === 'italic') html = `<em>${html}</em>`;
    else if (m.type === 'underline') html = `<u>${html}</u>`;
    else if (m.type === 'strike') html = `<s>${html}</s>`;
    else if (m.type === 'link') {
      const url = safeUrl(m.attrs?.href);
      if (url) html = `<a href="${esc(url)}"${/^https?:/i.test(url) ? ' rel="noopener"' : ''}>${html}</a>`;
    }
  }
  return html;
}

const children = (n: RichNode) => (n.content ?? []).map(renderNode).join('');

function renderNode(n: RichNode): string {
  switch (n.type) {
    case 'text': return renderText(n);
    case 'paragraph': {
      const inner = children(n);
      return inner.trim() ? `<p>${inner}</p>` : '';
    }
    case 'heading': {
      // The page title is the only h1; headings in the text are h2 or h3
      const level = Number(n.attrs?.level) >= 3 ? 3 : 2;
      return `<h${level}>${children(n)}</h${level}>`;
    }
    case 'bulletList': return `<ul>${children(n)}</ul>`;
    case 'orderedList': {
      const start = Number(n.attrs?.start);
      return `<ol${start > 1 ? ` start="${start}"` : ''}>${children(n)}</ol>`;
    }
    case 'listItem': return `<li>${children(n)}</li>`;
    case 'blockquote': return `<blockquote>${children(n)}</blockquote>`;
    case 'hardBreak': return '<br>';
    case 'horizontalRule': return '<hr>';
    case 'image': {
      const src = safeUrl(n.attrs?.src);
      if (!src) return '';
      const alt = typeof n.attrs?.alt === 'string' ? n.attrs.alt : '';
      const caption = typeof n.attrs?.title === 'string' ? n.attrs.title : '';
      return `<figure><img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async">${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}</figure>`;
    }
    default: return children(n);
  }
}

/** HTML for an article body, whichever way it is stored */
export function renderBody(body: Body | null | undefined): string {
  if (!body) return '';
  if (isRich(body)) return body.content.map(renderNode).join('');
  return body.map((p) => `<p>${esc(p)}</p>`).join('');
}

function textOf(n: RichNode): string {
  if (n.type === 'text') return n.text ?? '';
  if (n.type === 'hardBreak') return ' ';
  return (n.content ?? []).map(textOf).join('');
}

/** The body as plain-text blocks (one per paragraph, heading or list item), for search and reading time */
export function bodyText(body: Body | null | undefined): string[] {
  if (!body) return [];
  if (!isRich(body)) return body;
  const out: string[] = [];
  const walk = (n: RichNode) => {
    if (n.type === 'paragraph' || n.type === 'heading') {
      const s = textOf(n).trim();
      if (s) out.push(s);
    } else if (n.type === 'image') {
      const alt = typeof n.attrs?.alt === 'string' ? n.attrs.alt.trim() : '';
      if (alt) out.push(alt);
    } else (n.content ?? []).forEach(walk);
  };
  body.content.forEach(walk);
  return out;
}

/** A crawled post's paragraphs as an editor document, so old posts open in the editor */
export function toRichDoc(body: Body | null | undefined): RichDoc {
  if (isRich(body)) return body;
  const paras = body ?? [];
  return {
    type: 'doc',
    content: paras.length ? paras.map((p) => ({ type: 'paragraph', content: [{ type: 'text', text: p }] })) : [{ type: 'paragraph' }],
  };
}

export const isEmptyBody = (body: Body | null | undefined) => bodyText(body).join('').trim() === '';
