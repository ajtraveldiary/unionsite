// Labels for the organisation's documents (Admin → Pages & documents), shared by the Documents
// list and each document's page.
import type { UnionDocument } from './types';
import { formatKb } from './i18n';

export const DOC_KIND_LABELS: Record<UnionDocument['kind'], string> = { bye_law: 'Bye-Law', resolution: 'Resolution', jubilee: 'Jubilee', other: 'Document' };

/** "PDF · 24 pages · 1.2 MB" */
export const docMeta = (d: UnionDocument) =>
  ['PDF', d.pages && `${d.pages} ${d.pages === 1 ? 'page' : 'pages'}`, d.kb && formatKb(d.kb)].filter(Boolean).join(' · ');
