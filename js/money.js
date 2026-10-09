// Money: what came in, what went out, and the balance month by month.
import { db, q } from './db.js';
import { $, $$, esc, lari, fmtDate, monthName, todayISO, toast, openForm, options, numOrNull, MONTHS_SHORT } from './ui.js';
import { tr } from './i18n.js';
import { state, reloadMoney, contractorName, CATEGORIES, IN_CATEGORIES, OUT_CATEGORIES, moneyTotals, moneyByMonth } from './state.js';

let filter = 'all';
let chart = null;

export async function renderMoney(el) {
  const t = moneyTotals(state.money);
  const months = moneyByMonth(state.money);
  const contractValue = Number(state.project.contract_value ?? 0);
  const fromClient = state.money.filter((m) => m.direction === 'in' && m.category === 'client').reduce((s, m) => s + Number(m.amount), 0);
  const entries = state.money.filter((m) => filter === 'all' || m.direction === filter).slice().reverse();

  el.innerHTML = `
    <div class="page-head">
      <h2>ფინანსები</h2>
      <button class="btn btn-primary" data-add>+ ჩანაწერის დამატება</button>
    </div>
    <div class="stats">
      <div class="stat"><b class="good">${lari(t.incoming)}</b><span>შემოსავალი</span></div>
      <div class="stat"><b class="bad">${lari(t.outgoing)}</b><span>გასავალი</span></div>
      <div class="stat"><b class="${t.balance < 0 ? 'bad' : ''}">${lari(t.balance)}</b><span>ბალანსი</span></div>
      ${contractValue ? `<div class="stat"><b>${lari(contractValue - fromClient)}</b><span>დამკვეთისგან მისაღები (ხელშეკრულება ${lari(contractValue)})</span></div>` : ''}
    </div>
    ${months.length ? `
      <div class="card" style="margin-top:1rem"><h3 style="margin-bottom:0.6rem">ფულადი ნაკადი თვეების მიხედვით</h3><div class="chart-box"><canvas></canvas></div></div>
      <div class="table-wrap" style="margin-top:1rem">
        <table>
          <thead><tr><th>თვე</th><th class="num">შემოსავალი</th><th class="num">გასავალი</th><th class="num hide-phone">სხვაობა</th><th class="num">ნაშთი</th></tr></thead>
          <tbody>${months.map((m) => `
            <tr><td>${monthName(m.month)}</td><td class="num good">${lari(m.incoming)}</td><td class="num bad">${lari(m.outgoing)}</td>
              <td class="num hide-phone">${lari(m.net)}</td><td class="num ${m.balance < 0 ? 'bad' : ''}"><b>${lari(m.balance)}</b></td></tr>`).join('')}</tbody>
        </table>
      </div>` : ''}
    <div class="page-head" style="margin:1.5rem 0 0.8rem">
      <h3>ჩანაწერები</h3>
      <div class="filter">${[['all', 'ყველა'], ['in', 'შემოსავალი'], ['out', 'გასავალი']].map(([k, label]) => `<button type="button" data-filter="${k}" class="${filter === k ? 'active' : ''}">${label}</button>`).join('')}</div>
    </div>
    ${entries.length ? `
      <div class="table-wrap">
        <table>
          <thead><tr><th>თარიღი</th><th>სახე</th><th class="hide-phone">აღწერა</th><th class="num">თანხა</th></tr></thead>
          <tbody>${entries.map((m) => `
            <tr class="click" data-entry="${m.id}">
              <td class="small" style="white-space:nowrap">${fmtDate(m.entry_date)}</td>
              <td><span class="chip ${m.direction === 'in' ? 'chip-in' : 'chip-out'}">${esc(CATEGORIES[m.category])}</span>
                ${m.contractor_id ? `<br><span class="small">${esc(contractorName(m.contractor_id))}</span>` : ''}
                ${m.description ? `<span class="muted small show-phone">${esc(m.description)}</span>` : ''}</td>
              <td class="hide-phone small">${esc(m.description) || '<span class="muted">-</span>'}</td>
              <td class="num ${m.direction === 'in' ? 'good' : 'bad'}">${m.direction === 'in' ? '+' : '−'}${lari(m.amount)}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>` : '<div class="empty">ჩანაწერები ჯერ არ არის.</div>'}`;

  $('[data-add]', el).addEventListener('click', () => moneyForm(null, el));
  $$('[data-filter]', el).forEach((b) => b.addEventListener('click', () => { filter = b.dataset.filter; renderMoney(el); }));
  $$('[data-entry]', el).forEach((tr) => tr.addEventListener('click', () => moneyForm(state.money.find((m) => m.id === tr.dataset.entry), el)));
  drawChart($('canvas', el), months);
}

/** In and out as bars, the balance as a line. */
export function drawChart(canvas, months, { animate = true } = {}) {
  chart?.destroy();
  chart = null;
  if (!canvas || !window.Chart) return;
  const label = (ym) => `${tr(MONTHS_SHORT[Number(ym.slice(5, 7)) - 1])} ${ym.slice(2, 4)}`;
  chart = new window.Chart(canvas, {
    data: {
      labels: months.map((m) => label(m.month)),
      datasets: [
        { type: 'bar', label: tr('შემოსავალი'), data: months.map((m) => m.incoming), backgroundColor: '#4ead72', borderRadius: 4 },
        { type: 'bar', label: tr('გასავალი'), data: months.map((m) => m.outgoing), backgroundColor: '#e07a7a', borderRadius: 4 },
        { type: 'line', label: tr('ნაშთი'), data: months.map((m) => m.balance), borderColor: '#1f3b63', backgroundColor: '#1f3b63', tension: 0.25, pointRadius: 3 },
      ],
    },
    options: {
      maintainAspectRatio: false,
      animation: animate ? undefined : false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom' },
        tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${lari(c.raw)}` } },
      },
      scales: { y: { ticks: { callback: (v) => `${Number(v).toLocaleString('en-US')} ₾` } } },
    },
  });
}

