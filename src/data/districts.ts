import type { District, Topic } from '~/lib/types';

// The 15 district committees. Thiruvananthapuram is split into North and South,
// as in the union's own structure. Slugs are fixed (plan, section 3).
export const districts: District[] = [
  { slug: 'tvm-north', name: { ml: 'തിരുവനന്തപുരം നോർത്ത്', en: 'Thiruvananthapuram North' }, hq: { ml: 'തിരുവനന്തപുരം', en: 'Thiruvananthapuram' }, sortOrder: 1 },
  { slug: 'tvm-south', name: { ml: 'തിരുവനന്തപുരം സൗത്ത്', en: 'Thiruvananthapuram South' }, hq: { ml: 'തിരുവനന്തപുരം', en: 'Thiruvananthapuram' }, sortOrder: 2 },
  { slug: 'kollam', name: { ml: 'കൊല്ലം', en: 'Kollam' }, hq: { ml: 'കൊല്ലം', en: 'Kollam' }, sortOrder: 3 },
  { slug: 'pathanamthitta', name: { ml: 'പത്തനംതിട്ട', en: 'Pathanamthitta' }, hq: { ml: 'പത്തനംതിട്ട', en: 'Pathanamthitta' }, sortOrder: 4 },
  { slug: 'alappuzha', name: { ml: 'ആലപ്പുഴ', en: 'Alappuzha' }, hq: { ml: 'ആലപ്പുഴ', en: 'Alappuzha' }, sortOrder: 5 },
  { slug: 'kottayam', name: { ml: 'കോട്ടയം', en: 'Kottayam' }, hq: { ml: 'കോട്ടയം', en: 'Kottayam' }, sortOrder: 6 },
  { slug: 'idukki', name: { ml: 'ഇടുക്കി', en: 'Idukki' }, hq: { ml: 'പൈനാവ്', en: 'Painavu' }, sortOrder: 7 },
  { slug: 'ernakulam', name: { ml: 'എറണാകുളം', en: 'Ernakulam' }, hq: { ml: 'കാക്കനാട്', en: 'Kakkanad' }, sortOrder: 8 },
  { slug: 'thrissur', name: { ml: 'തൃശൂർ', en: 'Thrissur' }, hq: { ml: 'തൃശൂർ', en: 'Thrissur' }, sortOrder: 9 },
  { slug: 'palakkad', name: { ml: 'പാലക്കാട്', en: 'Palakkad' }, hq: { ml: 'പാലക്കാട്', en: 'Palakkad' }, sortOrder: 10 },
  { slug: 'malappuram', name: { ml: 'മലപ്പുറം', en: 'Malappuram' }, hq: { ml: 'മലപ്പുറം', en: 'Malappuram' }, sortOrder: 11 },
  { slug: 'kozhikode', name: { ml: 'കോഴിക്കോട്', en: 'Kozhikode' }, hq: { ml: 'കോഴിക്കോട്', en: 'Kozhikode' }, sortOrder: 12 },
  { slug: 'wayanad', name: { ml: 'വയനാട്', en: 'Wayanad' }, hq: { ml: 'കൽപ്പറ്റ', en: 'Kalpetta' }, sortOrder: 13 },
  { slug: 'kannur', name: { ml: 'കണ്ണൂർ', en: 'Kannur' }, hq: { ml: 'കണ്ണൂർ', en: 'Kannur' }, sortOrder: 14 },
  { slug: 'kasaragod', name: { ml: 'കാസർഗോഡ്', en: 'Kasaragod' }, hq: { ml: 'കാസർഗോഡ്', en: 'Kasaragod' }, sortOrder: 15 },
];

export const districtBySlug = Object.fromEntries(districts.map((d) => [d.slug, d])) as Record<string, District>;

// About eight topics replace the 56 old WordPress categories (plan, section 3).
export const topics: Topic[] = [
  { slug: 'struggles', name: { ml: 'പ്രക്ഷോഭം', en: 'Struggles' } },
  { slug: 'organisation', name: { ml: 'സംഘടന', en: 'Organisation' } },
  { slug: 'fseto', name: { ml: 'എഫ്.എസ്.ഇ.ടി.ഒ', en: 'FSETO' } },
  { slug: 'social-work', name: { ml: 'സാമൂഹിക പ്രവർത്തനം', en: 'Social work' } },
  { slug: 'arts-sports', name: { ml: 'കലാകായികം', en: 'Arts & sports' } },
  { slug: 'janapaksha', name: { ml: 'ജനപക്ഷ സിവിൽ സർവീസ്', en: 'Janapaksha Civil Service' } },
  { slug: 'seminars', name: { ml: 'സെമിനാർ', en: 'Seminars' } },
  { slug: 'secretary', name: { ml: 'സെക്രട്ടറിയുടെ പേജ്', en: "Secretary's page" } },
  // Assigned by hand (scripts/import-crawl.mjs for now, the admin panel later); the home page lists the newest
  { slug: 'articles', name: { ml: 'ലേഖനങ്ങൾ', en: 'Articles' } },
];

export const topicBySlug = Object.fromEntries(topics.map((t) => [t.slug, t])) as Record<string, Topic>;
