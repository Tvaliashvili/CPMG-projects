// Contractors on the project: what was agreed with each, what they have been paid, what is left.
import { db, q } from './db.js';
import { $, $$, esc, lari, toast, openForm, options, numOrNull, pick, pair, texts } from './ui.js';
import { state, isAdmin, reloadContractors, paidTo } from './state.js';

/** Everyone working on the project: with a contract, a timetable item or a payment. */
function onProject() {
  const ids = new Set([
    ...state.projectContractors.map((c) => c.contractor_id),
    ...state.tasks.map((t) => t.contractor_id),
    ...state.money.map((m) => m.contractor_id),
  ].filter(Boolean));
  return state.contractors.filter((c) => ids.has(c.id)).map((c) => {
    const contract = state.projectContractors.find((pc) => pc.contractor_id === c.id);
    const amount = Number(contract?.contract_amount ?? 0);
    const paid = paidTo(c.id);
    return { ...c, contract, amount, paid, left: amount - paid };
  });
}

export async function renderContractors(el) {
  const list = onProject();
  const total = list.reduce((s, c) => ({ amount: s.amount + c.amount, paid: s.paid + c.paid }), { amount: 0, paid: 0 });

  el.innerHTML = `
    <div class="page-head">
      <h2>კონტრაქტორები</h2>
      ${isAdmin() ? '<button class="btn btn-primary" data-add>+ კონტრაქტორის დამატება</button>' : ''}
    </div>
    ${list.length ? `
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>კონტრაქტორი</th><th class="hide-phone">კონტაქტი</th>
            <th class="num">ხელშეკრულება</th><th class="num">გადახდილი</th><th class="num">დარჩენილი</th>
          </tr></thead>
          <tbody>${list.map((c) => `
            <tr ${isAdmin() ? `class="click" data-contractor="${c.id}"` : ''}>
              <td><b>${esc(pick(c, 'name'))}</b>${pick(c, 'trade') ? `<br><span class="muted small">${esc(pick(c, 'trade'))}</span>` : ''}
                ${pick(c.contract, 'scope') ? `<br><span class="small">${esc(pick(c.contract, 'scope'))}</span>` : ''}</td>
              <td class="hide-phone small">${[esc(pick(c, 'contact_person')), c.phone ? `<a href="tel:${esc(c.phone)}" data-stop>${esc(c.phone)}</a>` : ''].filter(Boolean).join('<br>') || '<span class="muted">-</span>'}</td>
              <td class="num">${c.contract ? lari(c.amount) : '<span class="muted">-</span>'}</td>
              <td class="num">${lari(c.paid)}${c.amount ? `<br><span class="muted small">${Math.round((c.paid / c.amount) * 100)}%</span>` : ''}</td>
              <td class="num ${c.contract && c.left < 0 ? 'bad' : ''}">${c.contract ? lari(c.left) : '<span class="muted">-</span>'}</td>
            </tr>`).join('')}</tbody>
          <tfoot><tr>
            <td>სულ</td><td class="hide-phone"></td>
            <td class="num">${lari(total.amount)}</td><td class="num">${lari(total.paid)}</td><td class="num">${lari(total.amount - total.paid)}</td>
          </tr></tfoot>
        </table>
      </div>
      <p class="muted small">გადახდები ემატება "ფინანსები" გვერდზე, როგორც გასავალი კონტრაქტორზე.</p>`
    : '<div class="empty">ამ პროექტზე კონტრაქტორები ჯერ არ არის.</div>'}`;

  $('[data-add]', el)?.addEventListener('click', () => contractorForm(null, el));
  $$('[data-stop]', el).forEach((a) => a.addEventListener('click', (e) => e.stopPropagation()));
  $$('[data-contractor]', el).forEach((tr) => tr.addEventListener('click', () => contractorForm(list.find((c) => c.id === tr.dataset.contractor), el)));
}

function contractorForm(c, el) {
  const others = state.contractors.filter((x) => !state.projectContractors.some((pc) => pc.contractor_id === x.id));
  const details = (x) => `
    ${pair('დასახელება', 'name', x, { required: !!x, maxlength: 160 })}
    ${pair('სამუშაოს სახე', 'trade', x, { maxlength: 120, placeholder: 'მაგ. ელექტროობა' })}
    ${pair('საკონტაქტო პირი', 'contact_person', x, { maxlength: 120 })}
    <label>ტელეფონი<input name="phone" type="tel" maxlength="40" value="${esc(x?.phone)}"></label>`;

  openForm({
    title: c ? pick(c, 'name') : 'კონტრაქტორის დამატება',
    body: `
      ${c ? details(c) : `
        <label>კონტრაქტორი
          <select name="pick">${options([['new', '+ ახალი კონტრაქტორი'], ...others.map((x) => [x.id, pick(x, 'name')])], c?.id ?? 'new')}</select>
        </label>
        <div data-new>${details(null)}</div>`}
      ${pair('სამუშაოს აღწერა ამ პროექტზე', 'scope', c?.contract, { maxlength: 300 })}
      <label>ხელშეკრულების თანხა (₾)<input name="contract_amount" inputmode="decimal" value="${esc(c?.contract?.contract_amount)}"></label>`,
    onOpen: (form) => {
      const pick = form.pick;
      if (!pick) return;
      const sync = () => {
        const isNew = pick.value === 'new';
        $('[data-new]', form).hidden = !isNew;
        form.name.required = isNew;
      };
      pick.addEventListener('change', sync);
      sync();
    },
    onSubmit: async (form, data) => {
      const amount = numOrNull(data.get('contract_amount')) ?? 0;
      if (!(amount >= 0)) throw new Error('თანხა რიცხვით ჩაწერეთ.');
      const detailsRow = () => ({
        ...texts(data, 'name'),
        ...texts(data, 'trade'),
        ...texts(data, 'contact_person'),
        phone: data.get('phone').trim() || null,
      });
      let id = c?.id;
      if (c) {
        await q(db.from('contractors').update(detailsRow()).eq('id', c.id));
      } else if (data.get('pick') === 'new') {
        id = (await q(db.from('contractors').insert(detailsRow()).select('id').single())).id;
      } else {
        id = data.get('pick');
      }
      await q(db.from('project_contractors').upsert({
        project_id: state.project.id, contractor_id: id,
        ...texts(data, 'scope'), contract_amount: amount,
      }));
      await reloadContractors();
      toast('შენახულია');
      renderContractors(el);
    },
    onDelete: c?.contract ? async () => {
      // Off this project only: the company keeps the contractor for its other projects.
      await q(db.from('project_contractors').delete().eq('project_id', state.project.id).eq('contractor_id', c.id));
      await reloadContractors();
      renderContractors(el);
    } : null,
    deleteText: 'პროექტიდან მოხსნა',
  });
}
