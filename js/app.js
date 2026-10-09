// CPMG Projects - signing in, moving between pages, the projects list.
import { db, q, signOutHere } from './db.js';
import { $, $$, esc, fmtDate, lari, todayISO, toast, openForm, numOrNull, pick, pair, texts } from './ui.js';
import { state, isAdmin, isStaff, loadProject, progressOf } from './state.js';
import { renderLogs } from './logs.js';
import { renderTimetable } from './timetable.js';
import { renderDocuments } from './documents.js';
import { renderDayReport } from './dayreport.js';
import { renderChat, stopChat } from './chat.js';
import { renderContractors } from './contractors.js';
import { renderMoney } from './money.js';
import { renderReport } from './report.js';
import { renderPeople } from './people.js';
import { startLanguage, tr } from './i18n.js';

const view = $('#view');
startLanguage(); // ქარ / EN

// Installable on a phone ("Add to Home screen"); the site works the same without it.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* not essential */ });
}

// =============================================================
// Signing in
// =============================================================
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const error = $('.form-error', form);
  const button = $('button', form);
  error.hidden = true;
  button.disabled = true;
  const { error: failed } = await db.auth.signInWithPassword({
    email: form.email.value.trim(), password: form.password.value,
  });
  button.disabled = false;
  if (failed) {
    error.textContent = /invalid/i.test(failed.message) ? 'ელფოსტა ან პაროლი არასწორია.' : failed.message;
    error.hidden = false;
  }
});

// Signing out clears this device's sign-in even when the server has already ended it
// (a changed password ends every session there).
$('#sign-out').addEventListener('click', () => signOutHere());

// Choosing one's own password, after an administrator set a temporary one.
$('[data-choose-sign-out]').addEventListener('click', () => signOutHere());
$('#choose-password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const error = $('.form-error', form);
  const fail = (text) => { error.textContent = text; error.hidden = false; $$('button', form).forEach((b) => { b.disabled = false; }); };
  error.hidden = true;
  const password = form.password.value;
  if (password !== form.again.value) return fail(tr('პაროლები არ ემთხვევა.'));
  $$('button', form).forEach((b) => { b.disabled = true; });
  const { error: failed } = await db.auth.updateUser({ password });
  if (failed) {
    return fail(/different|same/i.test(failed.message) ? tr('ახალი პაროლი დროებითისგან უნდა განსხვავდებოდეს.') : failed.message);
  }
  await db.rpc('password_changed');
  // A new password can end the session on the server: signing in again with it keeps going.
  await db.auth.signInWithPassword({ email: state.me.email, password });
  state.me.must_change_password = false;
  form.reset();
  $$('button', form).forEach((b) => { b.disabled = false; });
  $('#choose-password').classList.add('hidden');
  openApp();
  toast(tr('პაროლი შეიცვალა'));
});

let signedInAs; // undefined until the first answer, so "signed out" is shown too
db.auth.onAuthStateChange((_event, session) => {
  // Deferred: Supabase asks that its client not be awaited inside this callback.
  setTimeout(() => onSession(session), 0);
});

async function onSession(session) {
  const userId = session?.user?.id ?? null;
  if (userId === signedInAs) return;
  signedInAs = userId;
  if (!userId) {
    state.me = null;
    $('#app').classList.add('hidden');
    $('#choose-password').classList.add('hidden');
    $('#login').classList.remove('hidden');
    return;
  }
  // A sign-in the server has ended (say, after a password change) still opens pages for
  // a while, but cannot sign out or add people: it is dropped now, for a fresh sign-in.
  const { error: dead } = await db.auth.getUser();
  if (dead && dead.name !== 'AuthRetryableFetchError') { // not merely offline
    toast('სესია ამოიწურა. შედით თავიდან.', true);
    await signOutHere();
    return;
  }
  try {
    state.me = await q(db.from('people').select('*').eq('user_id', userId).maybeSingle());
  } catch (e) { toast(e.message, true); }
  if (!state.me) {
    toast('ანგარიში ჯერ არ არის გამართული. მიმართეთ ადმინისტრატორს.', true);
    await signOutHere();
    return;
  }
  if (state.me.must_change_password) { // the password was an administrator's
    $('#login').classList.add('hidden');
    $('#choose-password').classList.remove('hidden');
    return;
  }
  openApp();
}

