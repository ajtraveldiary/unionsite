// The audit log (plan, section 5): one row for every sign-in, create, edit, publish and delete,
// with the item's district so district admins can read their own district's log.
import { and, desc, eq, gte, inArray, isNull, like, lt, or } from 'drizzle-orm';
import { getDb } from '~/db/client';
import { auditLog, users } from '~/db/schema';
import type { AdminUser } from './roles';

interface Details {
  district?: string | null;
  /** One line for the log, usually the item's title */
  summary?: string;
  /** Fields that changed: { field: [before, after] } */
  diff?: Record<string, [unknown, unknown]>;
}

export async function audit(user: AdminUser | null, action: string, entity: string, entityId: number | null, details: Details = {}) {
  const db = await getDb();
  await db.insert(auditLog).values({
    userId: user?.id ?? null,
    action,
    entity,
    entityId,
    district: details.district ?? null,
    summary: details.summary?.slice(0, 300) ?? null,
    diff: details.diff && Object.keys(details.diff).length ? details.diff : null,
  });
}

/** The latest entries this person may read: everything for state roles, their district for district admins */
export async function recentActivity(user: AdminUser, limit = 8) {
  const db = await getDb();
  const state = user.role === 'super_admin' || user.role === 'state_editor';
  return db
    .select({ id: auditLog.id, action: auditLog.action, entity: auditLog.entity, entityId: auditLog.entityId, summary: auditLog.summary, at: auditLog.at, by: users.name })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.userId))
    .where(state ? undefined : eq(auditLog.district, user.district ?? '__none__'))
    .orderBy(desc(auditLog.at), desc(auditLog.id))
    .limit(limit);
}

/** How the log names an action */
export const actionLabels: Record<string, string> = {
  login: 'signed in', create: 'started', update: 'updated', publish: 'published', schedule: 'scheduled', submit: 'sent for review',
  unpublish: 'took off the site', archive: 'archived', restore: 'restored', send_back: 'sent back', discard: 'discarded changes to',
  approve_english: 'approved the English of', request_home: 'asked for the home page:', restore_version: 'restored an earlier version of',
  set_banner: 'put in the home banner:', upload: 'uploaded', describe: 'described a photo:',
  invite_user: 'invited', update_user: 'changed the role of', switch_on: 'switched on', switch_off: 'switched off', settings: 'changed settings:', add_term: 'added to the glossary:', update_term: 'changed the glossary:', delete_term: 'removed a glossary term',
  message_assign: 'assigned a message:', message_done: 'answered a message:', message_reopen: 'reopened a message:', messages_expired: 'deleted old messages:', add_member: 'added', update_member: 'changed', remove_member: 'removed', approve_member: 'approved', start_term: 'started a new term:', publish_term: 'published the new term:', propose_member: 'proposed', add_area: 'added an area committee:', rename_area: 'renamed an area committee:', delete_area: 'removed an area committee', add_office: 'added an office:', update_office: 'changed an office:', delete_office: 'removed an office', set_cover: 'set the district cover:', replace: 'replaced a file:', delete: 'deleted', add_video: 'added a video:', hide_video: 'hid a video', show_video: 'showed a video', sync_videos: 'synced the channel:', import: 'ran an import:', publish_scheduled: 'published (as scheduled)',
  remove_banner: 'removed the home banner', edit_banner: 'changed the banner headline:', set_lead: 'made the lead story:', clear_lead: 'cleared the lead story', decline_home: 'declined a home page request:',
  link_report: 'linked the report of', unlink_report: 'unlinked the report of',
};

// ── The Audit log screen ─────────────────────────────────────────────────────────────────

/** The kinds of change the screen filters by, as groups of actions */
export const KINDS: Record<string, { label: string; actions: string[] }> = {
  published: { label: 'Published', actions: ['publish', 'publish_scheduled', 'schedule', 'publish_term', 'set_banner', 'approve_member', 'add_member'] },
  edited: { label: 'Edited', actions: ['create', 'update', 'restore', 'restore_version', 'update_member', 'rename_area', 'add_area', 'update_office', 'add_office', 'link_report', 'edit_banner', 'set_lead', 'upload', 'describe', 'replace', 'start_term'] },
  deleted: { label: 'Removed or archived', actions: ['archive', 'unpublish', 'delete', 'delete_area', 'delete_office', 'remove_member', 'remove_banner', 'discard', 'send_back', 'messages_expired'] },
  english: { label: 'English approved', actions: ['approve_english'] },
  users: { label: 'Users and roles', actions: ['invite_user', 'update_user', 'switch_on', 'switch_off'] },
  settings: { label: 'Settings', actions: ['settings', 'add_term', 'update_term', 'delete_term'] },
  logins: { label: 'Logins', actions: ['login'] },
  messages: { label: 'Inbox', actions: ['message_assign', 'message_done', 'message_reopen'] },
};

export interface AuditFilter { q?: string; kind?: string; district?: string; days?: number; before?: number }

/** Entries this person may read, newest first, 50 at a time (`before` pages back) */
export async function listAudit(user: AdminUser, f: AuditFilter) {
  const state = user.role === 'super_admin' || user.role === 'state_editor';
  const db = await getDb();
  const since = f.days ? new Date(Date.now() - f.days * 86400_000).toISOString().replace('T', ' ').slice(0, 19) : undefined;
  const q = f.q?.trim();
  return db
    .select({ id: auditLog.id, action: auditLog.action, entity: auditLog.entity, entityId: auditLog.entityId, district: auditLog.district, summary: auditLog.summary, diff: auditLog.diff, at: auditLog.at, by: users.name })
    .from(auditLog).leftJoin(users, eq(users.id, auditLog.userId))
    .where(and(
      state ? (f.district === 'state' ? isNull(auditLog.district) : f.district ? eq(auditLog.district, f.district) : undefined) : eq(auditLog.district, user.district ?? '__none__'),
      f.kind && KINDS[f.kind] ? inArray(auditLog.action, KINDS[f.kind].actions) : undefined,
      since ? gte(auditLog.at, since) : undefined,
      q ? or(like(auditLog.summary, `%${q}%`), like(users.name, `%${q}%`), like(users.email, `%${q}%`)) : undefined,
      f.before ? lt(auditLog.id, f.before) : undefined,
    ))
    .orderBy(desc(auditLog.id)).limit(50);
}

/** Where an entry's item opens in the admin, when it still can */
export function itemLink(e: { entity: string; entityId: number | null; district?: string | null }) {
  const id = e.entityId;
  switch (e.entity) {
    case 'post': return id ? `/admin/news/${id}` : null;
    case 'order': return id ? `/admin/orders/${id}` : null;
    case 'event': return id ? `/admin/events/${id}` : null;
    case 'issue': return id ? `/admin/kerala-service/${id}` : null;
    case 'page': return id ? `/admin/pages/${id}` : null;
    case 'album': return id ? `/admin/media/albums/${id}` : null;
    case 'media': return id ? `/admin/media?tab=library&item=${id}#selected` : null;
    case 'message': return id ? `/admin/inbox?m=${id}` : null;
    case 'user': return '/admin/users';
    case 'district': return e.district ? `/admin/districts/${e.district}` : null;
    case 'committee': return '/admin/people';
    default: return null;
  }
}
