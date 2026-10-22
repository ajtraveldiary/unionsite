// Addresses of content pages (Malayalam; the English page adds /en). Plain functions with no
// imports, so the seed script (Node) and the site share them.
export const postPath = (p: { date: string; slug: string }) => `/news/${p.date.slice(0, 4)}/${p.slug}`;
export const orderPath = (o: { id: number; slug: string }) => `/orders/${o.id}-${o.slug}`;
export const issuePath = (year: number, month: number) => `/kerala-service/${year}/${String(month).padStart(2, '0')}`;
