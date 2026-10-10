// Money: what came in, what went out, and the balance month by month.
import { db, q } from './db.js';
import { $, $$, esc, lari, fmtDate, monthName, todayISO, toast, openForm, options, numOrNull, MONTHS_SHORT, pick, text } from './ui.js';
import { tr } from './i18n.js';
import { readWaybills } from './waybill.js';
import { state, isAdmin, reloadMoney, contractorName, CATEGORIES, IN_CATEGORIES, OUT_CATEGORIES, moneyTotals, moneyByMonth } from './state.js';

let filter = 'all';
let search = ''; // what the entries are searched for, kept while the page is redrawn
let chart = null;

export async function renderMoney(el) {
  const t = moneyTotals(state.money);
  const months = moneyByMonth(state.money);
  const contractValue = Number(state.project.contract_value ?? 0);
  const fromClient = state.money.filter((m) => m.direction === 'in' && m.category === 'client').reduce((s, m) => s + Number(m.amount), 0);

  el.innerHTML = `
    <div class="page-head">
      <h2>ფინანსები</h2>
      ${isAdmin() ? `<span class="head-actions">
        <button class="btn btn-ghost" data-import>ზედნადებების იმპორტი (PDF)</button>
        <button class="btn btn-primary" data-add>+ ჩანაწერის დამატება</button></span>` : ''}
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
    <div class="search-box">
      <input type="search" data-search placeholder="ძებნა: ზედნადების ნომერი ან აღწერა" value="${esc(search)}">
    </div>
    <div data-entries></div>`;

  $('[data-add]', el)?.addEventListener('click', () => moneyForm(null, el));
  $('[data-import]', el)?.addEventListener('click', () => pickWaybills(el));
  $$('[data-filter]', el).forEach((b) => b.addEventListener('click', () => { filter = b.dataset.filter; renderMoney(el); }));
  let timer;
  $('[data-search]', el).addEventListener('input', (e) => {
    search = e.target.value;
    clearTimeout(timer);
    timer = setTimeout(() => drawEntries(el), 250);
  });
  drawEntries(el);
  drawChart($('canvas', el), months);
}

// Waybill numbers are written "ელ-1012225236", "ელ- 1012225236" or just the digits: compared without spaces and dashes.
const plain = (v) => String(v ?? '').toLowerCase().replace(/[\s-]/g, '');
let asked = 0; // the newest search sent to the database, so an older answer arriving late is dropped

/** The entries list, narrowed by the filter and the search; and where else a searched waybill was entered. */
function drawEntries(el) {
  const box = $('[data-entries]', el);
  const term = plain(search);
  const entries = state.money
    .filter((m) => filter === 'all' || m.direction === filter)
    .filter((m) => !term || plain(m.waybill_no).includes(term) || plain(m.description).includes(term) || plain(m.description_en).includes(term))
    .slice().reverse();
  box.innerHTML = `
    ${term ? `<p class="muted small search-note">${entries.length ? `ნაპოვნია: ${entries.length}` : 'ამ პროექტში ვერ მოიძებნა.'}</p>` : ''}
    <div data-elsewhere></div>
    ${entries.length ? `
      <div class="table-wrap">
        <table>
          <thead><tr><th>თარიღი</th><th>სახე</th><th class="hide-phone">აღწერა</th><th class="num">თანხა</th></tr></thead>
          <tbody>${entries.map((m, i) => `
            <tr class="${isAdmin() ? 'click' : ''}${m.waybill_no ? ' in-waybill' : ''}" ${isAdmin() ? `data-entry="${m.id}"` : ''}>
              <td class="small" style="white-space:nowrap">${fmtDate(m.entry_date)}</td>
              <td><span class="chip cat-${m.category}">${esc(CATEGORIES[m.category])}</span>
                ${m.contractor_id ? `<br><span class="small">${esc(contractorName(m.contractor_id))}</span>` : ''}
                ${pick(m, 'description') ? `<span class="muted small show-phone">${esc(pick(m, 'description'))}</span>` : ''}</td>
              <td class="hide-phone small">${esc(pick(m, 'description')) || '<span class="muted">-</span>'}</td>
              <td class="num ${m.direction === 'in' ? 'good' : 'bad'}">${m.direction === 'in' ? '+' : '−'}${lari(m.amount)}</td>
            </tr>${waybillSum(entries, i)}`).join('')}</tbody>
        </table>
      </div>` : (term ? '' : '<div class="empty">ჩანაწერები ჯერ არ არის.</div>')}`;
  $$('[data-entry]', box).forEach((tr) => tr.addEventListener('click', () => moneyForm(state.money.find((m) => m.id === tr.dataset.entry), el)));
  elsewhere($('[data-elsewhere]', box), term);
}

