// Timetable: the work items with their dates, who does them and how far they are, as bars on a time line.
import { db, q } from './db.js';
import { $, $$, esc, fmtDate, todayISO, toast, openForm, options, daysBetween, MONTHS_SHORT, pick, pair, texts } from './ui.js';
import { state, isAdmin, reloadTasks, contractorName, taskStatus, STATUS, progressOf } from './state.js';

export async function renderTimetable(el) {
  const today = todayISO();
  const tasks = state.tasks;
  const prog = progressOf(tasks, today);
  const late = tasks.filter((t) => taskStatus(t, today) === 'late');
  const range = timeRange(tasks, today);

  el.innerHTML = `
    <div class="page-head">
      <h2>გრაფიკი</h2>
      ${isAdmin() ? '<button class="btn btn-primary" data-new-task>+ სამუშაოს დამატება</button>' : ''}
    </div>
    ${tasks.length ? `
      <div class="stats" style="margin-bottom:1rem">
        <div class="stat"><b>${prog.actual}%</b><span>შესრულებულია</span></div>
        <div class="stat"><b>${prog.planned}%</b><span>გეგმით დღეისთვის</span></div>
        <div class="stat"><b class="${late.length ? 'bad' : ''}">${late.length}</b><span>ვადაგადაცილებული</span></div>
        <div class="stat"><b>${tasks.filter((t) => t.progress >= 100).length} / ${tasks.length}</b><span>დასრულებული სამუშაო</span></div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>სამუშაო</th><th class="hide-phone">კონტრაქტორი</th><th>ვადები</th><th>შესრულება</th>
            <th class="gantt-cell hide-phone">${scale(range)}</th>
          </tr></thead>
          <tbody>${tasks.map((t) => row(t, today, range)).join('')}</tbody>
        </table>
      </div>` : `<div class="empty">${isAdmin() ? 'გრაფიკი ცარიელია. დაამატეთ პირველი სამუშაო.' : 'გრაფიკი ჯერ არ არის.'}</div>`}`;

  $('[data-new-task]', el)?.addEventListener('click', () => taskForm(null, el));
  if (isAdmin()) {
    $$('[data-task]', el).forEach((tr) => tr.addEventListener('click', () => taskForm(state.tasks.find((t) => t.id === tr.dataset.task), el)));
  }
}

function row(t, today, range) {
  const status = taskStatus(t, today);
  const [label, chip] = STATUS[status];
  return `
    <tr ${isAdmin() ? `class="click" data-task="${t.id}"` : ''}>
      <td><b>${esc(pick(t, 'name'))}</b>${pick(t, 'notes') ? `<br><span class="muted small">${esc(pick(t, 'notes'))}</span>` : ''}
        ${t.contractor_id ? `<span class="muted small show-phone">${esc(contractorName(t.contractor_id))}</span>` : ''}</td>
      <td class="hide-phone">${esc(contractorName(t.contractor_id)) || '<span class="muted">-</span>'}</td>
      <td class="small" style="white-space:nowrap">${fmtDate(t.start_date)}<br>${fmtDate(t.end_date)}</td>
      <td><b>${t.progress}%</b><br><span class="chip ${chip}">${label}</span></td>
      <td class="gantt-cell hide-phone">${ganttTrack(t, today, range)}</td>
    </tr>`;
}

/** One item's bar on the time line, its done part filled, with today marked. */
export function ganttTrack(t, today, range) {
  const pct = (iso) => (daysBetween(range.from, iso) / range.days) * 100;
  const left = pct(t.start_date);
  const width = Math.max(pct(t.end_date) + 100 / range.days - left, 0.8);
  return `
    <div class="gantt-track">
      <div class="gantt-bar${taskStatus(t, today) === 'late' ? ' late' : ''}" style="left:${left}%;width:${width}%"><span style="width:${t.progress}%"></span></div>
      ${range.from <= today && today <= range.to ? `<div class="gantt-today" style="left:${pct(today)}%" title="დღეს"></div>` : ''}
    </div>`;
}

/** From the earliest start to the latest finish, the project's own dates included. */
export function timeRange(tasks, today) {
  const dates = tasks.flatMap((t) => [t.start_date, t.end_date]);
  if (state.project.start_date) dates.push(state.project.start_date);
  if (state.project.end_date) dates.push(state.project.end_date);
  if (!dates.length) dates.push(today);
  const from = dates.reduce((a, b) => (a < b ? a : b));
  const to = dates.reduce((a, b) => (a > b ? a : b));
  return { from, to, days: daysBetween(from, to) + 1 };
}

/** Month marks over the bars - every month, or fewer on a long project. */
export function scale(range) {
  const marks = [];
  let y = Number(range.from.slice(0, 4));
  let m = Number(range.from.slice(5, 7));
  const months = [];
  for (;;) {
    m += 1;
    if (m > 12) { m = 1; y += 1; }
    const iso = `${y}-${String(m).padStart(2, '0')}-01`;
    if (iso > range.to) break;
    months.push(iso);
  }
  const step = Math.ceil(months.length / 8) || 1;
  months.forEach((iso, i) => {
    if (i % step) return;
    const left = (daysBetween(range.from, iso) / range.days) * 100;
    const month = Number(iso.slice(5, 7));
    marks.push(`<span style="left:${left}%">${MONTHS_SHORT[month - 1]}${month === 1 ? ` ${iso.slice(2, 4)}` : ''}</span>`);
  });
  return `<div class="gantt-scale">${marks.join('')}</div>`;
}

function taskForm(t, el) {
  const contractors = [['', '-'], ...state.contractors.map((c) => [c.id, pick(c, 'name')])];
  openForm({
    title: t ? 'სამუშაოს რედაქტირება' : 'ახალი სამუშაო',
    body: `
      ${pair('სამუშაო', 'name', t, { required: true, maxlength: 200 })}
      <label>კონტრაქტორი<select name="contractor_id">${options(contractors, t?.contractor_id)}</select></label>
      <div class="row">
        <label>დაწყება<input name="start_date" type="date" required value="${esc(t?.start_date ?? state.project.start_date ?? todayISO())}"></label>
        <label>დასრულება<input name="end_date" type="date" required value="${esc(t?.end_date ?? '')}"></label>
      </div>
      <label>შესრულება (%)<input name="progress" type="number" min="0" max="100" step="5" inputmode="numeric" required value="${t?.progress ?? 0}"></label>
      ${pair('შენიშვნა', 'notes', t, { maxlength: 300 })}
      ${state.contractors.length ? '' : '<p class="muted small" style="margin:0">კონტრაქტორები ემატება "კონტრაქტორები" გვერდზე.</p>'}`,
    onSubmit: async (form, data) => {
      const row = {
        ...texts(data, 'name'),
        contractor_id: data.get('contractor_id') || null,
        start_date: data.get('start_date'),
        end_date: data.get('end_date'),
        progress: Math.min(100, Math.max(0, Math.round(Number(data.get('progress'))))),
        ...texts(data, 'notes'),
      };
      if (row.end_date < row.start_date) throw new Error('დასრულება დაწყებამდე ვერ იქნება.');
      if (t) await q(db.from('tasks').update(row).eq('id', t.id));
      else await q(db.from('tasks').insert({ ...row, project_id: state.project.id }));
      await reloadTasks();
      toast('შენახულია');
      renderTimetable(el);
    },
    onDelete: t ? async () => {
      await q(db.from('tasks').delete().eq('id', t.id));
      await reloadTasks();
      renderTimetable(el);
    } : null,
  });
}