function openApp() {
  $('#me-name').textContent = pick(state.me, 'full_name');
  $$('[data-admin]').forEach((el) => { el.hidden = !isAdmin(); });
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  route();
}

// =============================================================
// Pages: #/ projects, #/p/<id>/<tab>, #/people
// =============================================================
window.addEventListener('hashchange', () => { if (state.me) route(); });

export async function route() {
  const [page, id, tab, extra] = location.hash.replace(/^#\/?/, '').split('/');
  $$('.topnav a').forEach((a) => a.classList.toggle('active', a.dataset.top === (page === 'people' ? 'people' : 'projects')));
  window.scrollTo(0, 0);
  stopChat(); // the chat listens only while it is open
  try {
    if (page === 'p' && id) await showProject(id, tab || 'log', extra);
    else if (page === 'people' && isAdmin()) await renderPeople(view);
    else await showProjects();
  } catch (e) {
    view.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

// =============================================================
// Projects list
// =============================================================
let showArchived = false;

async function showProjects() {
  state.project = null; // opened again, a project loads afresh
  view.innerHTML = '<p class="muted">იტვირთება…</p>';
  const [projects, tasks] = await Promise.all([
    q(db.from('projects').select('*').order('created_at', { ascending: false })),
    q(db.from('tasks').select('project_id, start_date, end_date, progress')),
  ]);
  const today = todayISO();
  const shown = projects.filter((p) => p.archived === showArchived);
  const archivedCount = projects.filter((p) => p.archived).length;

  view.innerHTML = `
    <div class="page-head">
      <h1>${showArchived ? 'დასრულებული პროექტები' : 'პროექტები'}</h1>
      ${isAdmin() && !showArchived ? '<button class="btn btn-primary" data-new-project>+ ახალი პროექტი</button>' : ''}
    </div>
    ${shown.length ? `<div class="grid-cards">${shown.map((p) => {
      const prog = progressOf(tasks.filter((t) => t.project_id === p.id), today);
      return `
        <a class="card project-card" href="#/p/${p.id}/log">
          <h3>${esc(pick(p, 'name'))}</h3>
          ${pick(p, 'client') ? `<span class="muted small">დამკვეთი: ${esc(pick(p, 'client'))}</span>` : ''}
          ${pick(p, 'address') ? `<span class="muted small">${esc(pick(p, 'address'))}</span>` : ''}
          <span class="muted small">${p.start_date ? `${fmtDate(p.start_date)} - ${fmtDate(p.end_date)}` : 'თარიღები არ არის მითითებული'}</span>
          ${prog.count ? `
            <div class="bar" title="შესრულებულია ${prog.actual}%"><span style="width:${prog.actual}%"></span></div>
            <span class="small">შესრულებულია <b>${prog.actual}%</b> <span class="muted">· გეგმით ${prog.planned}%</span></span>` : ''}
        </a>`;
    }).join('')}</div>`
    : `<div class="empty">${showArchived ? 'დასრულებული პროექტები არ არის.' : isAdmin() ? 'პროექტები ჯერ არ არის. დაამატეთ პირველი.' : 'თქვენთვის ჯერ არცერთი პროექტი არ არის გაზიარებული.'}</div>`}
    ${archivedCount || showArchived ? `<p style="margin-top:1.2rem"><a href="#/" data-toggle-archived>${showArchived ? '← მიმდინარე პროექტები' : `დასრულებული პროექტები (${archivedCount})`}</a></p>` : ''}`;

  $('[data-new-project]', view)?.addEventListener('click', () => projectForm());
  $('[data-toggle-archived]', view)?.addEventListener('click', (e) => {
    e.preventDefault();
    showArchived = !showArchived;
    showProjects();
  });
}

// =============================================================
// One project: its header and tabs
// =============================================================
const TABS = [
  ['log', 'დღიური ჟურნალი', renderLogs, false],
  ['plan', 'გრაფიკი', renderTimetable, false],
  ['docs', 'დოკუმენტები', renderDocuments, false],
  ['chat', 'ჩატი', renderChat, false],
  ['contractors', 'კონტრაქტორები', renderContractors, true],
  ['money', 'ფინანსები', renderMoney, true],
  ['report', 'ანგარიში', renderReport, true],
];

async function showProject(id, tab, extra) {
  if (state.project?.id !== id) {
    view.innerHTML = '<p class="muted">იტვირთება…</p>';
    const project = await loadProject(id);
    if (!project) throw new Error('პროექტი ვერ მოიძებნა, ან მისი ნახვის უფლება არ გაქვთ.');
  }
  const tabs = TABS.filter(([, , , staffOnly]) => !staffOnly || isStaff());
  // A day's report (#/p/<id>/day/<log>) sits under the daily log tab.
  const day = tab === 'day' && extra;
  const current = tabs.find(([key]) => key === (day ? 'log' : tab)) ?? tabs[0];
  const p = state.project;

  view.innerHTML = `
    <div class="project-head">
      <div>
        <h1>${esc(pick(p, 'name'))}</h1>
        <p class="muted small" style="margin:0.2rem 0 0">${[
          pick(p, 'client') && `დამკვეთი: ${esc(pick(p, 'client'))}`,
          pick(p, 'address') && esc(pick(p, 'address')),
          p.start_date && `${fmtDate(p.start_date)} - ${fmtDate(p.end_date)}`,
          isStaff() && p.contract_value && `ხელშეკრულება: ${lari(p.contract_value)}`,
        ].filter(Boolean).map((part) => `<span>${part}</span>`).join(' · ')}</p>
      </div>
      ${isAdmin() ? '<button class="btn btn-ghost btn-sm" data-edit-project>პროექტის რედაქტირება</button>' : ''}
    </div>
    <nav class="tabs">${tabs.map(([key, label]) => `<a href="#/p/${p.id}/${key}" class="${key === current[0] ? 'active' : ''}">${label}</a>`).join('')}</nav>
    <div id="tab"></div>`;
  $('[data-edit-project]', view)?.addEventListener('click', () => projectForm(p));
  // On a phone the tabs scroll sideways: the open one is brought into sight.
  const active = $('.tabs a.active', view);
  active.parentElement.scrollLeft = active.offsetLeft - 16;
  if (day) await renderDayReport($('#tab'), extra);
  else await current[2]($('#tab'));
}

/** Re-draws the open tab after a change. */
export function refresh() { route(); }

function projectForm(p = null) {
  openForm({
    title: p ? 'პროექტის რედაქტირება' : 'ახალი პროექტი',
    body: `
      ${pair('დასახელება', 'name', p, { required: true, maxlength: 160 })}
      ${pair('დამკვეთი', 'client', p, { maxlength: 160 })}
      ${pair('მისამართი', 'address', p, { maxlength: 200 })}
      <div class="row">
        <label>დაწყება<input name="start_date" type="date" value="${esc(p?.start_date)}"></label>
        <label>დასრულება<input name="end_date" type="date" value="${esc(p?.end_date)}"></label>
      </div>
      <label>ხელშეკრულების ღირებულება (₾)<input name="contract_value" inputmode="decimal" value="${esc(p?.contract_value)}"></label>
      ${p ? `<label class="check"><input type="checkbox" name="archived" ${p.archived ? 'checked' : ''}> პროექტი დასრულებულია</label>` : ''}`,
    onSubmit: async (form, data) => {
      const row = {
        ...texts(data, 'name'),
        ...texts(data, 'client'),
        ...texts(data, 'address'),
        start_date: data.get('start_date') || null,
        end_date: data.get('end_date') || null,
        contract_value: numOrNull(data.get('contract_value')),
      };
      if (row.start_date && row.end_date && row.end_date < row.start_date) throw new Error('დასრულება დაწყებამდე ვერ იქნება.');
      if (row.contract_value !== null && !(row.contract_value >= 0)) throw new Error('ღირებულება რიცხვით ჩაწერეთ.');
      if (p) {
        row.archived = data.get('archived') === 'on';
        await q(db.from('projects').update(row).eq('id', p.id));
        Object.assign(state.project, row);
        toast('შენახულია');
        route();
      } else {
        const made = await q(db.from('projects').insert(row).select().single());
        location.hash = `#/p/${made.id}/plan`;
      }
    },
    onDelete: p && isAdmin() ? async () => {
      await q(db.from('projects').delete().eq('id', p.id));
      state.project = null;
      toast('პროექტი წაიშალა');
      location.hash = '#/';
    } : null,
    deleteText: 'პროექტის წაშლა',
  });
}
