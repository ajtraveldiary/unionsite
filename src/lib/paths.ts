// Static path lists shared by the Malayalam and English page files.
import { allOrders, allPosts, sortedDistricts } from './content';
import { magazineIssues } from '~/data/site';

export const orderPaths = () => allOrders().map((o) => ({ params: { order: `${o.id}-${o.slug}` }, props: { id: o.id } }));
export const postPaths = () => allPosts().map((p) => ({ params: { year: p.date.slice(0, 4), slug: p.slug }, props: { id: p.id } }));
export const districtPaths = () => sortedDistricts().map((d) => ({ params: { district: d.slug }, props: { slug: d.slug } }));
export const issuePaths = () =>
  magazineIssues.map((i) => ({ params: { year: String(i.year), month: String(i.month).padStart(2, '0') }, props: { year: i.year, month: i.month } }));
