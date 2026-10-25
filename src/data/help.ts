// The admin's Help guide (plan, section 8 "Admin help"; approved wireframe "Help"): a few steps
// for every common task, in Malayalam, each listed only for the roles that can do it. Button names
// stay in English, as the screens show them. These are first drafts for the state office to
// correct; screenshots are added when the screens are final (todo.md). Update a task's steps in
// the same change as its screen.
import type { Role } from '~/db/schema';

export interface HelpTask {
  id: string;
  /** The task's name in the list (interface text, so English) */
  name: string;
  /** Who can do it; everyone when left out */
  roles?: Role[];
  /** Where it is done */
  path: string;
  minutes: number;
  /** Malayalam steps; **Name** marks a button or menu name */
  steps: string[];
}

const STATE: Role[] = ['super_admin', 'state_editor'];
const ADMINS: Role[] = ['super_admin', 'state_editor', 'district_admin'];

export const helpTasks: HelpTask[] = [
  {
    id: 'sign-in', name: 'Sign in with the email code', path: '/admin', minutes: 1,
    steps: [
      'ഫോണിലോ കമ്പ്യൂട്ടറിലോ ബ്രൗസറിൽ keralangounion.in/admin തുറക്കുക.',
      'സംസ്ഥാന ഓഫീസിൽ നൽകിയ നിങ്ങളുടെ ഇമെയിൽ വിലാസം നൽകി കോഡ് ആവശ്യപ്പെടുക.',
      'ഇമെയിലിൽ വന്ന കോഡ് നൽകുക. കോഡ് കണ്ടില്ലെങ്കിൽ Spam ഫോൾഡർ നോക്കുക.',
      'പാസ്‌വേഡ് ഇല്ല; ഓരോ തവണയും പുതിയ കോഡ് വരും. ആരുമായും കോഡ് പങ്കുവെക്കരുത്.',
    ],
  },
  {
    id: 'post-news', name: 'Post news from your phone', path: '/admin/news/new', minutes: 3,
    steps: [
      'മെനുവിൽ **News** തുറന്ന് **New post** അമർത്തുക (ഫോണിൽ താഴെയുള്ള + ബട്ടൺ).',
      'തലക്കെട്ട്, ചുരുക്കം, വാർത്ത എന്നിവ മലയാളത്തിൽ എഴുതുക. എഴുതുന്നതെല്ലാം തനിയെ സേവ് ആകും.',
      '**Topic** തിരഞ്ഞെടുക്കുക: സമരം, സെമിനാർ, കലാ-കായികം തുടങ്ങിയവ.',
      'ജില്ലാ അഡ്മിൻ **Publish** അമർത്തുക. ജില്ലാ എഡിറ്റർ **Send for review** അമർത്തുക; ജില്ലാ അഡ്മിൻ പരിശോധിച്ച് പ്രസിദ്ധീകരിക്കും.',
      'പിന്നീട് തിരുത്തണമെങ്കിൽ പോസ്റ്റ് തുറന്ന് മാറ്റം വരുത്തി **Update** അമർത്തുക.',
    ],
  },
  {
    id: 'photos', name: 'Add a photo and pick the cover', path: '/admin/media', minutes: 2,
    steps: [
      'പോസ്റ്റിൽ **Cover photo** എന്നതിൽ അമർത്തി ഫോണിലെ ഫോട്ടോ തിരഞ്ഞെടുക്കുക.',
      'ഫോട്ടോ തനിയെ ചെറുതാക്കി അപ്‌ലോഡ് ചെയ്യും; വലിയ ഫയലുകൾ ആണെങ്കിലും പ്രശ്നമില്ല.',
      'ഫോട്ടോയിൽ എന്താണെന്ന് ഒരു വാചകത്തിൽ എഴുതുക (കാഴ്ചയില്ലാത്തവർക്കും വായിക്കാൻ).',
      'മുമ്പ് അപ്‌ലോഡ് ചെയ്ത ഫോട്ടോകൾ **Media** എന്നതിൽ ഉണ്ട്; അവിടെ നിന്നും തിരഞ്ഞെടുക്കാം.',
    ],
  },
  {
    id: 'review', name: 'Review and publish a post', roles: ADMINS, path: '/admin/news?status=in_review', minutes: 2,
    steps: [
      '**Dashboard**-ൽ പരിശോധിക്കാനുള്ള പോസ്റ്റുകൾ കാണാം. ഒന്ന് തുറക്കുക.',
      'തലക്കെട്ടും വാർത്തയും ഫോട്ടോയും വായിച്ചു നോക്കുക; ആവശ്യമെങ്കിൽ തിരുത്തുക.',
      'ശരിയാണെങ്കിൽ **Publish** അമർത്തുക. മാറ്റം വേണമെങ്കിൽ **Send back** അമർത്തി കാരണം എഴുതുക.',
    ],
  },
  {
    id: 'english', name: 'Check and approve the English version', roles: ADMINS, path: '/admin/news', minutes: 3,
    steps: [
      'പോസ്റ്റിൽ **English** ടാബ് തുറക്കുക. **Draft English with AI** അമർത്തിയാൽ ഇംഗ്ലീഷ് പതിപ്പ് തയ്യാറാകും.',
      'പേരുകൾ, സ്ഥലങ്ങൾ, തീയതികൾ, സംഘടനയുടെ പദങ്ങൾ എന്നിവ ശരിയാണോ എന്ന് നോക്കി തിരുത്തുക.',
      'ശരിയായാൽ **Approve English** അമർത്തുക. അംഗീകരിക്കുന്നതുവരെ ഇംഗ്ലീഷ് സൈറ്റിൽ മലയാളം തന്നെ കാണിക്കും.',
      'AI-ക്ക് ആദ്യമായി **Settings**-ൽ നിങ്ങളുടെ Gemini കീ നൽകണം.',
    ],
  },
  {
    id: 'event', name: 'Add an event', path: '/admin/events/new', minutes: 2,
    steps: [
      'മെനുവിൽ **Events** തുറന്ന് **New event** അമർത്തുക.',
      'പേര്, തീയതി, സമയം, സ്ഥലം, ചെറിയ വിവരണം എന്നിവ നൽകുക.',
      'പരിപാടി കഴിഞ്ഞാൽ അതിന്റെ റിപ്പോർട്ട് **Write the report** വഴി വാർത്തയായി എഴുതാം.',
    ],
  },
  {
    id: 'office-bearers', name: 'Update office-bearers', path: '/admin/people', minutes: 3,
    steps: [
      'മെനുവിൽ **People & committees** തുറക്കുക.',
      '**+ Add someone** അമർത്തി പേര്, സ്ഥാനം, ഫോൺ, ഫോട്ടോ എന്നിവ നൽകുക. മാറ്റാൻ പേരിനടുത്തുള്ള **Edit** അമർത്തുക.',
      'ജില്ലാ എഡിറ്റർ ചേർക്കുന്നവർ ജില്ലാ അഡ്മിൻ **Approve** ചെയ്തതിനുശേഷമേ സൈറ്റിൽ കാണൂ.',
      'സമ്മേളനത്തിനുശേഷം പുതിയ കമ്മിറ്റി വന്നാൽ **Start new term** ഉപയോഗിക്കുക; പഴയ കമ്മിറ്റി സൂക്ഷിക്കും.',
    ],
  },
  {
    id: 'office', name: 'Add or change an office address', roles: ADMINS, path: '/admin/districts', minutes: 2,
    steps: [
      'മെനുവിൽ **Districts** തുറന്ന് നിങ്ങളുടെ ജില്ല തിരഞ്ഞെടുക്കുക.',
      '**Add an office** അമർത്തി വിലാസം, ഫോൺ, മാപ്പ് ലിങ്ക് എന്നിവ നൽകുക.',
      'സേവ് ചെയ്താൽ ജില്ലാ പേജിലും Contact പേജിലും പുതിയ വിലാസം കാണിക്കും.',
    ],
  },
  {
    id: 'order', name: 'Upload a government order', roles: STATE, path: '/admin/orders', minutes: 2,
    steps: [
      'മെനുവിൽ **Orders** തുറന്ന് ഉത്തരവിന്റെ PDF ഇടുക (ഒന്നിലധികം ഒന്നിച്ചും ആകാം).',
      'GO നമ്പറും തീയതിയും PDF-ൽ നിന്ന് തനിയെ എടുക്കും; ശരിയാണോ എന്ന് നോക്കുക.',
      'വിഷയവും (DA, ശമ്പള പരിഷ്കരണം…) ലളിതമായ ഒരു തലക്കെട്ടും നൽകി സേവ് ചെയ്യുക.',
    ],
  },
  {
    id: 'kerala-service', name: 'Add a Kerala Service issue', roles: STATE, path: '/admin/kerala-service', minutes: 3,
    steps: [
      'മെനുവിൽ **Kerala Service** തുറന്ന് ലക്കത്തിന്റെ PDF ഇടുക.',
      'കവർ ചിത്രം ഒന്നാം പേജിൽ നിന്ന് തനിയെ എടുക്കും. മാസവും വർഷവും നോക്കുക.',
      'ഉള്ളടക്കം (ലേഖനങ്ങളുടെ പേരുകൾ) **+ Add a line** വഴി ചേർത്ത് സേവ് ചെയ്യുക.',
    ],
  },
  {
    id: 'banner', name: 'Change the home banner', roles: STATE, path: '/admin/banner', minutes: 1,
    steps: [
      'മെനുവിൽ **Home & banner** തുറക്കുക.',
      'ഒരു വാർത്തയോ പരിപാടിയോ തിരഞ്ഞ് **Put in banner** അമർത്തുക.',
      'മാറ്റുന്നതുവരെ ബാനർ അങ്ങനെ തന്നെ നിൽക്കും.',
    ],
  },
  {
    id: 'inbox', name: 'Answer a message from the contact form', roles: ADMINS, path: '/admin/inbox', minutes: 2,
    steps: [
      'മെനുവിൽ **Inbox** തുറക്കുക. പുതിയ സന്ദേശങ്ങൾ **Open** എന്നതിൽ കാണാം.',
      'മറുപടി ഇമെയിലിൽ അയയ്ക്കാൻ **Reply by email** അമർത്തുക; വേറൊരാൾ നോക്കേണ്ടതാണെങ്കിൽ അവർക്ക് നൽകുക (assign).',
      'മറുപടി നൽകിയാൽ **Mark done** അമർത്തുക. സന്ദേശങ്ങൾ 12 മാസം കഴിഞ്ഞാൽ തനിയെ മായും.',
    ],
  },
  {
    id: 'invite', name: 'Invite a new admin', roles: ['super_admin', 'district_admin'], path: '/admin/users', minutes: 1,
    steps: [
      'മെനുവിൽ **Users** തുറക്കുക.',
      'ആളുടെ പേരും ഇമെയിലും നൽകി റോൾ തിരഞ്ഞെടുത്ത് ക്ഷണിക്കുക. ജില്ലാ അഡ്മിന് സ്വന്തം ജില്ലയിലെ എഡിറ്റർമാരെ മാത്രം ചേർക്കാം.',
      'അവർക്ക് admin വിലാസം അയച്ചുകൊടുക്കുക; ഇമെയിൽ കോഡ് വഴി അവർക്ക് ലോഗിൻ ചെയ്യാം.',
      'ഒരാൾ ചുമതല ഒഴിഞ്ഞാൽ **Switch off** അമർത്തുക; അവർ ചെയ്ത പോസ്റ്റുകൾ നിലനിൽക്കും.',
    ],
  },
];

export const helpFor = (role: Role) => helpTasks.filter((t) => !t.roles || t.roles.includes(role));
