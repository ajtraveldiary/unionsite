import type { L10n, Person, UnionEvent, Video } from '~/lib/types';

export const site = {
  name: { ml: 'കേരള എൻ.ജി.ഒ യൂണിയൻ', en: 'Kerala NGO Union' },
  founded: 1962,
  conferences: 63,
  address: {
    ml: 'ടി.ടി.സി ജംഗ്ഷൻ റോഡ്, പി.എം.ജി ജംഗ്ഷൻ, തിരുവനന്തപുരം – 695033',
    en: 'TTC Junction Road, PMG Junction, Thiruvananthapuram – 695033',
  },
  phone: '', // Open question in the plan: official phone and email are blank on the old site
  email: '',
  social: {
    facebook: 'https://www.facebook.com/keralangounion/',
    youtube: 'https://www.youtube.com/channel/UCr4zIQGUsuk9FuD5snJAwkA',
  },
  magazineSite: 'https://ngoukeralaservice.in/',
};

/**
 * The first home-page banner: one news post (by id) or one event (by slug), chosen by a state editor.
 * `npm run db:seed` copies it into D1 (site_settings.home_banner), where the site reads it; the
 * admin panel's Home & banner screen replaces it later. `headline` optionally shortens the title.
 */
export const firstBanner: ({ post: number } | { event: string }) & { headline?: L10n } = {
  post: 18024,
  headline: { ml: 'നവംബർ 21 സെക്രട്ടറിയേറ്റ് വളയൽ വിജയിപ്പിക്കുക' },
};

export const usefulLinks = [
  { label: 'SPARK', url: 'https://www.spark.gov.in/', note: 'Salary & service' },
  { label: 'eOffice', url: 'https://eoffice.kerala.gov.in/', note: 'e-File portal' },
  { label: 'Document Portal', url: 'https://document.kerala.gov.in/', note: 'Govt orders' },
  { label: 'Kerala PSC', url: 'https://www.keralapsc.gov.in/', note: 'Recruitment' },
  { label: 'eSevanam', url: 'https://services.kerala.gov.in/', note: 'Citizen services' },
  { label: 'Government of Kerala', url: 'https://kerala.gov.in/', note: 'Official portal' },
  { label: 'File Search (State)', url: 'http://sics.kerala.gov.in/landing/index.php', note: 'Secretariat files' },
  { label: 'Soochika File Tracking', url: 'http://filetracking.lsgkerala.gov.in/', note: 'LSG files' },
  { label: 'Property Tax e-Payment', url: 'https://tax.lsgkerala.gov.in/epayment/index.php', note: 'LSG' },
  { label: 'KSEB Pay Online', url: 'https://wss.kseb.in/selfservices/quickpay', note: 'Electricity' },
  { label: 'WCD Kerala', url: 'http://wcd.kerala.gov.in/dowry', note: 'Women & child' },
];

// State committee, from keralangounion.in/സംസ്ഥാന-കമ്മിറ്റി/. English spellings are drafts for review.
export const stateCommittee: Person[] = [
  { name: { ml: 'എം.എ അജിത് കുമാർ', en: 'M.A. Ajith Kumar' }, role: 'president', body: 'state' },
  { name: { ml: 'എം.വി. ശശിധരൻ', en: 'M.V. Sasidharan' }, role: 'general_secretary', body: 'state' },
  { name: { ml: 'വി.കെ ഷീജ', en: 'V.K. Sheeja' }, role: 'treasurer', body: 'state' },
  { name: { ml: 'ടി.എം ഹാജറ', en: 'T.M. Hajara' }, role: 'vice_president', body: 'state' },
  { name: { ml: 'എസ് ഗോപകുമാർ', en: 'S. Gopakumar' }, role: 'vice_president', body: 'state' },
  { name: { ml: 'കെ.പി സുനിൽകുമാർ', en: 'K.P. Sunilkumar' }, role: 'vice_president', body: 'state' },
  { name: { ml: 'പി.പി സന്തോഷ്', en: 'P.P. Santhosh' }, role: 'secretary', body: 'state' },
  { name: { ml: 'പി സുരേഷ്', en: 'P. Suresh' }, role: 'secretary', body: 'state' },
  { name: { ml: 'സീമ എസ് നായർ', en: 'Seema S. Nair' }, role: 'secretary', body: 'state' },
  ...[
    ['സി.വി സുരേഷ്‌കുമാർ', 'C.V. Sureshkumar'],
    ['കെ.കെ സുനിൽകുമാർ', 'K.K. Sunilkumar'],
    ['വി.കെ ഉദയൻ', 'V.K. Udayan'],
    ['സി. ഗാഥ', 'C. Gadha'],
    ['എസ്. സുനിൽകുമാർ', 'S. Sunilkumar'],
    ['എ.എം സുഷമ', 'A.M. Sushama'],
    ['കെ. വിജയകുമാർ', 'K. Vijayakumar'],
    ['എസ് സജീവ്‌കുമാർ', 'S. Sajeevkumar'],
    ['എം. രഞ്ജിനി', 'M. Ranjini'],
    ['ഹംസ കണ്ണാട്ടിൽ', 'Hamsa Kannattil'],
    ['വി. ശോഭ', 'V. Shobha'],
    ['മേരി സിൽവസ്റ്റർ', 'Mary Sylvester'],
  ].map(([ml, en]): Person => ({ name: { ml, en }, role: 'secretariat_member', body: 'state' })),
  { name: { ml: 'എസ്. ലക്ഷ്‌മീദേവി', en: 'S. Lakshmidevi' }, role: 'convener', body: 'women_subcommittee' },
  { name: { ml: 'ജി. ജിഷ', en: 'G. Jisha' }, role: 'joint_convener', body: 'women_subcommittee' },
  { name: { ml: 'വി. ഷിജി', en: 'V. Shiji' }, role: 'joint_convener', body: 'women_subcommittee' },
];