function moneyForm(m, el) {
  const direction = m?.direction ?? 'out';
  openForm({
    title: m ? 'ჩანაწერის რედაქტირება' : 'ახალი ჩანაწერი',
    body: `
      <div class="radio-row">
        <label><input type="radio" name="direction" value="in" ${direction === 'in' ? 'checked' : ''}> შემოსავალი</label>
        <label><input type="radio" name="direction" value="out" ${direction === 'out' ? 'checked' : ''}> გასავალი</label>
      </div>
      <div class="row">
        <label>თარიღი<input name="entry_date" type="date" required value="${esc(m?.entry_date ?? todayISO())}"></label>
        <label>თანხა (₾)<input name="amount" inputmode="decimal" required value="${esc(m?.amount)}"></label>
      </div>
      <label>სახე<select name="category"></select></label>
      <label data-contractor-field>კონტრაქტორი<select name="contractor_id">${options([['', '-'], ...state.contractors.map((c) => [c.id, c.name])], m?.contractor_id)}</select></label>
      <label>აღწერა<input name="description" maxlength="300" placeholder="მაგ. ავანსი, ინვოისი №…" value="${esc(m?.description)}"></label>`,
    onOpen: (form) => {
      const sync = () => {
        const dir = form.direction.value;
        const allowed = dir === 'in' ? IN_CATEGORIES : OUT_CATEGORIES;
        const current = form.category.value || m?.category;
        form.category.innerHTML = options(allowed.map((k) => [k, CATEGORIES[k]]), allowed.includes(current) ? current : allowed[0]);
        syncContractor();
      };
      const syncContractor = () => {
        const show = form.category.value === 'contractor';
        $('[data-contractor-field]', form).hidden = !show;
        form.contractor_id.required = show;
      };
      $$('[name=direction]', form).forEach((r) => r.addEventListener('change', sync));
      form.category.addEventListener('change', syncContractor);
      sync();
    },
    onSubmit: async (form, data) => {
      const amount = numOrNull(data.get('amount'));
      if (!(amount > 0)) throw new Error('თანხა რიცხვით ჩაწერეთ.');
      const category = data.get('category');
      const row = {
        direction: data.get('direction'),
        entry_date: data.get('entry_date'),
        amount,
        category,
        contractor_id: category === 'contractor' ? data.get('contractor_id') || null : null,
        description: data.get('description').trim() || null,
      };
      if (m) await q(db.from('money').update(row).eq('id', m.id));
      else await q(db.from('money').insert({ ...row, project_id: state.project.id }));
      await reloadMoney();
      toast('შენახულია');
      renderMoney(el);
    },
    onDelete: m ? async () => {
      await q(db.from('money').delete().eq('id', m.id));
      await reloadMoney();
      renderMoney(el);
    } : null,
  });
}
