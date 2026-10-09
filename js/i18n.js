// ქარ / EN: the interface in Georgian (as written) or English.
// Only the app's own words change - what people type stays as they typed it.
// In English, every phrase that appears on screen is looked up here and swapped,
// so the pages themselves are written once, in Georgian.

const KEY = 'cpmg.lang';
export const lang = (() => {
  try { return localStorage.getItem(KEY) === 'en' ? 'en' : 'ka'; } catch { return 'ka'; }
})();

export function setLang(next) {
  try { localStorage.setItem(KEY, next); } catch { /* this visit only */ }
  location.reload();
}

const MONTHS_KA = ['იანვარი', 'თებერვალი', 'მარტი', 'აპრილი', 'მაისი', 'ივნისი', 'ივლისი', 'აგვისტო', 'სექტემბერი', 'ოქტომბერი', 'ნოემბერი', 'დეკემბერი'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT_KA = ['იან', 'თებ', 'მარ', 'აპრ', 'მაი', 'ივნ', 'ივლ', 'აგვ', 'სექ', 'ოქტ', 'ნოე', 'დეკ'];
const SHORT_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const EN = {
  // Signing in, top bar
  'ელფოსტა': 'Email',
  'პაროლი': 'Password',
  'შესვლა': 'Sign in',
  'პაროლი დაგავიწყდათ? მიმართეთ ადმინისტრატორს.': 'Forgot your password? Ask an administrator.',
  'ელფოსტა ან პაროლი არასწორია.': 'Wrong email or password.',
  'ანგარიში ჯერ არ არის გამართული. მიმართეთ ადმინისტრატორს.': 'Your account is not set up yet. Ask an administrator.',
  'პროექტები': 'Projects',
  'მომხმარებლები': 'People',
  'გასვლა': 'Sign out',
  'დახურვა': 'Close',
  'იტვირთება…': 'Loading…',

  // Projects
  'დასრულებული პროექტები': 'Finished projects',
  'ახალი პროექტი': 'New project',
  'დამკვეთი': 'Client',
  'თარიღები არ არის მითითებული': 'No dates set',
  'შესრულებულია': 'Done',
  'დასრულებული პროექტები არ არის.': 'No finished projects.',
  'პროექტები ჯერ არ არის. დაამატეთ პირველი.': 'No projects yet. Add the first one.',
  'თქვენთვის ჯერ არცერთი პროექტი არ არის გაზიარებული.': 'No project has been shared with you yet.',
  'მიმდინარე პროექტები': 'Current projects',
  'დღიური ჟურნალი': 'Daily log',
  'გრაფიკი': 'Timetable',
  'დოკუმენტები': 'Documents',
  'კონტრაქტორები': 'Contractors',
  'ფინანსები': 'Money',
  'ანგარიში': 'Report',
  'პროექტი ვერ მოიძებნა, ან მისი ნახვის უფლება არ გაქვთ.': 'Project not found, or you may not see it.',
  'პროექტის რედაქტირება': 'Edit project',
  'დასახელება': 'Name',
  'მისამართი': 'Address',
  'დაწყება': 'Start',
  'დასრულება': 'Finish',
  'ხელშეკრულების ღირებულება (₾)': 'Contract value (₾)',
  'პროექტი დასრულებულია': 'The project is finished',
  'დასრულება დაწყებამდე ვერ იქნება.': 'The finish cannot be before the start.',
  'ღირებულება რიცხვით ჩაწერეთ.': 'Enter the value as a number.',
  'შენახულია': 'Saved',
  'პროექტი წაიშალა': 'Project deleted',
  'პროექტის წაშლა': 'Delete project',

  // Shared
  'შენახვა': 'Save',
  'წაშლა': 'Delete',
  'გაუქმება': 'Cancel',
  'რედაქტირება': 'Edit',
  'ნამდვილად წავშალოთ?': 'Delete this for good?',
  'ამ დღის ჩანაწერი უკვე არსებობს.': 'There is already a log for this day.',
  'ამის უფლება არ გაქვთ.': 'You are not allowed to do this.',
  'კავშირი ვერ დამყარდა. შეამოწმეთ ინტერნეტი.': 'No connection. Check the internet.',
  'სულ': 'Total',
  'ყველა': 'All',
  'სხვა': 'Other',

  // Daily log
  'ახალი ჩანაწერი': 'New log',
  'დღევანდელი ჩანაწერი': "Today's log",
  'ჩანაწერები ჯერ არ არის.': 'No logs yet.',
  'მეტის ჩვენება': 'Show more',
  'შესრულებული სამუშაო': 'Work done',
  'შენიშვნები': 'Notes',
  'ფოტო ვერ დამუშავდა.': 'The photo could not be read.',
  'თარიღი': 'Date',
  'ამინდი': 'Weather',
  'მუშების რაოდენობა': 'Number of workers',
  'რა გაკეთდა, სად, ვინ': 'What was done, where, by whom',
  'მონიშნეთ წასაშლელი ფოტოები': 'Tick the photos to delete',
  'ფოტოების დამატება': 'Add photos',
  'ფოტოები იტვირთება…': 'Uploading photos…',
  'ჩანაწერი წაიშალა': 'Log deleted',
  'მზიანი': 'Sunny',
  'ღრუბლიანი': 'Cloudy',
  'წვიმა': 'Rain',
  'თოვლი': 'Snow',
  'ქარიანი': 'Windy',
  'ცხელი': 'Hot',
  'ყინვა': 'Frost',
  'კვირა': 'Sunday',
  'ორშაბათი': 'Monday',
  'სამშაბათი': 'Tuesday',
  'ოთხშაბათი': 'Wednesday',
  'ხუთშაბათი': 'Thursday',
  'პარასკევი': 'Friday',
  'შაბათი': 'Saturday',

  // Timetable
  'სამუშაოს დამატება': 'Add work item',
  'გეგმით დღეისთვის': 'Planned by today',
  'ვადაგადაცილებული': 'Overdue',
  'დასრულებული სამუშაო': 'Items finished',
  'სამუშაო': 'Work',
  'კონტრაქტორი': 'Contractor',
  'ვადები': 'Dates',
  'შესრულება': 'Progress',
  'გრაფიკი ცარიელია. დაამატეთ პირველი სამუშაო.': 'The timetable is empty. Add the first work item.',
  'გრაფიკი ჯერ არ არის.': 'No timetable yet.',
  'დღეს': 'Today',
  'სამუშაოს რედაქტირება': 'Edit work item',
  'ახალი სამუშაო': 'New work item',
  'შესრულება (%)': 'Progress (%)',
  'შენიშვნა': 'Note',
  'კონტრაქტორები ემატება "კონტრაქტორები" გვერდზე.': 'Contractors are added on the "Contractors" page.',
  'დასრულებული': 'Finished',
  'მიმდინარე': 'In progress',
  'დასაწყები': 'Not started',

  // Documents
  'ნახაზები': 'Drawings',
  'სპეციფიკაციები': 'Specifications',
  'ნებართვები': 'Permits',
  'ფაილის ატვირთვა': 'Upload files',
  'ფაილი': 'File',
  'ფაილები': 'Files',
  'განყოფილება': 'Section',
  'ზომა': 'Size',
  'ატვირთა': 'Uploaded by',
  'მხოლოდ თანამშრომლებისთვის': 'Staff only',
  'მხოლოდ თანამშრომლებისთვის (ქვეკონტრაქტორები ვერ ნახავენ)': 'Staff only (subcontractors will not see it)',
  'ამ განყოფილებაში ფაილები არ არის.': 'No files in this section.',
  'დოკუმენტები ჯერ არ არის.': 'No documents yet.',
  'ფაილი ვერ გაიხსნა.': 'The file could not be opened.',
  'ერთი ფაილი - მაქსიმუმ 50 MB.': 'Up to 50 MB a file.',
  'ატვირთვა': 'Upload',
  'ატვირთულია': 'Uploaded',
  'ფაილის რედაქტირება': 'Edit file',
  'ფაილი წაიშალა': 'File deleted',

  // Contractors
  'კონტრაქტორის დამატება': 'Add contractor',
  'კონტაქტი': 'Contact',
  'ხელშეკრულება': 'Contract',
  'გადახდილი': 'Paid',
  'დარჩენილი': 'Left to pay',
  'გადახდები ემატება "ფინანსები" გვერდზე, როგორც გასავალი კონტრაქტორზე.': 'Payments are added on the "Money" page, as money out to a contractor.',
  'ამ პროექტზე კონტრაქტორები ჯერ არ არის.': 'No contractors on this project yet.',
  'სამუშაოს სახე': 'Trade',
  'მაგ. ელექტროობა': 'e.g. electrical',
  'საკონტაქტო პირი': 'Contact person',
  'ტელეფონი': 'Phone',
  'ახალი კონტრაქტორი': 'New contractor',
  'სამუშაოს აღწერა ამ პროექტზე': 'Scope on this project',
  'ხელშეკრულების თანხა (₾)': 'Contract amount (₾)',
  'თანხა რიცხვით ჩაწერეთ.': 'Enter the amount as a number.',
  'პროექტიდან მოხსნა': 'Remove from project',

  // Money
  'ჩანაწერის დამატება': 'Add entry',
  'შემოსავალი': 'Money in',
  'გასავალი': 'Money out',
  'ბალანსი': 'Balance',
  'ფულადი ნაკადი თვეების მიხედვით': 'Cash flow by month',
  'თვე': 'Month',
  'სხვაობა': 'Net',
  'ნაშთი': 'Balance',
  'ჩანაწერები': 'Entries',
  'სახე': 'Type',
  'აღწერა': 'Description',
  'თანხა': 'Amount',
  'თანხა (₾)': 'Amount (₾)',
  'ჩანაწერის რედაქტირება': 'Edit entry',
  'მაგ. ავანსი, ინვოისი №…': 'e.g. advance, invoice no. …',
  'დამკვეთის გადახდა': 'Client payment',
  'მასალები': 'Materials',
  'ტექნიკა': 'Equipment',
  'ხელფასები': 'Wages',

  // Report
  'დაბეჭდეთ, ან ბეჭდვის ფანჯარაში აირჩიეთ "Save as PDF".': 'Print it, or choose "Save as PDF" in the print window.',
  'ბეჭდვა / PDF': 'Print / PDF',
  'პროექტის ანგარიში': 'Project report',
  'დასრულების თარიღი': 'Finish date',
  'ვადაგადაცილებული სამუშაო': 'Overdue items',
  'მუშები დღეში (ბოლო 7 დღე)': 'Workers a day (last 7 days)',
  'სტატუსი': 'Status',
  'გრაფიკი ცარიელია.': 'The timetable is empty.',
  'ხელშეკრულების ღირებულება': 'Contract value',
  'ბოლო ჩანაწერები': 'Latest logs',
  'დღიური ანგარიში': 'Daily report',
  'ფოტოები': 'Photos',
  'ჩანაწერი ვერ მოიძებნა.': 'Log not found.',
  'ჟურნალზე დაბრუნება': 'Back to the log',
  'მუშები': 'Workers',

  // People
  'ადმინისტრატორი': 'Administrator',
  'თანამშრომელი': 'Staff',
  'ქვეკონტრაქტორი': 'Subcontractor',
  'ყველაფერი, მათ შორის მომხმარებლების მართვა': 'Everything, including managing people',
  'ყველა პროექტი: ჟურნალი, გრაფიკი, კონტრაქტორები, ფინანსები': 'Every project: logs, timetable, contractors, money',
  'მხოლოდ მონიშნული პროექტების ჟურნალი და გრაფიკი, ფინანსების გარეშე': 'Logs and timetable of the ticked projects only, no money',
  'მომხმარებლის დამატება': 'Add person',
  'სახელი': 'Name',
  'როლი': 'Role',
  'არცერთი': 'None',
  'ახალი პაროლი': 'New password',
  'ახალ მომხმარებელს გადაეცით საიტის მისამართი, ელფოსტა და პაროლი. პაროლის შესაცვლელად დააჭირეთ "ახალი პაროლი".':
    'Give a new person the site address, their email and password. To change a password, click "New password".',
  '(დასრულებული)': '(finished)',
  'პროექტები ჯერ არ არის.': 'No projects yet.',
  'ახალი მომხმარებელი': 'New person',
  'სახელი და გვარი': 'Full name',
  'კომპანია': 'Company',
  'ქვეკონტრაქტორის კომპანია': "Subcontractor's company",
  'რომელ პროექტებს ხედავს': 'Projects they can see',
  'დამატება': 'Add',
  'მომხმარებელი წაიშალა': 'Person removed',
  'მისამართი:': 'Address:',
  'ელფოსტა:': 'Email:',
  'პაროლი:': 'Password:',
  'გადაეცით ეს მონაცემები': 'Send them these details',
  'კოპირება': 'Copy',
  'დაკოპირდა': 'Copied',
  'ვერ დაკოპირდა - მონიშნეთ ხელით.': 'Could not copy - select it by hand.',

  // From the people function
  'შედით სისტემაში.': 'Please sign in.',
  'ეს მხოლოდ ადმინისტრატორს შეუძლია.': 'Only an administrator can do this.',
  'ელფოსტა არასწორია.': 'The email is not valid.',
  'ჩაწერეთ სახელი და გვარი.': 'Enter the full name.',
  'როლი არასწორია.': 'The role is not valid.',
  'პაროლი მინიმუმ 8 სიმბოლო უნდა იყოს.': 'The password must be at least 8 characters.',
  'ამ ელფოსტით ანგარიში უკვე არსებობს.': 'There is already an account with this email.',
  'ვერ შეიქმნა.': 'Could not be created.',
  'საკუთარ თავს ვერ წაშლით.': 'You cannot remove yourself.',
};
MONTHS_KA.forEach((m, i) => { EN[m] = MONTHS_EN[i]; });
SHORT_KA.forEach((m, i) => { EN[m] = SHORT_EN[i]; });

// Phrases with a number or a name inside.
const months = MONTHS_KA.join('|');
const shorts = SHORT_KA.join('|');
const monthOf = (ka) => MONTHS_EN[MONTHS_KA.indexOf(ka)];
const shortOf = (ka) => SHORT_EN[SHORT_KA.indexOf(ka)];
const PATTERNS = [
  [new RegExp(`^(${months}) (\\d{4})$`), (m, a, y) => `${monthOf(a)} ${y}`],
  [new RegExp(`^(${shorts}) (\\d{2})$`), (m, a, y) => `${shortOf(a)} ${y}`],
  [/^დამკვეთი: (.+)$/s, (m, a) => `Client: ${a}`],
  [/^ხელშეკრულება: (.+)$/s, (m, a) => `Contract: ${a}`],
  [/^შესრულებულია (\d+)%$/, (m, a) => `Done ${a}%`],
  [/^· გეგმით (\d+)%$/, (m, a) => `· planned ${a}%`],
  [/^შესრულებულია \(გეგმით (\d+)%\)$/, (m, a) => `Done (planned ${a}%)`],
  [/^მუშები: (\d+)$/, (m, a) => `Workers: ${a}`],
  [/^ავტორი: (.+)$/s, (m, a) => `By ${a}`],
  [/^ჩანაწერი - (.+)$/, (m, a) => `Log - ${a}`],
  [/^ფოტო ვერ აიტვირთა: (.+)$/s, (m, a) => `A photo could not be uploaded: ${a}`],
  [/^იტვირთება (\d+) \/ (\d+)…$/, (m, a, b) => `Uploading ${a} of ${b}…`],
  [/^"(.+)" 50 MB-ზე დიდია\.$/s, (m, a) => `"${a}" is larger than 50 MB.`],
  [/^"(.+)" ვერ აიტვირთა: (.+)$/s, (m, a, b) => `"${a}" could not be uploaded: ${b}`],
  [/^ატვირთულია (\d+) ფაილი$/, (m, a) => `${a} files uploaded`],
  [/^საცავი: (.+) \/ 1 GB \((\d+)%\) - ფოტოები და დოკუმენტები ერთად$/, (m, a, b) => `Storage: ${a} of 1 GB (${b}%) - photos and documents together`],
  [/^დამკვეთისგან მისაღები \(ხელშეკრულება (.+)\)$/, (m, a) => `Still due from the client (contract ${a})`],
  [/^დასრულებამდე (\d+) დღე$/, (m, a) => `${a} days to the finish`],
  [/^ვადა გადაცილებულია (\d+) დღით$/, (m, a) => `${a} days past the finish date`],
  [/^ახალი პაროლი - (.+)$/s, (m, a) => `New password - ${a}`],
];

/** One phrase in the interface's language. Georgian is returned as it is. */
export function tr(text) {
  if (lang !== 'en' || text == null) return text;
  const s = String(text);
  const core = s.trim();
  if (!core || !/[Ⴀ-ჿ]/.test(core)) return s;
  const out = lookup(core);
  return out == null ? s : s.replace(core, out);
}

function lookup(core) {
  if (core in EN) return EN[core];
  for (const [re, make] of PATTERNS) {
    const m = core.match(re);
    if (m) return make(...m);
  }
  // "+ ახალი პროექტი", "← მიმდინარე პროექტები", "ყველა (5)", "Label:" - the words inside.
  let m = core.match(/^([+←] )(.+)$/s);
  if (m) { const inner = lookup(m[2]); return inner == null ? null : m[1] + inner; }
  m = core.match(/^(.+?) \((\d+)\)$/s);
  if (m) { const inner = lookup(m[1]); return inner == null ? null : `${inner} (${m[2]})`; }
  return null;
}

// ---------- The screen: every Georgian phrase put into English as it appears ----------
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT']);
const ATTRS = ['placeholder', 'title', 'alt', 'aria-label'];

function translateNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const parent = node.parentElement;
    if (!parent || SKIP.has(parent.tagName) || parent.closest('[data-no-t]')) return;
    const next = tr(node.nodeValue);
    if (next !== node.nodeValue) node.nodeValue = next;
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE || node.closest('[data-no-t]')) return;
  for (const el of [node, ...node.querySelectorAll('*')]) {
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (v) { const next = tr(v); if (next !== v) el.setAttribute(a, next); }
    }
  }
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) translateNode(t);
}

/** Starts the ქარ / EN switches, and in English keeps the screen translated. */
export function startLanguage() {
  document.querySelectorAll('[data-lang-switch]').forEach((b) => {
    b.textContent = lang === 'en' ? 'ქარ' : 'EN';
    b.title = lang === 'en' ? 'ქართულად' : 'In English';
    b.addEventListener('click', () => setLang(lang === 'en' ? 'ka' : 'en'));
  });
  if (lang !== 'en') return;
  document.documentElement.lang = 'en';
  translateNode(document.body);
  new MutationObserver((changes) => {
    for (const c of changes) {
      if (c.type === 'characterData') translateNode(c.target);
      else if (c.type === 'attributes') translateNode(c.target);
      else c.addedNodes.forEach(translateNode);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