/** A waybill number searched for: the other projects it was entered on, if any. */
async function elsewhere(box, term) {
  const digits = term.replace(/\D/g, '');
  const ask = ++asked;
  if (digits.length < 4) return;
  try {
    const found = await q(db.from('money').select('waybill_no, project_id, entry_date, amount')
      .ilike('waybill_no', `%${digits}%`).neq('project_id', state.project.id).limit(50));
    if (ask !== asked || !found.length) return;
    const projects = await q(db.from('projects').select('id, name, name_en').in('id', [...new Set(found.map((f) => f.project_id))]));
    if (ask !== asked) return;
    const byProject = projects.map((p) => {
      const rows = found.filter((f) => f.project_id === p.id);
      const numbers = [...new Set(rows.map((f) => f.waybill_no))];
      return `<li><a href="#/p/${p.id}/money">${esc(pick(p, 'name'))}</a> - ${numbers.map(esc).join(', ')} · ${lari(rows.reduce((s, f) => s + Number(f.amount), 0))}</li>`;
    });
    box.innerHTML = `<div class="card search-else"><b>სხვა პროექტებში:</b><ul>${byProject.join('')}</ul></div>`;
  } catch { /* the search here still stands */ }
}

/**
 * After the last of a waybill's entries (they sit together in the list): the
 * waybill's number and total, closing the group. The entries themselves do not repeat the number.
 */
function waybillSum(entries, i) {
  const no = entries[i].waybill_no;
  if (!no || entries[i + 1]?.waybill_no === no) return '';
  let first = i;
  while (entries[first - 1]?.waybill_no === no) first -= 1;
  const sum = entries.slice(first, i + 1).reduce((s, m) => s + Number(m.amount), 0);
  return `
    <tr class="sum-row"><td colspan="2"><span>ზედნადები ${esc(no)}, სულ</span> <span class="muted small">(${i - first + 1})</span></td>
      <td class="hide-phone"></td><td class="num bad"><b>−${lari(sum)}</b></td></tr>`;
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
      ${m ? '' : '<button type="button" class="btn btn-ghost btn-sm" data-from-pdf>ზედნადების PDF-იდან შევსება</button>'}
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
        // Each line edged in its type's colour, as its label is in the list.
        $$('[data-line]', form).forEach((l) => { l.dataset.cat = $('[data-f=category]', l).value; });
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
      $('[data-from-pdf]', form)?.addEventListener('click', () => pickWaybills(el));
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

// ---------- Waybills from RS.ge: a PDF read, checked here, saved as money out ----------
/** Asks for a waybill PDF, then shows what it holds for checking. */
function pickWaybills(el) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/pdf,.pdf';
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    toast(tr('PDF იკითხება…'));
    try {
      const bills = await readWaybills(file);
      if (!bills.length) throw new Error('ამ PDF-ში ზედნადები ვერ მოიძებნა.');
      // Already entered, on this project or another: those come unticked.
      const entered = await q(db.from('money').select('waybill_no, project_id').in('waybill_no', bills.map((b) => b.number)));
      waybillForm(bills, entered, el);
    } catch (e) { toast(e.message, true); }
  });
  input.click();
}

