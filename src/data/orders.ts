import type { Order, OrderSubject } from '~/lib/types';

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
];

export const orderGroups = [
  { slug: 'govt', name: { ml: 'സർക്കാർ ഉത്തരവുകൾ', en: 'Govt Orders' } },
  { slug: 'nps', name: { ml: 'പങ്കാളിത്ത പെൻഷൻ', en: 'NPS' } },
  { slug: 'pension', name: { ml: 'പെൻഷൻ ഉത്തരവുകൾ', en: 'Pension' } },
] as const;

export const subjectBySlug = Object.fromEntries(orderSubjects.map((s) => [s.slug, s])) as Record<string, OrderSubject>;

const FIN = 'Finance Department';

// Every order below is SAMPLE data for the preview; the ~330 real GOs arrive with the Phase 2 import.
export const orders: Order[] = [
  { id: 1061, slug: 'da-revised-rate-jan-2026', goNumber: 'G.O.(P) No.112/2026/Fin', goDate: '2026-09-18', department: FIN, group: 'govt', subject: 'da', important: true, pdfKb: 412, pages: 3,
    title: { ml: 'ക്ഷാമബത്ത – 2026 ജനുവരി 1 മുതൽ പുതുക്കിയ നിരക്ക്', en: 'Dearness Allowance – revised rate from 1 January 2026' },
    summary: { ml: 'സംസ്ഥാന ജീവനക്കാരുടെ ക്ഷാമബത്ത നിരക്ക് പുതുക്കി ഉത്തരവായി. കുടിശ്ശിക വിതരണം സംബന്ധിച്ച നിർദ്ദേശങ്ങളും ഉത്തരവിലുണ്ട്.', en: 'Revises the DA rate for State employees and sets out how arrears will be paid.' } },
  { id: 1060, slug: 'dearness-relief-pensioners-2026', goNumber: 'G.O.(P) No.113/2026/Fin', goDate: '2026-09-18', department: FIN, group: 'pension', subject: 'pension', important: true, pdfKb: 356, pages: 2,
    title: { ml: 'പെൻഷൻകാർക്കുള്ള ക്ഷാമാശ്വാസം – 2026', en: 'Dearness Relief for pensioners – 2026' } },
  { id: 1059, slug: 'earned-leave-surrender-2026-27', goNumber: 'G.O.(P) No.98/2026/Fin', goDate: '2026-08-29', department: FIN, group: 'govt', subject: 'leave', pdfKb: 220, pages: 2,
    title: { ml: 'ആർജ്ജിതാവധി സറണ്ടർ – 2026-27 സാമ്പത്തിക വർഷം', en: 'Earned leave surrender – financial year 2026-27' } },
  { id: 1058, slug: 'onam-bonus-festival-allowance-2026', goNumber: 'G.O.(P) No.91/2026/Fin', goDate: '2026-08-12', department: FIN, group: 'govt', subject: 'bonus', important: true, pdfKb: 498, pages: 4,
    title: { ml: 'ഓണം ബോണസ്, ഉത്സവബത്ത, അഡ്വാൻസ് – 2026', en: 'Onam bonus, festival allowance and advance – 2026' } },
  { id: 1057, slug: 'gpf-interest-jul-sep-2026', goNumber: 'G.O.(P) No.84/2026/Fin', goDate: '2026-07-21', department: FIN, group: 'govt', subject: 'gpf', pdfKb: 140, pages: 1,
    title: { ml: 'ജി.പി.എഫ് – 2026 ജൂലൈ–സെപ്റ്റംബർ പലിശനിരക്ക്', en: 'GPF – interest rate for July–September 2026' } },
  { id: 1056, slug: 'medisep-premium-order', goNumber: 'G.O.(P) No.77/2026/Fin', goDate: '2026-07-02', department: FIN, group: 'govt', subject: 'medisep', pdfKb: 610, pages: 5,
    title: { ml: 'മെഡിസെപ് – പ്രീമിയം തുക സംബന്ധിച്ച ഉത്തരവ്', en: 'MEDISEP – order on the premium amount' } },
  { id: 1055, slug: 'nps-employee-share-remittance', goNumber: 'G.O.(P) No.70/2026/Fin', goDate: '2026-06-16', department: FIN, group: 'nps', subject: 'nps', pdfKb: 330, pages: 3,
    title: { ml: 'പങ്കാളിത്ത പെൻഷൻ – ജീവനക്കാരുടെ വിഹിതം അടയ്ക്കൽ നടപടിക്രമം', en: 'NPS – procedure for remitting the employee share' } },
  { id: 1054, slug: 'ta-rates-revised', goNumber: 'G.O.(P) No.62/2026/Fin', goDate: '2026-05-28', department: FIN, group: 'govt', subject: 'ta', pdfKb: 275, pages: 3,
    title: { ml: 'യാത്രാബത്ത – നിരക്കുകൾ പുതുക്കി', en: 'Travelling Allowance – rates revised' } },
  { id: 1053, slug: 'pay-fixation-instructions', goNumber: 'G.O.(P) No.55/2026/Fin', goDate: '2026-05-08', department: FIN, group: 'govt', subject: 'pay-fixation', pdfKb: 820, pages: 8,
    title: { ml: 'ശമ്പള നിർണ്ണയം – പ്രമോഷൻ ലഭിക്കുന്നവർക്കുള്ള നിർദ്ദേശങ്ങൾ', en: 'Pay fixation – instructions for promoted employees' } },
  { id: 1052, slug: 'ltc-revised-conditions', goNumber: 'G.O.(P) No.41/2026/Fin', goDate: '2026-04-03', department: FIN, group: 'govt', subject: 'ltc', pdfKb: 190, pages: 2,
    title: { ml: 'ലീവ് ട്രാവൽ കൺസഷൻ – പുതുക്കിയ വ്യവസ്ഥകൾ', en: 'Leave Travel Concession – revised conditions' } },
  { id: 1051, slug: 'nps-death-retirement-benefits', goNumber: 'G.O.(P) No.33/2026/Fin', goDate: '2026-03-14', department: FIN, group: 'nps', subject: 'nps', pdfKb: 455, pages: 4,
    title: { ml: 'പങ്കാളിത്ത പെൻഷൻ – മരണാനന്തര, വിരമിക്കൽ ആനുകൂല്യങ്ങൾ', en: 'NPS – death and retirement benefits' } },
  { id: 1050, slug: 'hba-application-procedure', goNumber: 'G.O.(P) No.21/2026/Fin', goDate: '2026-02-19', department: FIN, group: 'govt', subject: 'hba', pdfKb: 260, pages: 3,
    title: { ml: 'ഭവനനിർമ്മാണ വായ്പ – അപേക്ഷാ നടപടിക്രമം', en: 'House Building Advance – application procedure' } },
  { id: 1049, slug: 'increment-clarification', goNumber: 'G.O.(Rt) No.1180/2025/Fin', goDate: '2025-12-09', department: FIN, group: 'govt', subject: 'increment', pdfKb: 120, pages: 1,
    title: { ml: 'ഇൻക്രിമെന്റ് അനുവദിക്കൽ – വ്യക്തത വരുത്തൽ', en: 'Grant of increment – clarification' } },
  { id: 1048, slug: 'ex-gratia-pension-rate-revised', goNumber: 'G.O.(P) No.140/2025/Fin', goDate: '2025-10-30', department: FIN, group: 'pension', subject: 'ex-gratia', pdfKb: 205, pages: 2,
    title: { ml: 'എക്സ്ഗ്രേഷ്യ പെൻഷൻ – നിരക്ക് പുതുക്കി', en: 'Ex-gratia pension – rate revised' } },
  { id: 1047, slug: 'house-rent-allowance-clarification', goNumber: 'G.O.(P) No.81/2014/Fin', goDate: '2014-02-27', department: FIN, group: 'govt', subject: 'allowance', pdfKb: 160, pages: 2,
    title: { ml: 'വീട്ടുവാടക ബത്ത – വ്യക്തത വരുത്തൽ', en: 'House Rent Allowance – clarification' } },
  { id: 1046, slug: 'pension-revision-2009-arrears', goNumber: 'G.O.(P) No.612/2011/Fin', goDate: '2011-11-24', department: FIN, group: 'pension', subject: 'pension-revision', pdfKb: 940, pages: 9,
    title: { ml: 'പെൻഷൻ പരിഷ്കരണം 01-07-2009 – കുടിശ്ശിക വിതരണം', en: 'Pension Revision 01-07-2009 – payment of arrears' } },
  { id: 1045, slug: 'gis-subscription-revised', goNumber: 'G.O.(P) No.12/2025/Fin', goDate: '2025-01-22', department: FIN, group: 'govt', subject: 'gis-sli', pdfKb: 175, pages: 2,
    title: { ml: 'ഗ്രൂപ്പ് ഇൻഷുറൻസ് പദ്ധതി – വരിസംഖ്യ പുതുക്കി', en: 'Group Insurance Scheme – subscription revised' } },
  { id: 1044, slug: 'pay-revision-anomaly-committee', goNumber: 'G.O.(P) No.27/2024/Fin', goDate: '2024-03-06', department: FIN, group: 'govt', subject: 'pay-revision', pdfKb: 380, pages: 3,
    title: { ml: 'ശമ്പള പരിഷ്കരണം – അപാകതകൾ പരിഹരിക്കൽ', en: 'Pay Revision – correcting anomalies' } },
].map((o) => ({ ...o, sample: true }) as Order);

export const orderById = Object.fromEntries(orders.map((o) => [o.id, o])) as Record<number, Order>;
