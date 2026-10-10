// Project report: the whole project on one page - print it, or save it as a PDF from the print window.
import { $, esc, lari, fmtDate, monthName, todayISO, daysBetween, addDays, weekday, pick } from './ui.js';
import { state, contractorName, taskStatus, STATUS, progressOf, moneyTotals, moneyByMonth, paidTo, CATEGORIES } from './state.js';
import { drawChart } from './money.js';
import { timeRange, scale, ganttTrack } from './timetable.js';

const pctOf = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
const clamp = (v) => Math.min(100, Math.max(0, v));
/** 2026-10-09 -> 09.10 */
export const dm = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

/** A figure with what it is under it, and a smaller line below when there is more to say. */
export const tile = (label, value, { sub = '', tone = '' } = {}) => `
  <div class="stat${tone ? ` stat-${tone}` : ''}"><b>${value}</b><span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;

/** The report's top: logo, project, client and address; on the right what the report is and when. */
export function reportHead(p, title, right) {
  return `
    <div class="report-head">
      <div>
        <img class="report-logo" src="img/logo-mark.png" alt="CPMG">
        <p class="eyebrow">${title}</p>
        <h1>${esc(pick(p, 'name'))}</h1>
        <p class="muted" style="margin:0.2rem 0 0">${[pick(p, 'client') && `დამკვეთი: ${esc(pick(p, 'client'))}`, pick(p, 'address') && esc(pick(p, 'address'))].filter(Boolean).map((part) => `<span>${part}</span>`).join(' · ')}</p>
      </div>
      <div class="report-head-right">${right}</div>
    </div>`;
}

/** Where the project stands against its plan, in words (never colour alone). */
function verdictOf(prog, late) {
  if (!prog.count) return ['გრაფიკი არ არის', ''];
  if (prog.actual - prog.planned < -5 || late.length) return ['გეგმას ჩამორჩება', 'bad'];
  if (prog.actual - prog.planned > 5) return ['გეგმას უსწრებს', 'good'];
  return ['გეგმის მიხედვით', 'good'];
}

/** Progress ring: the outer ring is the work done, the inner one where the plan says it should be. */
function ring(actual, planned) {
  const arc = (r, pct) => {
    const c = 2 * Math.PI * r;
    return `stroke-dasharray="${((clamp(pct) / 100) * c).toFixed(1)} ${c.toFixed(1)}"`;
  };
  return `
    <svg class="ring" viewBox="0 0 120 120" width="116" height="116" aria-hidden="true">
      <circle cx="60" cy="60" r="50" fill="none" stroke="#e2e8f0" stroke-width="12"/>
      <circle cx="60" cy="60" r="50" fill="none" stroke="#15803d" stroke-width="12" stroke-linecap="round" ${arc(50, actual)} transform="rotate(-90 60 60)"/>
      <circle cx="60" cy="60" r="35" fill="none" stroke="#f1f5f9" stroke-width="6"/>
      <circle cx="60" cy="60" r="35" fill="none" stroke="#64748b" stroke-width="6" stroke-linecap="round" ${arc(35, planned)} transform="rotate(-90 60 60)"/>
      <text x="60" y="67" text-anchor="middle" font-size="22" font-weight="700" fill="#1e293b">${actual}%</text>
    </svg>`;
}

/**
 * What starts or falls due from `from` for `days` days, soonest first:
 * [{ t, date, starts }]. Finished work is left out.
 */
export function lookAhead(tasks, from, days) {
  const to = addDays(from, days);
  return tasks
    .filter((t) => t.progress < 100)
    .flatMap((t) => [
      ...(t.start_date > from && t.start_date <= to ? [{ t, date: t.start_date, starts: true }] : []),
      ...(t.end_date >= from && t.end_date <= to ? [{ t, date: t.end_date, starts: false }] : []),
    ])
    .sort((a, b) => a.date.localeCompare(b.date));
}

export const aheadList = (items) => `
  <ul class="ahead">${items.map(({ t, date, starts }) => `
    <li>
      <span class="ahead-date">${dm(date)}</span>
      <span><b>${esc(pick(t, 'name'))}</b>
        <span class="muted small"><span>${starts ? 'იწყება' : 'უნდა დასრულდეს'}</span>${starts ? '' : ` · ${t.progress}%`}${t.contractor_id ? ` · ${esc(contractorName(t.contractor_id))}` : ''}</span></span>
    </li>`).join('')}
  </ul>`;

/** Workers day by day, as columns: the logged days filled, the rest left empty. `mark` is a day to pick out. */
export function workerBars(logs, from, days, mark = null) {
  const byDate = new Map(logs.map((l) => [l.log_date, l.workers]));
  const list = Array.from({ length: days }, (_, i) => addDays(from, i));
  const max = Math.max(1, ...list.map((d) => byDate.get(d) ?? 0));
  return `
    <div class="wbars">${list.map((d) => {
      const n = byDate.get(d);
      return `<div class="wbar${d === mark ? ' mark' : ''}${n == null ? ' none' : ''}" title="${dm(d)}: ${n ?? '-'}">
        <span style="height:${n ? Math.max(4, (n / max) * 100) : 0}%">${n && (days <= 14 || d === mark) ? `<i>${n}</i>` : ''}</span></div>`;
    }).join('')}</div>
    <div class="wbars-axis"><span>${dm(list[0])}</span><span>${dm(list.at(-1))}</span></div>`;
}

/** Contracts on the project, each with what was paid and how far its contractor's work is. */
function contractRows(today) {
  return state.projectContractors.map((pc) => {
    const own = state.tasks.filter((t) => t.contractor_id === pc.contractor_id);
    return {
      id: pc.contractor_id,
      name: contractorName(pc.contractor_id),
      scope: pick(pc, 'scope'),
      amount: Number(pc.contract_amount),
      paid: paidTo(pc.contractor_id),
      items: own.length,
      late: own.filter((t) => taskStatus(t, today) === 'late').length,
      done: own.length ? progressOf(own, today).actual : null,
    };
  }).sort((a, b) => b.amount - a.amount);
}

export async function renderReport(el) {
  const p = state.project;
  const today = todayISO();
  const tasks = state.tasks;
  const prog = progressOf(tasks, today);
  const gap = prog.actual - prog.planned;
  const late = tasks.filter((t) => taskStatus(t, today) === 'late')
    .map((t) => ({ t, days: daysBetween(t.end_date, today) }))
    .sort((a, b) => b.days - a.days);
  const counts = { done: 0, now: 0, late: 0, later: 0 };
  tasks.forEach((t) => { counts[taskStatus(t, today)] += 1; });
  const money = moneyTotals(state.money);
  const months = moneyByMonth(state.money);
  const fromClient = state.money.filter((m) => m.direction === 'in' && m.category === 'client').reduce((s, m) => s + Number(m.amount), 0);
  const contracts = contractRows(today);
  const [verdict, tone] = verdictOf(prog, late);

  // The last 30 days on site, from the daily log.
  const since = addDays(today, -29);
  const month = state.logs.filter((l) => l.log_date >= since && l.log_date <= today);
  const manDays = month.reduce((s, l) => s + (l.workers ?? 0), 0);
  const withWorkers = month.filter((l) => l.workers != null);
  const avg = withWorkers.length ? Math.round(manDays / withWorkers.length) : null;
  const peak = withWorkers.reduce((best, l) => (!best || l.workers > best.workers ? l : best), null);
  const week = state.logs.filter((l) => daysBetween(l.log_date, today) < 7 && l.workers != null);
  const avgWeek = week.length ? Math.round(week.reduce((s, l) => s + l.workers, 0) / week.length) : null;
  const weather = new Map();
  month.forEach((l) => { if (l.weather) weather.set(l.weather, (weather.get(l.weather) ?? 0) + 1); });
  const photos = month.reduce((s, l) => s + l.log_photos.length, 0);

  // ---------- Time strip: how much of the time has gone, against how much of the work is done ----------
  let strip = '';
  if (p.start_date && p.end_date) {
    const total = Math.max(1, daysBetween(p.start_date, p.end_date));
    const timePct = clamp(pctOf(daysBetween(p.start_date, today), total));
    const left = daysBetween(today, p.end_date);
    strip = `
      <div class="strip">
        <div class="strip-ends">
          <span>დაწყება <b>${fmtDate(p.start_date)}</b></span>
          <span>${left >= 0 ? `დარჩა <b>${left}</b> დღე` : `<b class="bad">${-left}</b> <span class="bad">დღით გადაცილებულია</span>`}</span>
          <span>დასრულება <b>${fmtDate(p.end_date)}</b></span>
        </div>
        <div class="strip-track">
          <div class="strip-time" style="width:${timePct}%"></div>
          <div class="strip-work" style="width:${clamp(prog.actual)}%"></div>
          <div class="strip-today" style="left:${timePct}%"></div>
        </div>
        <div class="strip-legend small">
          <span><i class="sw sw-time"></i>გასული დრო <b>${timePct}%</b></span>
          <span><i class="sw sw-work"></i>შესრულებული სამუშაო <b>${prog.actual}%</b></span>
        </div>
      </div>`;
  }

  // ---------- What needs attention ----------
  const alerts = [];
  if (prog.count && gap < -5) alerts.push(['bad', `<span>გეგმას ჩამორჩება ${-gap}%-ით</span>`]);
  late.slice(0, 5).forEach(({ t, days }) => alerts.push(['bad',
    `<b>${esc(pick(t, 'name'))}</b> <span>ვადაგადაცილებულია ${days} დღით</span>${t.contractor_id ? ` <span class="muted">· ${esc(contractorName(t.contractor_id))}</span>` : ''}`]));
  if (late.length > 5) alerts.push(['bad', `<span>და კიდევ ${late.length - 5} ვადაგადაცილებული სამუშაო</span>`]);
  if (p.end_date && today > p.end_date && prog.count && prog.actual < 100) {
    alerts.push(['bad', '<span>დასრულების თარიღი გავიდა, სამუშაო ჯერ არ დასრულებულა</span>']);
  }
  // In progress, but further behind its own dates than a fifth of its length.
  const slipping = tasks.filter((t) => taskStatus(t, today) === 'now' && (() => {
    const days = daysBetween(t.start_date, t.end_date) + 1;
    return pctOf(daysBetween(t.start_date, today) + 1, days) - t.progress > 20;
  })());
  if (slipping.length) alerts.push(['warn', `<span>${slipping.length} მიმდინარე სამუშაო ჩამორჩება საკუთარ ვადებს</span>`]);
  const lastLog = state.logs[0]?.log_date;
  if (!lastLog) alerts.push(['warn', '<span>ჟურნალში ჩანაწერები ჯერ არ არის</span>']);
  else if (daysBetween(lastLog, today) > 3) alerts.push(['warn', `<span>ბოლო ჩანაწერი ${daysBetween(lastLog, today)} დღის წინ</span>`]);
  if (money.balance < 0) alerts.push(['warn', `<span>ბალანსი უარყოფითია: ${lari(money.balance)}</span>`]);
  for (const c of contracts) {
    if (c.amount && c.paid > c.amount + 0.5) {
      alerts.push(['bad', `<b>${esc(c.name)}</b> <span>გადახდილია ხელშეკრულებაზე მეტი</span>`]);
    } else if (c.amount && c.done != null && pctOf(c.paid, c.amount) > c.done + 10) {
      alerts.push(['warn', `<b>${esc(c.name)}</b> <span>გადახდილია ${pctOf(c.paid, c.amount)}%, შესრულებულია ${c.done}%</span>`]);
    }
  }
  const ahead = lookAhead(tasks, today, 14).slice(0, 8);

  // ---------- Spending by type ----------
  const byCategory = new Map();
  state.money.filter((m) => m.direction === 'out').forEach((m) => byCategory.set(m.category, (byCategory.get(m.category) ?? 0) + Number(m.amount)));
  const categories = [...byCategory].sort((a, b) => b[1] - a[1]);
  const topCategory = categories[0]?.[1] ?? 1;

  const range = timeRange(tasks, today);

  el.innerHTML = `
    <div class="page-head no-print">
      <span class="muted small">დაბეჭდეთ, ან ბეჭდვის ფანჯარაში აირჩიეთ "Save as PDF".</span>
      <button class="btn btn-primary" data-print>ბეჭდვა / PDF</button>
    </div>
    <div class="report">
      ${reportHead(p, 'პროექტის ანგარიში', `
        <span class="muted small">თარიღი</span><br>
        <b>${fmtDate(today)}</b><br><span class="muted small">${weekday(today)}</span><br>
        <span class="verdict${tone ? ` verdict-${tone}` : ''}">${verdict}</span>`)}

      ${strip}

      <section class="glance">
        <div class="ring-box">
          ${ring(prog.actual, prog.planned)}
          <div class="ring-legend">
            <p><i class="sw sw-work"></i><span>შესრულებულია</span> <b>${prog.actual}%</b></p>
            <p><i class="sw sw-plan"></i><span>გეგმით დღეისთვის</span> <b>${prog.planned}%</b></p>
            ${prog.count ? `<p class="small ${gap < -5 ? 'bad' : gap > 0 ? 'good' : 'muted'}">${gap > 0 ? '+' : ''}${gap}% <span>გეგმასთან შედარებით</span></p>` : '<p class="muted small">გრაფიკი ჯერ არ არის.</p>'}
          </div>
        </div>
        <div class="stats stats-2">
          ${tile('დასრულებული სამუშაო', `${counts.done} / ${tasks.length}`)}
          ${tile('ვადაგადაცილებული სამუშაო', late.length, { tone: late.length ? 'bad' : '' })}
          ${tile('მუშები დღეში (ბოლო 7 დღე)', avgWeek ?? '-')}
          ${p.contract_value
            ? tile('მიღებულია დამკვეთისგან', lari(fromClient), { sub: `<b>${pctOf(fromClient, p.contract_value)}%</b> <span>ხელშეკრულებიდან</span>` })
            : tile('ბალანსი', lari(money.balance), { tone: money.balance < 0 ? 'bad' : '' })}
        </div>
      </section>

      <section class="two">
        <div class="card">
          <h3>საჭიროებს ყურადღებას</h3>
          ${alerts.length
            ? `<ul class="alerts">${alerts.map(([t, html]) => `<li class="alert-${t}"><i>${t === 'bad' ? '!' : '•'}</i><span>${html}</span></li>`).join('')}</ul>`
            : '<p class="good" style="margin:0">✓ <span>ყველაფერი გეგმის მიხედვით მიდის</span></p>'}
        </div>
        <div class="card">
          <h3>მომდევნო 14 დღე</h3>
          ${ahead.length ? aheadList(ahead) : '<p class="muted" style="margin:0">ორ კვირაში არაფერი იწყება და არაფერი სრულდება</p>'}
        </div>
      </section>

      <section>
        <h2>გრაფიკი</h2>
        ${tasks.length ? `
          <p class="status-row">${['done', 'now', 'late', 'later'].map((s) => `<span class="chip ${STATUS[s][1]}">${STATUS[s][0]} <b>${counts[s]}</b></span>`).join('')}</p>
          <div class="table-wrap"><table>
            <thead><tr><th>სამუშაო</th><th>კონტრაქტორი</th><th>ვადები</th><th class="num">შესრულება</th><th class="gantt-cell">${scale(range)}</th></tr></thead>
            <tbody>${tasks.map((t) => {
              const [label, chip] = STATUS[taskStatus(t, today)];
              return `<tr><td>${esc(pick(t, 'name'))}</td><td>${esc(contractorName(t.contractor_id)) || '-'}</td>
                <td class="small" style="white-space:nowrap">${fmtDate(t.start_date)} - ${fmtDate(t.end_date)}</td>
                <td class="num"><b>${t.progress}%</b><br><span class="chip ${chip}">${label}</span></td>
                <td class="gantt-cell">${ganttTrack(t, today, range)}</td></tr>`;
            }).join('')}</tbody>
          </table></div>` : '<p class="muted">გრაფიკი ცარიელია.</p>'}
      </section>

      <section>
        <h2>ფინანსები</h2>
        <div class="stats">
          ${tile('შემოსავალი', lari(money.incoming), { tone: 'good' })}
          ${tile('გასავალი', lari(money.outgoing), { tone: 'bad' })}
          ${tile('ბალანსი', lari(money.balance), { tone: money.balance < 0 ? 'bad' : '' })}
          ${p.contract_value ? tile('ხელშეკრულების ღირებულება', lari(p.contract_value), { sub: `<span>დარჩენილი მისაღები</span> ${lari(Math.max(0, p.contract_value - fromClient))}` }) : ''}
        </div>
        ${p.contract_value ? `
          <div class="card meter-card">
            <div class="meter-label"><span>მიღებულია დამკვეთისგან</span><b>${pctOf(fromClient, p.contract_value)}%</b></div>
            <div class="bar bar-lg"><span style="width:${clamp(pctOf(fromClient, p.contract_value))}%"></span></div>
            <div class="meter-label small muted"><span>შესრულებულია</span><b>${prog.actual}%</b></div>
            <div class="bar bar-lg bar-work"><span style="width:${clamp(prog.actual)}%"></span></div>
          </div>` : ''}
        ${categories.length ? `
          <div class="card" style="margin-top:0.8rem">
            <h3>ხარჯები სახეების მიხედვით</h3>
            <div class="hbars">${categories.map(([cat, sum]) => `
              <div class="hbar"><span>${CATEGORIES[cat] ?? cat}</span>
                <div class="bar"><span style="width:${(sum / topCategory) * 100}%"></span></div>
                <b>${lari(sum)}</b><em class="muted">${pctOf(sum, money.outgoing)}%</em></div>`).join('')}
            </div>
          </div>` : ''}
        ${months.length ? `
          <div class="card" style="margin-top:0.8rem"><div class="chart-box"><canvas></canvas></div></div>
          <div class="table-wrap" style="margin-top:0.8rem"><table>
            <thead><tr><th>თვე</th><th class="num">შემოსავალი</th><th class="num">გასავალი</th><th class="num">ნაშთი</th></tr></thead>
            <tbody>${months.map((m) => `<tr><td>${monthName(m.month)}</td><td class="num">${lari(m.incoming)}</td><td class="num">${lari(m.outgoing)}</td><td class="num"><b class="${m.balance < 0 ? 'bad' : ''}">${lari(m.balance)}</b></td></tr>`).join('')}</tbody>
          </table></div>` : ''}
      </section>

      ${contracts.length ? `
      <section>
        <h2>კონტრაქტორები</h2>
        <div class="table-wrap"><table>
          <thead><tr><th>კონტრაქტორი</th><th class="num">ხელშეკრულება</th><th class="num">გადახდილი</th><th class="num">დარჩენილი</th><th>გადახდა / შესრულება</th></tr></thead>
          <tbody>${contracts.map((c) => `<tr><td><b>${esc(c.name)}</b>${c.scope ? `<br><span class="muted small">${esc(c.scope)}</span>` : ''}
              ${c.items ? `<br><span class="small"><span>სამუშაოები:</span> ${c.items}${c.late ? ` · <span class="bad">ვადაგადაცილებული: ${c.late}</span>` : ''}</span>` : ''}</td>
            <td class="num">${lari(c.amount)}</td><td class="num">${lari(c.paid)}</td>
            <td class="num ${c.amount - c.paid < 0 ? 'bad' : ''}">${lari(c.amount - c.paid)}</td>
            <td class="pair-bars">
              <div class="bar"><span style="width:${clamp(pctOf(c.paid, c.amount))}%"></span></div><span class="small">${pctOf(c.paid, c.amount)}%</span>
              ${c.done != null ? `<div class="bar bar-work"><span style="width:${c.done}%"></span></div><span class="small">${c.done}%</span>` : ''}
            </td></tr>`).join('')}</tbody>
        </table></div>
        <p class="legend small muted"><span><i class="sw sw-paid"></i>გადახდილი</span><span><i class="sw sw-work"></i>შესრულებული სამუშაო</span></p>
      </section>` : ''}

      <section>
        <h2>ობიექტზე, ბოლო 30 დღე</h2>
        ${month.length ? `
          <div class="stats">
            ${tile('დღე ჩანაწერით', `${month.length} / 30`)}
            ${tile('კაც-დღე', manDays)}
            ${tile('საშუალოდ დღეში', avg ?? '-')}
            ${tile('მაქსიმუმი', peak ? peak.workers : '-', { sub: peak ? fmtDate(peak.log_date) : '' })}
            ${tile('ფოტოები', photos)}
          </div>
          <div class="card" style="margin-top:0.8rem">
            <h3>მუშები დღეების მიხედვით</h3>
            ${workerBars(state.logs, since, 30)}
            ${weather.size ? `<p class="status-row" style="margin:0.8rem 0 0">${[...weather].sort((a, b) => b[1] - a[1]).map(([w, n]) => `<span class="chip">${esc(w)} <b>${n}</b></span>`).join('')}</p>` : ''}
          </div>` : '<p class="muted">ამ პერიოდში ჩანაწერები არ არის.</p>'}
      </section>

      <section>
        <h2>ბოლო ჩანაწერები</h2>
        ${state.logs.length ? `
          <div class="table-wrap"><table>
            <thead><tr><th>თარიღი</th><th>ამინდი</th><th class="num">მუშები</th><th>შესრულებული სამუშაო</th><th class="num">ფოტოები</th></tr></thead>
            <tbody>${state.logs.slice(0, 7).map((l) => `<tr><td class="small" style="white-space:nowrap">${fmtDate(l.log_date)}<br><span class="muted">${weekday(l.log_date)}</span></td>
              <td class="small">${l.weather ? esc(l.weather) : '-'}</td>
              <td class="num">${l.workers ?? '-'}</td><td style="white-space:pre-line">${esc(pick(l, 'work_done')) || '<span class="muted">-</span>'}</td>
              <td class="num">${l.log_photos.length || '-'}</td></tr>`).join('')}</tbody>
          </table></div>` : '<p class="muted">ჩანაწერები ჯერ არ არის.</p>'}
      </section>

      <p class="report-foot muted small"><span>მოამზადა:</span> ${esc(pick(state.me, 'full_name'))} · ${fmtDate(today)}</p>
    </div>`;

  $('[data-print]', el).addEventListener('click', () => window.print());
  drawChart($('canvas', el), months, { animate: false });
}