/** Every waybill in the PDF with its items, each item a line of money out - materials unless changed. */
function waybillForm(bills, entered, el) {
  const fmtQty = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 3 });
  const describe = (it) => `${it.name} - ${fmtQty(it.qty)} ${it.unit} × ${lari(it.price)}`.slice(0, 300);
  openForm({
    title: 'ზედნადებების იმპორტი',
    submit: 'შენახვა',
    body: `
      <p class="muted small" style="margin:0">თითოეული საქონელი ცალკე ჩანაწერად შეინახება. სახე შეცვალეთ, სადაც მასალა არ არის.</p>
      ${bills.map((b, i) => {
        const here = entered.some((x) => x.waybill_no === b.number && x.project_id === state.project.id);
        const elsewhere = !here && entered.some((x) => x.waybill_no === b.number);
        const sum = b.items.reduce((s, it) => s + it.total, 0);
        return `
          <div class="wb" data-bill="${i}">
            <label class="check wb-head"><input type="checkbox" data-take ${here || elsewhere ? '' : 'checked'}>
              <span><b>${esc(b.number)}</b> · ${fmtDate(b.date)} · ${lari(b.total)}<br>
              <span class="muted small">${esc(b.seller)}${b.to ? ` → ${esc(b.to)}` : ''}</span></span></label>
            ${here ? '<span class="chip chip-late">უკვე შეტანილია ამ პროექტში</span>' : ''}
            ${elsewhere ? '<span class="chip chip-late">უკვე შეტანილია სხვა პროექტში</span>' : ''}
            ${Math.abs(sum - b.total) > 0.01 ? `<span class="chip chip-late">საქონლის ჯამი ${lari(sum)} - შეამოწმეთ</span>` : ''}
            <div class="lines">${b.items.map((it) => `
              <div class="line" data-line>
                <div class="line-top">
                  <select data-f="category" aria-label="სახე">${options(OUT_CATEGORIES.filter((k) => k !== 'contractor').map((k) => [k, CATEGORIES[k]]), 'materials')}</select>
                  <input data-f="amount" inputmode="decimal" aria-label="თანხა (₾)" value="${it.total}">
                  <span></span>
                </div>
                <input data-f="description" maxlength="300" value="${esc(describe(it))}">
              </div>`).join('')}
            </div>
            <div class="wb-sum"><span>ზედნადების ჯამი</span> <b data-bill-total></b></div>
          </div>`;
      }).join('')}
      <div class="lines-foot"><span class="muted small" data-count></span><span><span>სულ</span> <b data-total></b></span></div>`,
    onOpen: (form) => {
      const sync = () => {
        // Each line edged in its type's colour, as its label is in the list.
        $$('[data-line]', form).forEach((l) => { l.dataset.cat = $('[data-f=category]', l).value; });
        let total = 0, count = 0;
        $$('[data-bill]', form).forEach((b) => {
          const take = $('[data-take]', b).checked;
          b.classList.toggle('wb-off', !take);
          const sum = $$('[data-f=amount]', b).reduce((s, i) => s + (numOrNull(i.value) || 0), 0);
          $('[data-bill-total]', b).textContent = lari(sum);
          if (!take) return;
          total += sum;
          count += $$('[data-line]', b).length;
        });
        $('[data-total]', form).textContent = lari(total);
        $('[data-count]', form).textContent = tr(`${count} ჩანაწერი`);
      };
      form.addEventListener('input', sync);
      form.addEventListener('change', sync);
      sync();
    },
    onSubmit: async (form) => {
      const rows = $$('[data-bill]', form).filter((b) => $('[data-take]', b).checked).flatMap((b) => {
        const bill = bills[Number(b.dataset.bill)];
        return $$('[data-line]', b).map((l) => ({
          project_id: state.project.id,
          direction: 'out',
          entry_date: bill.date ?? todayISO(),
          waybill_no: bill.number,
          category: $('[data-f=category]', l).value,
          amount: numOrNull($('[data-f=amount]', l).value),
          description: $('[data-f=description]', l).value.trim() || null,
        }));
      });
      if (!rows.length) throw new Error('მონიშნეთ ერთი ზედნადები მაინც.');
      if (rows.some((r) => !(r.amount > 0))) throw new Error('ჩაწერეთ თანხა ყველა ხაზზე.');
      await q(db.from('money').insert(rows));
      await reloadMoney();
      toast(`შენახულია ${rows.length} ჩანაწერი`);
      renderMoney(el);
    },
  });
}
