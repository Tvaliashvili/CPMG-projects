// CPMG Projects - signing in, moving between pages, the projects list.
import { db, q } from './db.js';
import { $, $$, esc, fmtDate, lari, todayISO, toast, openForm, numOrNull } from './ui.js';
import { state, isAdmin, isStaff, loadProject, progressOf } from './state.js';
import { renderLogs } from './logs.js';
import { renderTimetable } from './timetable.js';
import { renderContractors } from './contractors.js';
import { renderMoney } from './money.js';
import { renderReport } from './report.js';
import { renderPeople } from './people.js';

const view = $('#view');

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

$('#sign-out').addEventListener('click', () => db.auth.signOut());

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
    $('#login').classList.remove('hidden');
    return;
  }
  try {
    state.me = await q(db.from('people').select('*').eq('user_id', userId).maybeSingle());
  } catch (e) { toast(e.message, true); }
  if (!state.me) {
    toast('ანგარიში ჯერ არ არის გამართული. მიმართეთ ადმინისტრატორს.', true);
    await db.auth.signOut();
    return;
  }
  $('#me-name').textContent = state.me.full_name;
  $$('[data-admin]').forEach((el) => { el.hidden = !isAdmin(); });
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  route();
}

// =============================================================
// Pages: #/ projects, #/p/<id>/<tab>, #/people, #/account
// =============================================================
window.addEventListener('hashchange', () => { if (state.me) route(); });

export async function route() {
  const [page, id, tab] = location.hash.replace(/^#\/?/, '').split('/');
  $$('.topnav a').forEach((a) => a.classList.toggle('active', a.dataset.top === (page === 'people' ? 'people' : 'projects')));
  window.scrollTo(0, 0);
  try {
    if (page === 'p' && id) await showProject(id, tab || 'log');
    else if (page === 'people' && isAdmin()) await renderPeople(view);
    else if (page === 'account') showAccount();
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
      ${isStaff() && !showArchived ? '<button class="btn btn-primary" data-new-project>+ ახალი პროექტი</button>' : ''}
    </div>
    ${shown.length ? `<div class="grid-cards">${shown.map((p) => {
      const prog = progressOf(tasks.filter((t) => t.project_id === p.id), today);
      return `
        <a class="card project-card" href="#/p/${p.id}/log">
          <h3>${esc(p.name)}</h3>
          ${p.client ? `<span class="muted small">დამკვეთი: ${esc(p.client)}</span>` : ''}
          ${p.address ? `<span class="muted small">${esc(p.address)}</span>` : ''}
          <span class="muted small">${p.start_date ? `${fmtDate(p.start_date)} - ${fmtDate(p.end_date)}` : 'თარიღები არ არის მითითებული'}</span>
          ${prog.count ? `
            <div class="bar" title="შესრულებულია ${prog.actual}%"><span style="width:${prog.actual}%"></span></div>
            <span class="small">შესრულებულია <b>${prog.actual}%</b> <span class="muted">· გეგმით ${prog.planned}%</span></span>` : ''}
        </a>`;
    }).join('')}</div>`
    : `<div class="empty">${showArchived ? 'დასრულებული პროექტები არ არის.' : isStaff() ? 'პროექტები ჯერ არ არის. დაამატეთ პირველი.' : 'თქვენთვის ჯერ არცერთი პროექტი არ არის გაზიარებული.'}</div>`}
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
  ['contractors', 'კონტრაქტორები', renderContractors, true],
  ['money', 'ფინანსები', renderMoney, true],
  ['report', 'ანგარიში', renderReport, true],
];

async function showProject(id, tab) {
  if (state.project?.id !== id) {
    view.innerHTML = '<p class="muted">იტვირთება…</p>';
    const project = await loadProject(id);
    if (!project) throw new Error('პროექტი ვერ მოიძებნა, ან მისი ნახვის უფლება არ გაქვთ.');
  }
  const tabs = TABS.filter(([, , , staffOnly]) => !staffOnly || isStaff());
  const current = tabs.find(([key]) => key === tab) ?? tabs[0];
  const p = state.project;

  view.innerHTML = `
    <div class="project-head">
      <div>
        <h1>${esc(p.name)}</h1>
        <p class="muted small" style="margin:0.2rem 0 0">${[
          p.client && `დამკვეთი: ${esc(p.client)}`,
          p.address && esc(p.address),
          p.start_date && `${fmtDate(p.start_date)} - ${fmtDate(p.end_date)}`,
          isStaff() && p.contract_value && `ხელშეკრულება: ${lari(p.contract_value)}`,
        ].filter(Boolean).join(' · ')}</p>
      </div>
      ${isStaff() ? '<button class="btn btn-ghost btn-sm" data-edit-project>პროექტის რედაქტირება</button>' : ''}
    </div>
    <nav class="tabs">${tabs.map(([key, label]) => `<a href="#/p/${p.id}/${key}" class="${key === current[0] ? 'active' : ''}">${label}</a>`).join('')}</nav>
    <div id="tab"></div>`;
  $('[data-edit-project]', view)?.addEventListener('click', () => projectForm(p));
  // On a phone the tabs scroll sideways: the open one is brought into sight.
  const active = $('.tabs a.active', view);
  active.parentElement.scrollLeft = active.offsetLeft - 16;
  await current[2]($('#tab'));
}

/** Re-draws the open tab after a change. */
export function refresh() { route(); }

function projectForm(p = null) {
  openForm({
    title: p ? 'პროექტის რედაქტირება' : 'ახალი პროექტი',
    body: `
      <label>დასახელება<input name="name" required maxlength="160" value="${esc(p?.name)}"></label>
      <label>დამკვეთი<input name="client" maxlength="160" value="${esc(p?.client)}"></label>
      <label>მისამართი<input name="address" maxlength="200" value="${esc(p?.address)}"></label>
      <div class="row">
        <label>დაწყება<input name="start_date" type="date" value="${esc(p?.start_date)}"></label>
        <label>დასრულება<input name="end_date" type="date" value="${esc(p?.end_date)}"></label>
      </div>
      <label>ხელშეკრულების ღირებულება (₾)<input name="contract_value" inputmode="decimal" value="${esc(p?.contract_value)}"></label>
      ${p ? `<label class="check"><input type="checkbox" name="archived" ${p.archived ? 'checked' : ''}> პროექტი დასრულებულია</label>` : ''}`,
    onSubmit: async (form, data) => {
      const row = {
        name: data.get('name').trim(),
        client: data.get('client').trim() || null,
        address: data.get('address').trim() || null,
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

// =============================================================
// My account: a new password
// =============================================================
function showAccount() {
  view.innerHTML = `
    <div class="page-head"><h1>ჩემი ანგარიში</h1></div>
    <div class="card stack" style="max-width:30rem">
      <p style="margin:0"><b>${esc(state.me.full_name)}</b><br><span class="muted">${esc(state.me.email)}</span></p>
      <form id="password-form" class="stack">
        <label>ახალი პაროლი<input name="password" type="password" minlength="8" autocomplete="new-password" required></label>
        <label>გაიმეორეთ<input name="again" type="password" minlength="8" autocomplete="new-password" required></label>
        <button class="btn btn-primary" type="submit">პაროლის შეცვლა</button>
      </form>
    </div>`;
  $('#password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    if (f.password.value !== f.again.value) { toast('პაროლები არ ემთხვევა.', true); return; }
    const { error } = await db.auth.updateUser({ password: f.password.value });
    if (error) { toast(error.message, true); return; }
    f.reset();
    toast('პაროლი შეიცვალა');
  });
}
