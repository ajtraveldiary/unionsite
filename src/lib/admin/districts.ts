// Districts in the admin (plan, section 10; approved wireframe "Districts"). State roles see every
// district and what its page still lacks; a district admin edits their own: the cover photo, the
// history (a page, edited in the page editor), area committees and office addresses. Only office
// phone numbers are published (plan, section 13). A pasted Google Maps link gives the office's map
// pin, so the district page and Contact can offer "Directions". District editors read these screens;
// their district admin changes them.
import { and, asc, count, eq, isNotNull, max, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { getDb } from '~/db/client';
import { areaCommittees, districtExtras, media, offices, pages, positions, posts } from '~/db/schema';
import { purgeTags } from '~/lib/cache';
import { fileUrl } from '~/lib/content';
import { districtBySlug, districts } from '~/data/districts';
import { audit } from './audit';
import { AdminError, purge } from './publish';
import { isState, type AdminUser } from './roles';

export const mayView = (user: AdminUser, slug: string) => isState(user) || user.district === slug;
export const mayChange = (user: AdminUser, slug: string) => mayView(user, slug) && user.role !== 'district_editor';

function mustChange(user: AdminUser, slug: string) {
  if (!districtBySlug[slug]) throw new AdminError('Unknown district.', 404);
  if (!mayView(user, slug)) throw new AdminError('You can only manage your own district.', 403);
  if (!mayChange(user, slug)) throw new AdminError('Your district admin changes the district page.', 403);
}

/** Every district at a glance, for the state office: what each page still lacks */
export async function districtOverview() {
  const db = await getDb();
  const [postRows, bearerRows, officeRows, historyRows] = await Promise.all([
    db.select({ d: posts.district, n: count(), latest: max(posts.publishedAt) }).from(posts).where(and(eq(posts.status, 'published'), isNotNull(posts.district))).groupBy(posts.district),
    db.select({ d: positions.district, n: count() }).from(positions).where(and(eq(positions.body, 'district'), eq(positions.status, 'published'))).groupBy(positions.district),
    db.select({ d: offices.district, n: count() }).from(offices).where(isNotNull(offices.district)).groupBy(offices.district),
    db.select({ d: pages.district, status: pages.status }).from(pages).where(eq(pages.template, 'district_history')),
  ]);
  const by = <T extends { d: string | null }>(rows: T[]) => Object.fromEntries(rows.map((r) => [r.d, r])) as Record<string, T>;
  const p = by(postRows), b = by(bearerRows), o = by(officeRows), h = by(historyRows);
  return [...districts].sort((a, b2) => a.sortOrder - b2.sortOrder).map((d) => ({
    slug: d.slug, name: d.name.en,
    posts: p[d.slug]?.n ?? 0, latest: p[d.slug]?.latest ?? null,
    bearers: b[d.slug]?.n ?? 0, offices: o[d.slug]?.n ?? 0, history: h[d.slug]?.status ?? null,
  }));
}

export interface AreaRow { id: number; nameMl: string; nameEn: string; sortOrder: number; members: number; offices: number }
export interface OfficeRow {
  id: number; kind: 'state' | 'district' | 'area'; areaCommitteeId: number | null; addressMl: string; addressEn: string;
  phone: string; email: string; mapUrl: string; pinned: boolean; sortOrder: number;
}

export async function loadDistrict(user: AdminUser, slug: string) {
  if (!districtBySlug[slug]) return null;
  if (!mayView(user, slug)) throw new AdminError('You can only manage your own district.', 403);
  const db = await getDb();
  const [extra, history, areas, officeRows, counts] = await Promise.all([
    db.select({ coverMediaId: districtExtras.coverMediaId, r2Key: media.r2Key, src: media.sourceUrl }).from(districtExtras).leftJoin(media, eq(media.id, districtExtras.coverMediaId)).where(eq(districtExtras.district, slug)).get(),
    db.select({ id: pages.id, status: pages.status, enSource: pages.enSource, updatedAt: pages.updatedAt, titleMl: pages.titleMl }).from(pages).where(and(eq(pages.template, 'district_history'), eq(pages.district, slug))).get(),
    db.select({ id: areaCommittees.id, nameMl: areaCommittees.nameMl, nameEn: areaCommittees.nameEn, sortOrder: areaCommittees.sortOrder }).from(areaCommittees).where(eq(areaCommittees.district, slug)).orderBy(asc(areaCommittees.sortOrder), asc(areaCommittees.id)),
    db.select().from(offices).where(eq(offices.district, slug)).orderBy(sql`${offices.kind} = 'area'`, asc(offices.sortOrder), asc(offices.id)),
    db.select({ area: positions.areaCommitteeId, n: count() }).from(positions).where(and(eq(positions.body, 'area'), eq(positions.district, slug), eq(positions.status, 'published'))).groupBy(positions.areaCommitteeId),
  ]);
  const members = Object.fromEntries(counts.map((c) => [c.area, c.n]));
  return {
    slug, name: districtBySlug[slug].name.en, canChange: mayChange(user, slug),
    cover: extra?.coverMediaId ? { id: extra.coverMediaId, url: fileUrl(extra.r2Key, extra.src) ?? null } : null,
    history: history ?? null,
    areas: areas.map((a): AreaRow => ({ ...a, members: members[a.id] ?? 0, offices: officeRows.filter((o) => o.areaCommitteeId === a.id).length })),
    offices: officeRows.map((o): OfficeRow => ({
      id: o.id, kind: o.kind, areaCommitteeId: o.areaCommitteeId, addressMl: o.addressMl, addressEn: o.addressEn ?? '', phone: o.phone ?? '', email: o.email ?? '',
      mapUrl: o.mapUrl ?? '', pinned: o.lat != null && o.lng != null, sortOrder: o.sortOrder,
    })),
  };
}

export async function setCover(user: AdminUser, slug: string, mediaId: number | null) {
  mustChange(user, slug);
  const db = await getDb();
  if (mediaId) {
    const m = await db.select({ kind: media.kind }).from(media).where(eq(media.id, mediaId)).get();
    if (m?.kind !== 'image') throw new AdminError('Pick a photo.');
  }
  await db.insert(districtExtras).values({ district: slug, coverMediaId: mediaId, updatedBy: user.id })
    .onConflictDoUpdate({ target: districtExtras.district, set: { coverMediaId: mediaId, updatedBy: user.id, updatedAt: sql`(datetime('now'))` } });
  await audit(user, 'set_cover', 'district', null, { district: slug, summary: mediaId ? 'Cover photo set' : 'Cover photo removed' });
}

// ── Area committees ─────────────────────────────────────────────────────────────────────

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export async function saveArea(user: AdminUser, slug: string, id: number | null, input: Record<string, unknown>) {
  mustChange(user, slug);
  const db = await getDb();
  const nameMl = str(input.nameMl, 120);
  if (!nameMl) throw new AdminError('Type the area committee’s name in Malayalam.');
  const nameEn = str(input.nameEn, 120);
  if (id) {
    const a = await db.select({ district: areaCommittees.district }).from(areaCommittees).where(eq(areaCommittees.id, id)).get();
    if (a?.district !== slug) throw new AdminError('That area committee could not be found.', 404);
    await db.update(areaCommittees).set({ nameMl, nameEn, updatedAt: sql`(datetime('now'))` }).where(eq(areaCommittees.id, id));
  } else {
    const last = await db.select({ n: max(areaCommittees.sortOrder) }).from(areaCommittees).where(eq(areaCommittees.district, slug)).get();
    await db.insert(areaCommittees).values({ district: slug, nameMl, nameEn, sortOrder: (last?.n ?? 0) + 1 });
  }
  await purge([...purgeTags.offices(), ...purgeTags.people()]);
  await audit(user, id ? 'rename_area' : 'add_area', 'district', null, { district: slug, summary: nameMl });
}

/** Removes an area committee that has nobody on it and no office */
export async function deleteArea(user: AdminUser, slug: string, id: number) {
  mustChange(user, slug);
  const db = await getDb();
  const [{ n: people }] = await db.select({ n: count() }).from(positions).where(eq(positions.areaCommitteeId, id));
  const [{ n: offs }] = await db.select({ n: count() }).from(offices).where(eq(offices.areaCommitteeId, id));
  if (people || offs) throw new AdminError('This area committee still has people or an office. Remove those first.');
  await db.delete(areaCommittees).where(and(eq(areaCommittees.id, id), eq(areaCommittees.district, slug)));
  await audit(user, 'delete_area', 'district', null, { district: slug, summary: `Area committee ${id}` });
}

async function reorder(ids: number[], table: typeof areaCommittees | typeof offices) {
  const db = await getDb();
  const updates: BatchItem<'sqlite'>[] = ids.map((id, n) => db.update(table).set({ sortOrder: n + 1 }).where(eq(table.id, id)));
  if (updates.length) await db.batch(updates as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
}

export async function moveArea(user: AdminUser, slug: string, id: number, dir: 'up' | 'down') {
  mustChange(user, slug);
  const d = await loadDistrict(user, slug);
  const ids = d!.areas.map((a) => a.id);
  const i = ids.indexOf(id), j = dir === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await reorder(ids, areaCommittees);
  await purge(purgeTags.offices());
}

// ── Offices ─────────────────────────────────────────────────────────────────────────────

/**
 * A map pin from a pasted Google Maps link: "@9.93,76.26", "?q=9.93,76.26", "!3d9.93!4d76.26" or
 * "ll=". Short links (maps.app.goo.gl) carry no coordinates; they are kept as the Directions link.
 */
export function pinFromLink(url: string): { lat: number; lng: number } | null {
  const pairs = [/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/, /[?&](?:q|query|ll|destination)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/, /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/];
  for (const re of pairs) {
    const m = decodeURIComponent(url).match(re);
    if (m) {
      const lat = Number(m[1]), lng = Number(m[2]);
      // Kerala is roughly 8–13° N, 74–78° E; anything far off is a typo
      if (lat > 7 && lat < 14 && lng > 73 && lng < 79) return { lat, lng };
    }
  }
  return null;
}

export async function saveOffice(user: AdminUser, slug: string, id: number | null, input: Record<string, unknown>) {
  mustChange(user, slug);
  const db = await getDb();
  const addressMl = typeof input.addressMl === 'string' ? input.addressMl.replace(/\r\n/g, '\n').trim().slice(0, 500) : '';
  if (!addressMl) throw new AdminError('Type the address in Malayalam.');
  const kind = input.kind === 'area' ? 'area' : 'district';
  let areaCommitteeId: number | null = null;
  if (kind === 'area') {
    areaCommitteeId = Number(input.areaCommitteeId) || null;
    const a = areaCommitteeId ? await db.select({ district: areaCommittees.district }).from(areaCommittees).where(eq(areaCommittees.id, areaCommitteeId)).get() : null;
    if (a?.district !== slug) throw new AdminError('Choose the area committee.');
  }
  const phone = str(input.phone, 30);
  if (phone && !/^[+\d][\d\s-]{5,}$/.test(phone)) throw new AdminError('The office phone could not be read.');
  const email = str(input.email, 120);
  if (email && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) throw new AdminError('The email address could not be read.');
  const mapUrl = str(input.mapUrl, 500);
  if (mapUrl && !/^https:\/\//i.test(mapUrl)) throw new AdminError('Paste the map link starting with https://');
  const pin = mapUrl ? pinFromLink(mapUrl) : null;
  const values = {
    kind, district: slug, areaCommitteeId, addressMl,
    addressEn: typeof input.addressEn === 'string' ? input.addressEn.replace(/\r\n/g, '\n').trim().slice(0, 500) || null : null,
    phone: phone || null, email: email || null, mapUrl: mapUrl || null,
    lat: pin ? Math.round(pin.lat * 1e6) : null, lng: pin ? Math.round(pin.lng * 1e6) : null, updatedAt: sql`(datetime('now'))`,
  } as const;
  if (id) {
    const o = await db.select({ district: offices.district }).from(offices).where(eq(offices.id, id)).get();
    if (o?.district !== slug) throw new AdminError('That office could not be found.', 404);
    await db.update(offices).set(values).where(eq(offices.id, id));
  } else {
    const last = await db.select({ n: max(offices.sortOrder) }).from(offices).where(eq(offices.district, slug)).get();
    await db.insert(offices).values({ ...values, sortOrder: (last?.n ?? 0) + 1 });
  }
  await purge(purgeTags.offices());
  await audit(user, id ? 'update_office' : 'add_office', 'district', null, { district: slug, summary: addressMl.split('\n')[0] });
  return { pinned: !!pin };
}

export async function deleteOffice(user: AdminUser, slug: string, id: number) {
  mustChange(user, slug);
  const db = await getDb();
  await db.delete(offices).where(and(eq(offices.id, id), eq(offices.district, slug)));
  await purge(purgeTags.offices());
  await audit(user, 'delete_office', 'district', null, { district: slug, summary: `Office ${id}` });
}

export async function moveOffice(user: AdminUser, slug: string, id: number, dir: 'up' | 'down') {
  mustChange(user, slug);
  const d = await loadDistrict(user, slug);
  const ids = d!.offices.map((o) => o.id);
  const i = ids.indexOf(id), j = dir === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await reorder(ids, offices);
  await purge(purgeTags.offices());
}

