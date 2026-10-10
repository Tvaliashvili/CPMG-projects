// Money: what came in, what went out, and the balance month by month.
import { db, q } from './db.js';
import { $, $$, esc, lari, fmtDate, monthName, todayISO, toast, openForm, options, numOrNull, MONTHS_SHORT, pick, text } from './ui.js';
import { tr } from './i18n.js';
import { state, isAdmin, reloadMoney, contractorName, CATEGORIES, IN_CATEGORIES, OUT_CATEGORIES, moneyTotals, moneyByMonth } from './state.js';

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
      ${isAdmin() ? '<button class="btn btn-primary" data-add>+ ჩანაწერის დამატება</button>' : ''}
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
            <tr ${isAdmin() ? `class="click" data-entry="${m.id}"` : ''}>
              <td class="small" style="white-space:nowrap">${fmtDate(m.entry_date)}</td>
              <td><span class="chip ${m.direction === 'in' ? 'chip-in' : 'chip-out'}">${esc(CATEGORIES[m.category])}</span>
                ${m.contractor_id ? `<br><span class="small">${esc(contractorName(m.contractor_id))}</span>` : ''}
                ${pick(m, 'description') ? `<span class="muted small show-phone">${esc(pick(m, 'description'))}</span>` : ''}
                ${m.waybill_no ? `<span class="muted small show-phone">ზედნადები: ${esc(m.waybill_no)}</span>` : ''}</td>
              <td class="hide-phone small">${esc(pick(m, 'description')) || '<span class="muted">-</span>'}
                ${m.waybill_no ? `<br><span class="muted">ზედნადები: ${esc(m.waybill_no)}</span>` : ''}</td>
              <td class="num ${m.direction === 'in' ? 'good' : 'bad'}">${m.direction === 'in' ? '+' : '−'}${lari(m.amount)}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>` : '<div class="empty">ჩანაწერები ჯერ არ არის.</div>'}`;

  $('[data-add]', el)?.addEventListener('click', () => moneyForm(null, el));
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

/** One line of an entry: its type, how much, and what it was. */
const lineHtml = (m = null) => `
  <div class="line" data-line${m ? ` data-id="${m.id}"` : ''}>
    <div class="line-top">
      <select data-f="category" aria-label="სახე"></select>
      <input data-f="amount" inputmode="decimal" placeholder="თანხა (₾)" aria-label="თანხა (₾)" value="${esc(m?.amount)}">
      <button type="button" class="line-del" data-del-line title="ხაზის წაშლა"${m ? ' hidden' : ''}>×</button>
    </div>
    <div class="line-texts">
      <input data-f="description" maxlength="300" placeholder="აღწერა ქართულად" value="${esc(m?.description)}">
      <input data-f="description_en" maxlength="300" lang="en" placeholder="English" value="${esc(m?.description_en)}">
    </div>
  </div>`;

