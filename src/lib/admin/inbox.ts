// The Inbox (plan, section 10; approved wireframe "Inbox"): messages from the Contact page. State
// roles see every message; a district admin sees those whose sender chose their district. A message
// can be assigned to someone with a note for the team, and marked done. "Reply by email" opens the
// admin's own mail app; the site sends nothing itself. Messages are deleted after the months set
// in Settings (12 by default, plan section 13) by the hourly job.
import { and, count, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { getDb } from '~/db/client';
import { contactMessages, users } from '~/db/schema';
import { audit } from './audit';
import { AdminError } from './publish';
import { isState, type AdminUser } from './roles';
import { inboxSettings } from './settings';

export const mayRead = (user: AdminUser) => user.role !== 'district_editor';
const scope = (user: AdminUser) => (isState(user) ? undefined : eq(contactMessages.district, user.district ?? '__none__'));

export type InboxView = 'new' | 'mine' | 'done' | 'all';

export async function listMessages(user: AdminUser, view: InboxView) {
  if (!mayRead(user)) throw new AdminError('Messages go to the district admin and the state office.', 403);
  const db = await getDb();
  const where = and(scope(user),
    view === 'new' ? inArray(contactMessages.status, ['new', 'assigned']) : view === 'done' ? eq(contactMessages.status, 'done') : view === 'mine' ? and(eq(contactMessages.assignedTo, user.id), inArray(contactMessages.status, ['new', 'assigned'])) : undefined);
  return db.select({ id: contactMessages.id, name: contactMessages.name, topic: contactMessages.topic, district: contactMessages.district, status: contactMessages.status, createdAt: contactMessages.createdAt, assignee: users.name, preview: sql<string>`substr(${contactMessages.message}, 1, 120)` })
    .from(contactMessages).leftJoin(users, eq(users.id, contactMessages.assignedTo))
    .where(where).orderBy(desc(contactMessages.createdAt), desc(contactMessages.id)).limit(60);
}

export async function inboxCounts(user: AdminUser) {
  if (!mayRead(user)) return { open: 0, mine: 0 };
  const db = await getDb();
  const [[open], [mine]] = await Promise.all([
    db.select({ n: count() }).from(contactMessages).where(and(scope(user), eq(contactMessages.status, 'new'))),
    db.select({ n: count() }).from(contactMessages).where(and(scope(user), eq(contactMessages.assignedTo, user.id), eq(contactMessages.status, 'assigned'))),
  ]);
  return { open: open.n, mine: mine.n };
}

export async function loadMessage(user: AdminUser, id: number) {
  if (!mayRead(user)) return null;
  const db = await getDb();
  const m = await db.select().from(contactMessages).where(and(eq(contactMessages.id, id), scope(user))).get();
  return m ?? null;
}

/** People a message can be assigned to: the state office, and that district's admin */
export async function assignees(district: string | null) {
  const db = await getDb();
  return db.select({ id: users.id, name: users.name, role: users.role, district: users.district }).from(users)
    .where(and(eq(users.active, true), or(inArray(users.role, ['super_admin', 'state_editor']), district ? and(eq(users.role, 'district_admin'), eq(users.district, district)) : sql`0`)))
    .orderBy(users.name);
}

export async function updateMessage(user: AdminUser, id: number, change: { assignTo?: number | null; note?: string; done?: boolean }) {
  const m = await loadMessage(user, id);
  if (!m) throw new AdminError('That message could not be found.', 404);
  const db = await getDb();
  const set: Partial<typeof contactMessages.$inferInsert> = { updatedAt: sql`(datetime('now'))` as unknown as string };
  if (change.assignTo !== undefined) {
    if (change.assignTo && !(await assignees(m.district)).some((a) => a.id === change.assignTo)) throw new AdminError('That person can’t be given this message.');
    set.assignedTo = change.assignTo;
    if (m.status !== 'done') set.status = change.assignTo ? 'assigned' : 'new';
  }
  if (change.note !== undefined) set.note = change.note.trim().slice(0, 500) || null;
  if (change.done !== undefined) {
    set.status = change.done ? 'done' : (set.assignedTo ?? m.assignedTo) ? 'assigned' : 'new';
    set.doneAt = change.done ? new Date().toISOString().replace('T', ' ').slice(0, 19) : null;
  }
  await db.update(contactMessages).set(set).where(eq(contactMessages.id, id));
  await audit(user, change.done === true ? 'message_done' : change.done === false ? 'message_reopen' : 'message_assign', 'message', id, { district: m.district, summary: `${m.topic} from ${m.name}` });
}

/** Deletes messages older than the months set in Settings (plan, section 13); run by the hourly job */
export async function deleteOldMessages() {
  const { keepMonths } = await inboxSettings();
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - keepMonths);
  const db = await getDb();
  const old = cutoff.toISOString().replace('T', ' ').slice(0, 19);
  const [{ n }] = await db.select({ n: count() }).from(contactMessages).where(lt(contactMessages.createdAt, old));
  if (n) {
    await db.delete(contactMessages).where(lt(contactMessages.createdAt, old));
    await audit(null, 'messages_expired', 'message', null, { summary: `${n} messages older than ${keepMonths} months deleted` });
  }
  return n;
}