export const roleLabels: Record<Person['role'], { ml: string; en: string }> = {
  president: { ml: 'പ്രസിഡന്റ്', en: 'President' },
  general_secretary: { ml: 'ജനറൽ സെക്രട്ടറി', en: 'General Secretary' },
  treasurer: { ml: 'ട്രഷറർ', en: 'Treasurer' },
  vice_president: { ml: 'വൈസ് പ്രസിഡന്റ്', en: 'Vice President' },
  secretary: { ml: 'സെക്രട്ടറി', en: 'Secretary' },
  secretariat_member: { ml: 'സെക്രട്ടേറിയറ്റ് അംഗം', en: 'Secretariat member' },
  convener: { ml: 'കൺവീനർ', en: 'Convener' },
  joint_convener: { ml: 'ജോയിന്റ് കൺവീനർ', en: 'Joint Convener' },
};

// Sample events for the preview.
export const events: UnionEvent[] = [
  { slug: 'state-council-meeting-oct-2026', title: { ml: 'സംസ്ഥാന കൗൺസിൽ യോഗം', en: 'State Council meeting' }, start: '2026-10-17T10:00:00+05:30', venue: { ml: 'സംസ്ഥാന കേന്ദ്രം, തിരുവനന്തപുരം', en: 'State Centre, Thiruvananthapuram' }, sample: true },
  { slug: 'kozhikode-study-camp-2026', title: { ml: 'ജില്ലാതല പഠന ക്യാമ്പ്', en: 'District study camp' }, start: '2026-10-24T09:30:00+05:30', end: '2026-10-25T17:00:00+05:30', venue: { ml: 'ടൗൺ ഹാൾ, കോഴിക്കോട്', en: 'Town Hall, Kozhikode' }, district: 'kozhikode', sample: true },
  { slug: 'kerala-piravi-2026', title: { ml: 'കേരളപ്പിറവി ദിനാഘോഷം', en: 'Kerala Piravi celebrations' }, start: '2026-11-01T10:00:00+05:30', venue: { ml: 'എല്ലാ ജില്ലാ കേന്ദ്രങ്ങളിലും', en: 'All district centres' }, sample: true },
  { slug: 'ernakulam-women-convention-2026', title: { ml: 'വനിതാ കൺവെൻഷൻ', en: 'Women’s convention' }, start: '2026-11-14T10:00:00+05:30', venue: { ml: 'എറണാകുളം', en: 'Ernakulam' }, district: 'ernakulam', sample: true },
];


// Latest uploads from the union's YouTube channel feed (fetched 4 Oct 2026).
export const videos: Video[] = [
  { id: 'JsmQ3FZgyo8', title: { ml: 'ചതികളുടെയും കൂട്ടക്കൊലകളുടെയും 250 വർഷങ്ങൾ' }, date: '2026-09-14' },
  { id: 'V4hGePMe1M4', title: { ml: 'ചരിത്രം അദ്ദേഹത്തെ കുറ്റക്കാരനല്ല എന്ന് വിധിച്ചിരിക്കുന്നു' }, date: '2026-09-14' },
  { id: 'wRwCXTjh31c', title: { ml: 'തൊഴിലാളി വിരുദ്ധ നിയമത്തെ നീതിപീഠം നെഞ്ചേറ്റുമ്പോൾ' }, date: '2026-09-14' },
  { id: 'BIDMEGdh2-s', title: { ml: 'അമ്പേ പരാജയം' }, date: '2026-09-05' },
];
