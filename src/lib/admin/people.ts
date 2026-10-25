// People and committees in the admin (plan, sections 5 and 10; approved wireframe "People &
// committees"). One record per person, reused when they move to another post or committee.
// A committee is the state committee, the women's sub-committee, a district committee or an area
// committee. Its `published` rows are what the site shows; `draft` rows are additions waiting for
// approval or the next term being prepared ("Start new term" copies the committee); publishing a
// new term turns the old rows into `past`, kept as history. State roles manage every committee,
// district roles their own district's (district editors add drafts only).
import { and, asc, count, desc, eq, inArray, isNull, like, or, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { getDb } from '~/db/client';
import { areaCommittees, media, people, positions, POSITION_ROLES, type PositionRole } from '~/db/schema';
import { purgeTags } from '~/lib/cache';
import { fileUrl } from '~/lib/content';
import { districtBySlug } from '~/data/districts';
import { roleLabels } from '~/data/site';
import { audit } from './audit';
import { AdminError, purge } from './publish';
import { isState, type AdminUser } from './roles';

export type BodyKind = 'state' | 'women_subcommittee' | 'district' | 'area';
export interface CommitteeKey { body: BodyKind; district: string | null; area: number | null }

/** Roles offered for each kind of committee, in the order the site lists them */
export const ROLE_ORDER: Record<BodyKind, PositionRole[]> = {
  state: ['president', 'general_secretary', 'treasurer', 'vice_president', 'secretary', 'secretariat_member', 'committee_member'],
  women_subcommittee: ['convener', 'joint_convener', 'member'],
  district: ['president', 'secretary', 'treasurer', 'vice_president', 'joint_secretary', 'committee_member'],
  area: ['president', 'secretary', 'treasurer', 'vice_president', 'joint_secretary', 'committee_member'],
};
export const roleLabel = (r: PositionRole) => roleLabels[r]?.en ?? r;

/** "state", "women", "district:kollam", "area:12" ↔ a committee */
export function parseKey(s: string | null | undefined): CommitteeKey | null {
  if (!s || s === 'state') return { body: 'state', district: null, area: null };
  if (s === 'women') return { body: 'women_subcommittee', district: null, area: null };
  const [kind, v] = s.split(':');
  if (kind === 'district' && districtBySlug[v]) return { body: 'district', district: v, area: null };
  if (kind === 'area' && Number(v) > 0) return { body: 'area', district: null, area: Number(v) };
  return null;
}
export const keyString = (k: CommitteeKey) => (k.body === 'state' ? 'state' : k.body === 'women_subcommittee' ? 'women' : k.body === 'district' ? `district:${k.district}` : `area:${k.area}`);

type Db = Awaited<ReturnType<typeof getDb>>;

/** The area committee's district, filled in so permissions can be checked */
async function resolve(db: Db, k: CommitteeKey): Promise<CommitteeKey & { name: string }> {
  if (k.body === 'area') {
    const a = await db.select({ district: areaCommittees.district, name: areaCommittees.nameEn, ml: areaCommittees.nameMl }).from(areaCommittees).where(eq(areaCommittees.id, k.area!)).get();
    if (!a) throw new AdminError('That area committee could not be found.', 404);
    return { ...k, district: a.district, name: `${a.name || a.ml} area committee` };
  }
  if (k.body === 'district') return { ...k, name: `${districtBySlug[k.district!].name.en} district committee` };
  return { ...k, name: k.body === 'state' ? 'State committee' : 'Women’s sub-committee' };
}

/** Who may work on this committee: state roles all; district roles their own district's */
function mayEdit(user: AdminUser, k: CommitteeKey) {
  if (isState(user)) return true;
  return (k.body === 'district' || k.body === 'area') && !!k.district && k.district === user.district;
}
const mayApprove = (user: AdminUser, k: CommitteeKey) => mayEdit(user, k) && user.role !== 'district_editor';

const whereCommittee = (k: CommitteeKey) => and(
  eq(positions.body, k.body),
  k.body === 'district' ? eq(positions.district, k.district!) : k.body === 'area' ? undefined : isNull(positions.district),
  k.body === 'area' ? eq(positions.areaCommitteeId, k.area!) : isNull(positions.areaCommitteeId),
);

export interface Member {
  positionId: number;
  personId: number;
  nameMl: string;
  nameEn: string;
  photo: string | null;
  photoMediaId: number | null;
  department: string | null;
  phone: string | null;
  role: PositionRole;
  status: 'draft' | 'published' | 'past';
  term: string | null;
  sortOrder: number;
}

/** The picker's committees this person may open */
export async function committeeChoices(user: AdminUser) {
  const db = await getDb();
  const districts = Object.values(districtBySlug).sort((a, b) => a.sortOrder - b.sortOrder).filter((d) => isState(user) || d.slug === user.district);
  const areas = await db.select({ id: areaCommittees.id, district: areaCommittees.district, nameEn: areaCommittees.nameEn, nameMl: areaCommittees.nameMl })
    .from(areaCommittees).where(isState(user) ? undefined : eq(areaCommittees.district, user.district ?? '')).orderBy(asc(areaCommittees.district), asc(areaCommittees.sortOrder));
  return [
    ...(isState(user) ? [{ key: 'state', label: 'State committee' }, { key: 'women', label: 'Women’s sub-committee' }] : []),
    ...districts.map((d) => ({ key: `district:${d.slug}`, label: `${d.name.en} district committee` })),
    ...areas.map((a) => ({ key: `area:${a.id}`, label: `${districtBySlug[a.district]?.name.en}: ${a.nameEn || a.nameMl} area` })),
  ];
}

/** One committee: who is on the site now, the drafts, and past terms */
export async function loadCommittee(user: AdminUser, raw: CommitteeKey) {
  const db = await getDb();
  const k = await resolve(db, raw);
  if (!mayEdit(user, k)) throw new AdminError('You can only manage your own district’s committees.', 403);
  const rows = await db
    .select({
      positionId: positions.id, personId: people.id, nameMl: people.nameMl, nameEn: people.nameEn, photoMediaId: people.photoMediaId,
      r2Key: media.r2Key, src: media.sourceUrl, department: people.department, phone: people.phone, role: positions.role, status: positions.status,
      term: positions.term, sortOrder: positions.sortOrder,
    })
    .from(positions).innerJoin(people, eq(people.id, positions.personId)).leftJoin(media, eq(media.id, people.photoMediaId))
    .where(and(whereCommittee(k), inArray(positions.status, ['draft', 'published'])))
    .orderBy(asc(positions.sortOrder), asc(positions.id));
  const members: Member[] = rows.map(({ r2Key, src, ...r }) => ({ ...r, photo: fileUrl(r2Key, src) ?? null }));
  const past = await db.select({ term: positions.term, n: count() }).from(positions).where(and(whereCommittee(k), eq(positions.status, 'past'))).groupBy(positions.term).orderBy(desc(sql`max(${positions.updatedAt})`));
  const current = members.filter((m) => m.status === 'published');
  const drafts = members.filter((m) => m.status === 'draft');
  const currentTerm = current.find((m) => m.term)?.term ?? null;
  // Drafts under another term's name are the next committee being prepared
  const nextTerm = drafts.find((m) => m.term && m.term !== currentTerm)?.term ?? null;
  return { key: k, keyString: keyString(k), current, drafts, currentTerm, nextTerm, past, canApprove: mayApprove(user, k), roles: ROLE_ORDER[k.body] };
}

// ── People ──────────────────────────────────────────────────────────────────────────────

/** People already on the site whose name contains `q` (to reuse instead of typing twice) */
export async function findPeople(q: string) {
  const term = q.trim();
  if (term.length < 2) return [];
  const db = await getDb();
  return db.select({ id: people.id, nameMl: people.nameMl, nameEn: people.nameEn, department: people.department })
    .from(people).where(or(like(people.nameMl, `%${term}%`), like(people.nameEn, `%${term}%`))).orderBy(asc(people.nameEn)).limit(10);
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** A person's details from the form: names, department, office, phone (only if they agreed), photo */
function personFields(input: Record<string, unknown>) {
  const nameMl = str(input.nameMl, 120);
  if (!nameMl) throw new AdminError('Type the name in Malayalam.');
  const phone = str(input.phone, 20);
  if (phone && !/^[+\d][\d\s-]{5,}$/.test(phone)) throw new AdminError('The phone number could not be read.');
  const photo = Number(input.photoMediaId);
  return {
    nameMl, nameEn: str(input.nameEn, 120), department: str(input.department, 120) || null, office: str(input.office, 120) || null,
    phone: phone || null, photoMediaId: Number.isInteger(photo) && photo > 0 ? photo : null,
  };
}

/** Every page that lists people carries the one `people` tag (About, State committee, district hubs) */
async function touched(_k: CommitteeKey) {
  await purge(purgeTags.people());
}

/** Adds someone to a committee: a person already on the site, or a new one. District editors add drafts. */
export async function addMember(user: AdminUser, raw: CommitteeKey, input: Record<string, unknown>) {
  const db = await getDb();
  const k = await resolve(db, raw);
  if (!mayEdit(user, k)) throw new AdminError('You can only manage your own district’s committees.', 403);
  const role = String(input.role) as PositionRole;
  if (!POSITION_ROLES.includes(role)) throw new AdminError('Choose a role.');
  let personId = Number(input.personId);
  if (!(Number.isInteger(personId) && personId > 0)) {
    const row = await db.insert(people).values({ ...personFields(input), createdBy: user.id, updatedBy: user.id }).returning({ id: people.id }).get();
    personId = row.id;
  } else if (!(await db.select({ id: people.id }).from(people).where(eq(people.id, personId)).get())) {
    throw new AdminError('That person could not be found.');
  }
  // Into the next term when one is being prepared and asked for; otherwise straight onto the site (or a draft, for editors)
  const c = await loadCommittee(user, raw);
  const toNext = input.target === 'next' && !!c.nextTerm;
  const status = toNext || !mayApprove(user, k) ? 'draft' : 'published';
  const term = toNext ? c.nextTerm : c.currentTerm;
  const last = await db.select({ n: sql<number>`coalesce(max(${positions.sortOrder}), 0)` }).from(positions).where(and(whereCommittee(k), eq(positions.status, status))).get();
  // Keep the role order: a new president goes above the members, not at the bottom
  const order = ROLE_ORDER[k.body].indexOf(role);
  const sameOrLater = [...c.current, ...c.drafts].filter((m) => m.status === status && ROLE_ORDER[k.body].indexOf(m.role) > order);
  let sortOrder = (last?.n ?? 0) + 1;
  if (sameOrLater.length) {
    sortOrder = Math.min(...sameOrLater.map((m) => m.sortOrder));
    await db.update(positions).set({ sortOrder: sql`${positions.sortOrder} + 1` }).where(and(whereCommittee(k), eq(positions.status, status), sql`${positions.sortOrder} >= ${sortOrder}`));
  }
  await db.insert(positions).values({ personId, body: k.body, district: k.district, areaCommitteeId: k.area, role, sortOrder, term, status, createdBy: user.id, updatedBy: user.id });
  if (status === 'published') await touched(k);
  const p = await db.select({ name: people.nameMl }).from(people).where(eq(people.id, personId)).get();
  await audit(user, status === 'published' ? 'add_member' : 'propose_member', 'committee', null, { district: k.district, summary: `${p?.name} · ${roleLabel(role)} · ${k.name}` });
}

async function position(db: Db, user: AdminUser, positionId: number) {
  const pos = await db.select({ id: positions.id, body: positions.body, district: positions.district, area: positions.areaCommitteeId, status: positions.status, personId: positions.personId, role: positions.role, sortOrder: positions.sortOrder })
    .from(positions).where(eq(positions.id, positionId)).get();
  if (!pos) throw new AdminError('That entry could not be found.', 404);
  const k = await resolve(db, { body: pos.body, district: pos.district, area: pos.area });
  if (!mayEdit(user, k)) throw new AdminError('You can only manage your own district’s committees.', 403);
  if (user.role === 'district_editor' && pos.status !== 'draft') throw new AdminError('Your district admin changes the committee on the site. Add a draft instead.', 403);
  return { pos, k };
}

/** Saves a person's details and their role in this committee */
export async function updateMember(user: AdminUser, positionId: number, input: Record<string, unknown>) {
  const db = await getDb();
  const { pos, k } = await position(db, user, positionId);
  const role = String(input.role) as PositionRole;
  if (!POSITION_ROLES.includes(role)) throw new AdminError('Choose a role.');
  await db.update(people).set({ ...personFields(input), updatedBy: user.id, updatedAt: sql`(datetime('now'))` }).where(eq(people.id, pos.personId));
  await db.update(positions).set({ role, updatedBy: user.id, updatedAt: sql`(datetime('now'))` }).where(eq(positions.id, positionId));
  if (pos.status === 'published') await touched(k);
  await audit(user, 'update_member', 'committee', null, { district: k.district, summary: `${str(input.nameMl, 120)} · ${roleLabel(role)} · ${k.name}` });
}

/** Up or down one place within its list */
export async function moveMember(user: AdminUser, positionId: number, dir: 'up' | 'down') {
  const db = await getDb();
  const { pos, k } = await position(db, user, positionId);
  const list = await db.select({ id: positions.id, sortOrder: positions.sortOrder }).from(positions)
    .where(and(whereCommittee(k), eq(positions.status, pos.status))).orderBy(asc(positions.sortOrder), asc(positions.id));
  const i = list.findIndex((r) => r.id === positionId);
  const j = dir === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  const updates: BatchItem<'sqlite'>[] = list.map((r, n) => db.update(positions).set({ sortOrder: n + 1 }).where(eq(positions.id, r.id)));
  await db.batch(updates as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
  if (pos.status === 'published') await touched(k);
}

/** Off the committee: a draft is dropped; someone on the site moves to past (kept as history) */
export async function removeMember(user: AdminUser, positionId: number) {
  const db = await getDb();
  const { pos, k } = await position(db, user, positionId);
  if (pos.status === 'draft') await db.delete(positions).where(eq(positions.id, positionId));
  else {
    if (!mayApprove(user, k)) throw new AdminError('Your district admin changes the committee on the site.', 403);
    await db.update(positions).set({ status: 'past', updatedBy: user.id, updatedAt: sql`(datetime('now'))` }).where(eq(positions.id, positionId));
    await touched(k);
  }
  await audit(user, 'remove_member', 'committee', null, { district: k.district, summary: `${roleLabel(pos.role)} · ${k.name}` });
}

/** Approves one draft: it joins the committee on the site */
export async function publishMember(user: AdminUser, positionId: number) {
  const db = await getDb();
  const { pos, k } = await position(db, user, positionId);
  if (!mayApprove(user, k)) throw new AdminError('Your district admin approves additions.', 403);
  if (pos.status !== 'draft') return;
  const c = await loadCommittee(user, { body: k.body, district: k.body === 'area' ? null : k.district, area: k.area });
  await db.update(positions).set({ status: 'published', term: c.currentTerm, updatedBy: user.id, updatedAt: sql`(datetime('now'))` }).where(eq(positions.id, positionId));
  await touched(k);
  await audit(user, 'approve_member', 'committee', null, { district: k.district, summary: `${roleLabel(pos.role)} · ${k.name}` });
}

/** Copies the committee as drafts for the next term, named e.g. "64th state conference" */
export async function startTerm(user: AdminUser, raw: CommitteeKey, label: string) {
  const db = await getDb();
  const c = await loadCommittee(user, raw);
  if (!c.canApprove) throw new AdminError('Your district admin starts a new term.', 403);
  const term = str(label, 60);
  if (!term) throw new AdminError('Name the new term, e.g. “64th state conference” or “2026–2029”.');
  if (term === c.currentTerm) throw new AdminError('That is the current term’s name. Give the new term another.');
  if (c.nextTerm) throw new AdminError(`A new term (“${c.nextTerm}”) is already being prepared.`);
  if (c.current.length) {
    const copies: BatchItem<'sqlite'>[] = c.current.map((m) => db.insert(positions).values({
      personId: m.personId, body: c.key.body, district: c.key.district, areaCommitteeId: c.key.area, role: m.role, sortOrder: m.sortOrder, term, status: 'draft', createdBy: user.id, updatedBy: user.id,
    }));
    await db.batch(copies as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
  }
  await audit(user, 'start_term', 'committee', null, { district: c.key.district, summary: `${c.key.name}: ${term}` });
}

/** Publishes the prepared term: it replaces the committee on the site, and the old one becomes history */
export async function publishTerm(user: AdminUser, raw: CommitteeKey) {
  const db = await getDb();
  const c = await loadCommittee(user, raw);
  if (!c.canApprove) throw new AdminError('Your district admin publishes the new term.', 403);
  if (!c.nextTerm) throw new AdminError('No new term is being prepared.');
  const ids = c.drafts.filter((m) => m.term === c.nextTerm).map((m) => m.positionId);
  if (!ids.length) throw new AdminError('The new term has nobody in it yet.');
  await db.update(positions).set({ status: 'past', updatedAt: sql`(datetime('now'))` }).where(and(whereCommittee(c.key), eq(positions.status, 'published')));
  await db.update(positions).set({ status: 'published', updatedBy: user.id, updatedAt: sql`(datetime('now'))` }).where(inArray(positions.id, ids));
  await touched(c.key);
  await audit(user, 'publish_term', 'committee', null, { district: c.key.district, summary: `${c.key.name}: ${c.nextTerm}` });
}

/** A past term's members, for the history list */
export async function pastTerm(user: AdminUser, raw: CommitteeKey, term: string | null) {
  const db = await getDb();
  const k = await resolve(db, raw);
  if (!mayEdit(user, k)) throw new AdminError('Not found.', 404);
  return db.select({ nameMl: people.nameMl, nameEn: people.nameEn, role: positions.role })
    .from(positions).innerJoin(people, eq(people.id, positions.personId))
    .where(and(whereCommittee(k), eq(positions.status, 'past'), term ? eq(positions.term, term) : isNull(positions.term)))
    .orderBy(asc(positions.sortOrder));
}
