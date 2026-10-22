import type { OrderSubject } from '~/lib/types';

// Subjects come from the live site's Download Manager categories, with duplicates merged.
export const orderSubjects: OrderSubject[] = [
  { slug: 'da', group: 'govt', name: { ml: 'ക്ഷാമബത്ത', en: 'DA' } },
  { slug: 'pay-revision', group: 'govt', name: { ml: 'ശമ്പള പരിഷ്കരണം', en: 'Pay Revision' } },
  { slug: 'pay-fixation', group: 'govt', name: { ml: 'ശമ്പള നിർണ്ണയം', en: 'Pay Fixation' } },
  { slug: 'leave', group: 'govt', name: { ml: 'അവധി', en: 'Leave' } },
  { slug: 'bonus', group: 'govt', name: { ml: 'ബോണസ് / അഡ്വാൻസ്', en: 'Bonus & Advance' } },
  { slug: 'allowance', group: 'govt', name: { ml: 'അലവൻസ്', en: 'Allowances' } },
  { slug: 'gpf', group: 'govt', name: { ml: 'ജി.പി.എഫ്', en: 'GPF' } },
  { slug: 'gis-sli', group: 'govt', name: { ml: 'ജി.ഐ.എസ് / എസ്.എൽ.ഐ', en: 'GIS & SLI' } },
  { slug: 'hba', group: 'govt', name: { ml: 'ഭവനനിർമ്മാണ വായ്പ', en: 'HBA' } },
  { slug: 'increment', group: 'govt', name: { ml: 'ഇൻക്രിമെന്റ്', en: 'Increment' } },
  { slug: 'ltc', group: 'govt', name: { ml: 'എൽ.ടി.സി', en: 'LTC' } },
  { slug: 'medisep', group: 'govt', name: { ml: 'മെഡിസെപ്', en: 'MEDISEP' } },
  { slug: 'ta', group: 'govt', name: { ml: 'യാത്രാബത്ത', en: 'TA' } },
  { slug: 'nps', group: 'nps', name: { ml: 'പങ്കാളിത്ത പെൻഷൻ', en: 'NPS' } },
  { slug: 'pension', group: 'pension', name: { ml: 'പെൻഷൻ ഉത്തരവുകൾ', en: 'Pension Orders' } },
  { slug: 'pension-revision', group: 'pension', name: { ml: 'പെൻഷൻ പരിഷ്കരണം', en: 'Pension Revision' } },
  { slug: 'ex-gratia', group: 'pension', name: { ml: 'എക്സ്ഗ്രേഷ്യ പെൻഷൻ', en: 'Ex-Gratia Pension' } },
  { slug: 'medical', group: 'govt', name: { ml: 'ചികിത്സാ ചെലവ്', en: 'Medical Reimbursement' } },
  { slug: 'service', group: 'govt', name: { ml: 'സേവന വ്യവസ്ഥകൾ', en: 'Service Matters' } },
  { slug: 'part-time', group: 'govt', name: { ml: 'പാർട്ട് ടൈം / കാഷ്വൽ', en: 'Part-time & Casual' } },
  { slug: 'ugc-aicte', group: 'govt', name: { ml: 'യു.ജി.സി / എ.ഐ.സി.ടി.ഇ', en: 'UGC & AICTE Schemes' } },
  { slug: 'other', group: 'govt', name: { ml: 'മറ്റ് ഉത്തരവുകൾ', en: 'Other Orders' } },
];

export const orderGroups = [
  { slug: 'govt', name: { ml: 'സർക്കാർ ഉത്തരവുകൾ', en: 'Govt Orders' } },
  { slug: 'nps', name: { ml: 'പങ്കാളിത്ത പെൻഷൻ', en: 'NPS' } },
  { slug: 'pension', name: { ml: 'പെൻഷൻ ഉത്തരവുകൾ', en: 'Pension' } },
] as const;

export const subjectBySlug = Object.fromEntries(orderSubjects.map((s) => [s.slug, s])) as Record<string, OrderSubject>;