/**
 * Money in or out. One purchase often holds several things - materials,
 * equipment - so an entry has lines: each its own type and amount, all on the
 * same date and waybill, each saved as an entry of its own. Editing changes
 * that one entry; lines added there are saved beside it.
 */
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
        <label data-waybill-field>ზედნადების ნომერი<input name="waybill_no" maxlength="40" placeholder="არასავალდებულო" value="${esc(m?.waybill_no)}"></label>
      </div>
      <div class="lines" data-lines>${lineHtml(m)}</div>
      <div class="lines-foot">
        <button type="button" class="btn btn-ghost btn-sm" data-add-line>+ ხაზის დამატება</button>
        <span><span>სულ</span> <b data-total></b></span>
      </div>
      <label data-contractor-field>კონტრაქტორი<select name="contractor_id">${options([['', '-'], ...state.contractors.map((c) => [c.id, pick(c, 'name')])], m?.contractor_id)}</select></label>`,
    onOpen: (form) => {
      const box = $('[data-lines]', form);
      const allowed = () => (form.direction.value === 'in' ? IN_CATEGORIES : OUT_CATEGORIES);
      // A new line out is materials unless chosen otherwise - most purchases are.
      const fill = (select, chosen) => {
        const list = allowed();
        const pickOne = list.includes(chosen) ? chosen : list.includes('materials') ? 'materials' : list[0];
        select.innerHTML = options(list.map((k) => [k, CATEGORIES[k]]), pickOne);
      };
      const sync = () => {
        // A contractor is asked for only when a line is a payment to one.
        const show = $$('[data-f=category]', form).some((s) => s.value === 'contractor');
        $('[data-contractor-field]', form).hidden = !show;
        form.contractor_id.required = show;
        $('[data-waybill-field]', form).hidden = form.direction.value === 'in';
        const total = $$('[data-f=amount]', form).reduce((sum, i) => sum + (numOrNull(i.value) || 0), 0);
        $('[data-total]', form).textContent = lari(total);
        // The last new line stays: there is always one to fill in.
        const lines = $$('[data-line]', form);
        lines.forEach((l) => { if (!l.dataset.id) $('[data-del-line]', l).hidden = lines.length === 1; });
      };
      const wire = (line, chosen) => {
        fill($('[data-f=category]', line), chosen);
        $('[data-f=category]', line).addEventListener('change', sync);
        $('[data-f=amount]', line).addEventListener('input', sync);
        $('[data-del-line]', line).addEventListener('click', () => { line.remove(); sync(); });
      };
      wire($('[data-line]', box), m?.category);
      $('[data-add-line]', form).addEventListener('click', () => {
        const above = $$('[data-f=category]', form).at(-1)?.value; // the same type as the line above
        box.insertAdjacentHTML('beforeend', lineHtml());
        const line = box.lastElementChild;
        wire(line, above);
        sync();
        $('[data-f=amount]', line).focus();
      });
      $$('[name=direction]', form).forEach((r) => r.addEventListener('change', () => {
        $$('[data-f=category]', form).forEach((s) => fill(s, s.value));
        sync();
      }));
      sync();
    },
    onSubmit: async (form, data) => {
      const dir = data.get('direction');
      const shared = { direction: dir, entry_date: data.get('entry_date') };
      // Sent only when there is one (or one to clear), so entries save even before the database has the column.
      const waybill = dir === 'out' ? text(data, 'waybill_no') : null;
      if (waybill || m?.waybill_no) shared.waybill_no = waybill;
      const lines = $$('[data-line]', form).map((l) => {
        const v = (f) => $(`[data-f=${f}]`, l).value.trim();
        return {
          id: l.dataset.id, category: v('category'), amount: numOrNull(v('amount')),
          description: v('description') || null, description_en: v('description_en') || null,
        };
      }).filter((l) => l.id || l.amount != null || l.description || l.description_en); // a line left empty is ignored
      if (!lines.length) throw new Error('დაამატეთ ერთი ხაზი მაინც.');
      if (lines.some((l) => !(l.amount > 0))) throw new Error('ჩაწერეთ თანხა ყველა ხაზზე.');
      const rowOf = ({ id, ...l }) => ({
        ...shared, ...l, contractor_id: l.category === 'contractor' ? data.get('contractor_id') || null : null,
      });
      const existing = lines.find((l) => l.id);
      const added = lines.filter((l) => !l.id).map((l) => ({ ...rowOf(l), project_id: state.project.id }));
      if (existing) await q(db.from('money').update(rowOf(existing)).eq('id', existing.id));
      if (added.length) await q(db.from('money').insert(added));
      await reloadMoney();
      toast(added.length > 1 ? `შენახულია ${added.length} ჩანაწერი` : 'შენახულია');
      renderMoney(el);
    },
    onDelete: m ? async () => {
      await q(db.from('money').delete().eq('id', m.id));
      await reloadMoney();
      renderMoney(el);
    } : null,
  });
}
