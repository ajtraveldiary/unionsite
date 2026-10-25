// Who may do what in the admin (plan, section 10, "Roles and permissions"). Pages use these to
// show only what a role can use; the API checks the same rules on every request, so hiding a
// button is never the only guard. Pure functions, safe in page scripts too.
import type { Role } from '~/db/schema';

export type { Role };

export interface AdminUser {
  id: number;
  email: string;
  name: string;
  role: Role;
  /** The district a district admin or editor works for; null for state roles */
  district: string | null;
}

export const roleLabels: Record<Role, string> = {
  super_admin: 'Super admin',
  state_editor: 'State editor',
  district_admin: 'District admin',
  district_editor: 'District editor',
};

/** Super admins and state editors work on the whole site */
export const isState = (u: AdminUser) => u.role === 'super_admin' || u.role === 'state_editor';

/** A post, event or other item as far as permissions go */
interface Scoped {
  district: string | null | undefined;
}

/** Whether this person works on items of this district (state roles: every district) */
export const inScope = (u: AdminUser, item: Scoped) => isState(u) || (!!u.district && item.district === u.district);

export const can = {
  /** Open and change an item: state roles everywhere, district roles in their own district */
  edit: (u: AdminUser, item: Scoped) => inScope(u, item),
  /** Put it live. District editors can't; they send it for review instead */
  publish: (u: AdminUser, item: Scoped) => u.role !== 'district_editor' && inScope(u, item),
  /** Lead story and home banner are state decisions; a district admin can ask */
  feature: (u: AdminUser) => isState(u),
  requestFeature: (u: AdminUser) => u.role === 'district_admin',
  approveEnglish: (u: AdminUser, item: Scoped) => u.role !== 'district_editor' && inScope(u, item),
  /** Take off the site (archive); kept, and can be put back */
  archive: (u: AdminUser, item: Scoped) => u.role !== 'district_editor' && inScope(u, item),
  /** Choose any district for a post; district roles always post to their own */
  pickDistrict: (u: AdminUser) => isState(u),
  stateSections: (u: AdminUser) => isState(u),
};

/** Admin sections, in menu order, with who may open each. `built: false` shows "Coming soon". */
export const sections = [
  { id: 'dashboard', label: 'Dashboard', path: '/admin', icon: 'LayoutDashboard', built: true },
  { id: 'news', label: 'News', path: '/admin/news', icon: 'Newspaper', built: true },
  { id: 'events', label: 'Events', path: '/admin/events', icon: 'CalendarDays', built: true },
  { id: 'orders', label: 'Orders', path: '/admin/orders', icon: 'FileText', built: true, roles: ['super_admin', 'state_editor'] },
  { id: 'magazine', label: 'Kerala Service', path: '/admin/kerala-service', icon: 'BookOpen', built: true, roles: ['super_admin', 'state_editor'] },
  { id: 'pages', label: 'Pages & documents', path: '/admin/pages', icon: 'Files', built: true, roles: ['super_admin', 'state_editor'] },
  { id: 'people', label: 'People & committees', path: '/admin/people', icon: 'Users', built: true },
  { id: 'districts', label: 'Districts', path: '/admin/districts', icon: 'Map', built: true },
  { id: 'media', label: 'Media', path: '/admin/media', icon: 'Images', built: true },
  { id: 'banner', label: 'Home & banner', path: '/admin/banner', icon: 'House', built: true, roles: ['super_admin', 'state_editor'] },
  { id: 'inbox', label: 'Inbox', path: '/admin/inbox', icon: 'Inbox', built: true, roles: ['super_admin', 'state_editor', 'district_admin'] },
  { id: 'analytics', label: 'Analytics', path: '/admin/analytics', icon: 'ChartLine', built: true },
  { id: 'users', label: 'Users', path: '/admin/users', icon: 'UserCog', built: true, roles: ['super_admin', 'district_admin'] },
  { id: 'audit', label: 'Audit log', path: '/admin/audit', icon: 'History', built: true, roles: ['super_admin', 'state_editor', 'district_admin'] },
  { id: 'import', label: 'Import', path: '/admin/import', icon: 'Import', built: true, roles: ['super_admin'] },
  // Everyone who translates keeps their own Gemini key there; site settings are the super admin's
  { id: 'settings', label: 'Settings', path: '/admin/settings', icon: 'Settings', built: true, roles: ['super_admin', 'state_editor', 'district_admin'] },
] as const satisfies readonly { id: string; label: string; path: string; icon: string; built: boolean; roles?: readonly Role[] }[];

export type SectionId = (typeof sections)[number]['id'] | 'help' | 'editor';

export const sectionsFor = (u: AdminUser) => sections.filter((s) => !('roles' in s) || (s.roles as readonly Role[]).includes(u.role));
