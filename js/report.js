// Project report: the whole project on one page - print it, or save it as a PDF from the print window.
import { $, esc, lari, fmtDate, monthName, todayISO, daysBetween, weekday } from './ui.js';
import { state, contractorName, taskStatus, STATUS, progressOf, moneyTotals, moneyByMonth, paidTo } from './state.js';
import { drawChart } from './money.js';

export async function renderReport(el) {
  const p = state.project;
  const today = todayISO();
  const prog = progressOf(state.tasks, today);
  const late = state.tasks.filter((t) => taskStatus(t, today) === 'late');
  const money = moneyTotals(state.money);
  const months = moneyByMonth(state.money);
  const week = state.logs.filter((l) => daysBetween(l.log_date, today) < 7);
  const avgWorkers = week.length ? Math.round(week.reduce((s, l) => s + (l.workers ?? 0), 0) / week.length) : null;
  const daysLeft = p.end_date ? daysBetween(today, p.end_date) : null;
  const contracts = state.projectContractors.map((pc) => ({
    name: contractorName(pc.contractor_id), scope: pc.scope, amount: Number(pc.contract_amount), paid: paidTo(pc.contractor_id),
  })).sort((a, b) => b.amount - a.amount);

  el.innerHTML = `
    <div class="page-head no-print">
      <span class="muted small">დაბეჭდეთ, ან ბეჭდვის ფანჯარაში აირჩიეთ "Save as PDF".</span>
      <button class="btn btn-primary" data-print>ბეჭდვა / PDF</button>
    </div>
    <div class="report">
      <div class="report-head">
        <div>
          <img class="report-logo" src="img/logo-mark.png" alt="CPMG">
          <h1 style="margin-top:0.6rem">${esc(p.name)}</h1>
          <p class="muted" style="margin:0.2rem 0 0">${[p.client && `დამკვეთი: ${esc(p.client)}`, p.address && esc(p.address)].filter(Boolean).map((part) => `<span>${part}</span>`).join(' · ')}</p>
        </div>
        <div style="text-align:right">
          <b>პროექტის ანგარიში</b><br><span class="muted small">${fmtDate(today)}</span>
        </div>
      </div>

      <section class="stats">
        <div class="stat"><b>${prog.actual}%</b><span>შესრულებულია (გეგმით ${prog.planned}%)</span></div>
        <div class="stat"><b>${p.end_date ? fmtDate(p.end_date) : '-'}</b><span>${daysLeft == null ? 'დასრულების თარიღი' : daysLeft >= 0 ? `დასრულებამდე ${daysLeft} დღე` : `ვადა გადაცილებულია ${-daysLeft} დღით`}</span></div>
        <div class="stat"><b class="${late.length ? 'bad' : ''}">${late.length}</b><span>ვადაგადაცილებული სამუშაო</span></div>
        <div class="stat"><b>${avgWorkers ?? '-'}</b><span>მუშები დღეში (ბოლო 7 დღე)</span></div>
      </section>

      <section>
        <h2>გრაფიკი</h2>
        ${state.tasks.length ? `
          <div class="table-wrap"><table>
            <thead><tr><th>სამუშაო</th><th>კონტრაქტორი</th><th>ვადები</th><th class="num">შესრულება</th><th>სტატუსი</th></tr></thead>
            <tbody>${state.tasks.map((t) => {
              const [label, chip] = STATUS[taskStatus(t, today)];
              return `<tr><td>${esc(t.name)}</td><td>${esc(contractorName(t.contractor_id)) || '-'}</td>
                <td class="small" style="white-space:nowrap">${fmtDate(t.start_date)} - ${fmtDate(t.end_date)}</td>
                <td class="num">${t.progress}%</td><td><span class="chip ${chip}">${label}</span></td></tr>`;
            }).join('')}</tbody>
          </table></div>` : '<p class="muted">გრაფიკი ცარიელია.</p>'}
      </section>

      <section>
        <h2>ფინანსები</h2>
        <div class="stats">
          <div class="stat"><b class="good">${lari(money.incoming)}</b><span>შემოსავალი</span></div>
          <div class="stat"><b class="bad">${lari(money.outgoing)}</b><span>გასავალი</span></div>
          <div class="stat"><b>${lari(money.balance)}</b><span>ბალანსი</span></div>
          ${p.contract_value ? `<div class="stat"><b>${lari(p.contract_value)}</b><span>ხელშეკრულების ღირებულება</span></div>` : ''}
        </div>
        ${months.length ? `
          <div class="card" style="margin-top:0.8rem"><div class="chart-box"><canvas></canvas></div></div>
          <div class="table-wrap" style="margin-top:0.8rem"><table>
            <thead><tr><th>თვე</th><th class="num">შემოსავალი</th><th class="num">გასავალი</th><th class="num">ნაშთი</th></tr></thead>
            <tbody>${months.map((m) => `<tr><td>${monthName(m.month)}</td><td class="num">${lari(m.incoming)}</td><td class="num">${lari(m.outgoing)}</td><td class="num"><b>${lari(m.balance)}</b></td></tr>`).join('')}</tbody>
          </table></div>` : ''}
      </section>

      ${contracts.length ? `
      <section>
        <h2>კონტრაქტორები</h2>
        <div class="table-wrap"><table>
          <thead><tr><th>კონტრაქტორი</th><th class="num">ხელშეკრულება</th><th class="num">გადახდილი</th><th class="num">დარჩენილი</th></tr></thead>
          <tbody>${contracts.map((c) => `<tr><td>${esc(c.name)}${c.scope ? `<br><span class="muted small">${esc(c.scope)}</span>` : ''}</td>
            <td class="num">${lari(c.amount)}</td><td class="num">${lari(c.paid)}</td><td class="num">${lari(c.amount - c.paid)}</td></tr>`).join('')}</tbody>
        </table></div>
      </section>` : ''}

      <section>
        <h2>ბოლო ჩანაწერები</h2>
        ${state.logs.length ? `
          <div class="table-wrap"><table>
            <thead><tr><th>თარიღი</th><th class="num">მუშები</th><th>შესრულებული სამუშაო</th></tr></thead>
            <tbody>${state.logs.slice(0, 7).map((l) => `<tr><td class="small" style="white-space:nowrap">${fmtDate(l.log_date)}<br><span class="muted">${weekday(l.log_date)}</span></td>
              <td class="num">${l.workers ?? '-'}</td><td style="white-space:pre-line">${esc(l.work_done) || '<span class="muted">-</span>'}</td></tr>`).join('')}</tbody>
          </table></div>` : '<p class="muted">ჩანაწერები ჯერ არ არის.</p>'}
      </section>
    </div>`;

  $('[data-print]', el).addEventListener('click', () => window.print());
  drawChart($('canvas', el), months, { animate: false });
}
