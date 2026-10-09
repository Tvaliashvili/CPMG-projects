// People (administrators only): who can sign in, their role, and which projects a subcontractor sees.
import { db, q, peopleCall } from './db.js';
import { $, $$, esc, toast, openForm, options, pick, pair, texts } from './ui.js';
import { state, ROLE_NAMES } from './state.js';
import { tr } from './i18n.js';

const ROLE_HELP = {
  admin: 'ყველაფერი, მათ შორის მომხმარებლების მართვა',
  staff: 'ხედავს ყველა პროექტს; წერს მხოლოდ დღიურ ჟურნალს',
  subcontractor: 'მხოლოდ მონიშნული პროექტების ჟურნალი და გრაფიკი, ფინანსების გარეშე',
};

/** A password that is easy to read out: no 0/O or 1/l/I. */
function newPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return [...bytes].map((b) => chars[b % chars.length]).join('');
}

const siteAddress = () => location.href.split('#')[0];

export async function renderPeople(el) {
  const [people, projects, links] = await Promise.all([
    q(db.from('people').select('*').order('full_name')),
    q(db.from('projects').select('id, name, archived').order('name')),
    q(db.from('project_people').select('*')),
  ]);
  const projectsOf = (id) => links.filter((l) => l.user_id === id).map((l) => pick(projects.find((p) => p.id === l.project_id), 'name')).filter(Boolean);

  el.innerHTML = `
    <div class="page-head">
      <h1>მომხმარებლები</h1>
      <button class="btn btn-primary" data-add>+ მომხმარებლის დამატება</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>სახელი</th><th>როლი</th><th class="hide-phone">პროექტები</th><th></th></tr></thead>
        <tbody>${people.map((p) => `
          <tr>
            <td><b>${esc(pick(p, 'full_name'))}</b><br><span class="muted small">${esc(p.email)}</span>${pick(p, 'company') ? `<br><span class="small">${esc(pick(p, 'company'))}</span>` : ''}</td>
            <td>${ROLE_NAMES[p.role]}</td>
            <td class="hide-phone small">${p.role === 'subcontractor' ? esc(projectsOf(p.user_id).join(', ')) || '<span class="bad">არცერთი</span>' : '<span class="muted">ყველა</span>'}</td>
            <td class="num">
              <button class="btn btn-ghost btn-sm" data-edit="${p.user_id}">რედაქტირება</button>
              <button class="btn btn-ghost btn-sm" data-password="${p.user_id}">ახალი პაროლი</button>
            </td>
          </tr>`).join('')}</tbody>
      </table>
    </div>
    <p class="muted small">ახალ მომხმარებელს გადაეცით საიტის მისამართი, ელფოსტა და პაროლი. პაროლის შესაცვლელად დააჭირეთ "ახალი პაროლი".</p>`;

  const ctx = { el, people, projects, links };
  $('[data-add]', el).addEventListener('click', () => personForm(null, ctx));
  $$('[data-edit]', el).forEach((b) => b.addEventListener('click', () => personForm(people.find((p) => p.user_id === b.dataset.edit), ctx)));
  $$('[data-password]', el).forEach((b) => b.addEventListener('click', () => passwordForm(people.find((p) => p.user_id === b.dataset.password))));
}

function projectChecks(projects, chosen) {
  return projects.length
    ? `<div class="checks">${projects.map((p) => `
        <label class="check"><input type="checkbox" name="project" value="${p.id}" ${chosen.includes(p.id) ? 'checked' : ''}> ${esc(pick(p, 'name'))}${p.archived ? ' <span class="muted small">(დასრულებული)</span>' : ''}</label>`).join('')}</div>`
    : '<p class="muted small" style="margin:0">პროექტები ჯერ არ არის.</p>';
}

function personForm(person, { el, projects, links }) {
  const isMe = person?.user_id === state.me.user_id;
  const chosen = person ? links.filter((l) => l.user_id === person.user_id).map((l) => l.project_id) : [];
  openForm({
    title: person ? pick(person, 'full_name') : 'ახალი მომხმარებელი',
    body: `
      ${pair('სახელი და გვარი', 'full_name', person, { required: true, maxlength: 120 })}
      ${person ? '' : '<label>ელფოსტა<input name="email" type="email" required autocomplete="off"></label>'}
      <label>როლი<select name="role" ${isMe ? 'disabled' : ''}>${options(Object.entries(ROLE_NAMES), person?.role ?? 'staff')}</select></label>
      <p class="muted small" style="margin:-0.4rem 0 0" data-role-help></p>
      <div data-sub>
        ${pair('კომპანია', 'company', person, { maxlength: 120, placeholder: 'ქვეკონტრაქტორის კომპანია' })}
        <div style="margin-top:0.8rem"><div class="log-label">რომელ პროექტებს ხედავს</div>${projectChecks(projects, chosen)}</div>
      </div>
      ${person ? '' : `<label>პაროლი<input name="password" required minlength="8" value="${newPassword()}"></label>`}`,
    submit: person ? 'შენახვა' : 'დამატება',
    onOpen: (form) => {
      const sync = () => {
        const role = form.role.value;
        $('[data-role-help]', form).textContent = ROLE_HELP[role];
        $('[data-sub]', form).hidden = role !== 'subcontractor';
      };
      form.role.addEventListener('change', sync);
      sync();
    },
    onSubmit: async (form, data) => {
      const role = isMe ? person.role : data.get('role');
      const names = { ...texts(data, 'full_name'), ...texts(data, 'company') };
      const projectIds = role === 'subcontractor' ? data.getAll('project') : [];
      if (!person) {
        const email = data.get('email').trim().toLowerCase();
        const password = data.get('password');
        await peopleCall({ action: 'add', email, password, ...names, role, project_ids: projectIds });
        showCredentials(email, password);
        renderPeople(el);
        return true; // the form now shows what to pass on
      }
      await q(db.from('people').update({ ...names, role }).eq('user_id', person.user_id));
      await q(db.from('project_people').delete().eq('user_id', person.user_id));
      if (projectIds.length) await q(db.from('project_people').insert(projectIds.map((id) => ({ project_id: id, user_id: person.user_id }))));
      toast('შენახულია');
      renderPeople(el);
    },
    onDelete: person && !isMe ? async () => {
      await peopleCall({ action: 'remove', user_id: person.user_id });
      toast('მომხმარებელი წაიშალა');
      renderPeople(el);
    } : null,
  });
}

function passwordForm(person) {
  openForm({
    title: `ახალი პაროლი - ${pick(person, 'full_name')}`,
    body: `<label>პაროლი<input name="password" required minlength="8" value="${newPassword()}"></label>`,
    onSubmit: async (form, data) => {
      await peopleCall({ action: 'password', user_id: person.user_id, password: data.get('password') });
      showCredentials(person.email, data.get('password'));
      return true;
    },
  });
}

/** The details to send the person, with a button that copies them. */
function showCredentials(email, password) {
  const text = `CPMG Projects\n${tr('მისამართი:')} ${siteAddress()}\n${tr('ელფოსტა:')} ${email}\n${tr('პაროლი:')} ${password}`;
  openForm({
    title: 'გადაეცით ეს მონაცემები',
    body: `<div class="secret">${esc(text)}</div>
      <button type="button" class="btn btn-ghost" data-copy>კოპირება</button>`,
    onOpen: (form) => $('[data-copy]', form).addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(text); toast('დაკოპირდა'); } catch { toast('ვერ დაკოპირდა - მონიშნეთ ხელით.', true); }
    }),
  });
}
