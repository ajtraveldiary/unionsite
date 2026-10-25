// The About section's sub-pages, shared by the About hub's cards and the links at the foot of
// History. History, Conferences, Struggles and Documents link only once they have something on the
// site (written in Admin → Pages & documents); until then their cards say "Coming soon".
import { site } from '~/data/site';
import type { aboutAvailability } from './content';

type Availability = Awaited<ReturnType<typeof aboutAvailability>>;

export const aboutSections = [
  { id: 'state-committee', title: 'State committee', text: 'Office-bearers and secretariat', icon: 'Users', path: '/about/state-committee', live: () => true },
  { id: 'media', title: 'Media', text: 'Videos and photo albums', icon: 'Images', path: '/gallery', live: () => true },
  { id: 'contact', title: 'Contact', text: 'State Centre and district offices', icon: 'Mail', path: '/contact', live: () => true },
  { id: 'history', title: 'History', text: 'From the 1920 NGO Association to today', icon: 'Landmark', path: '/about/history', live: (a: Availability) => a.paths.has('/about/history') },
  { id: 'conferences', title: 'Conferences', text: `${site.conferences} state conferences since ${site.founded}`, icon: 'Flag', path: '/about/conferences', live: (a: Availability) => a.conferences > 0 },
  { id: 'struggles', title: 'Struggles', text: 'Major strikes and campaigns', icon: 'Megaphone', path: '/about/struggles', live: (a: Availability) => a.paths.has('/about/struggles') },
  { id: 'documents', title: 'Documents', text: 'Bye-Law and policy resolutions', icon: 'FileText', path: '/about/documents', live: (a: Availability) => a.documents > 0 },
] as const;

/** The cards for some sections, leaving out those with nothing on the site yet */
export const aboutNext = (a: Availability, ids: string[]) =>
  aboutSections.filter((s) => ids.includes(s.id) && s.live(a)).map(({ title, text, path }) => ({ title, text, path }));
