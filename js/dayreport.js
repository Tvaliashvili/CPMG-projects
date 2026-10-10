// Daily report: one day's log on one page - print it, or save it as a PDF from the print window.
import { db } from './db.js';
import { $, $$, esc, fmtDate, weekday, pick, todayISO, daysBetween, addDays } from './ui.js';
import { state, contractorName, taskStatus, STATUS } from './state.js';
import { reportHead, tile, lookAhead, aheadList, workerBars } from './report.js';

export async function renderDayReport(el, logId) {
  const p = state.project;
  const l = state.logs.find((x) => x.id === logId);
  if (!l) {
    el.innerHTML = `<div class="empty">ჩანაწერი ვერ მოიძებნა.</div>
      <p><a href="#/p/${p.id}/log">← ჟურნალზე დაბრუნება</a></p>`;
    return;
  }
  const day = l.log_date;
  const today = todayISO();
  // The logs are newest first: the one after this in the list is the day before.
  const at = state.logs.indexOf(l);
  const prev = state.logs[at + 1];
  const next = state.logs[at - 1];

  // The week up to this day, for comparison.
  const week = state.logs.filter((x) => x.log_date < day && daysBetween(x.log_date, day) <= 7 && x.workers != null);
  const avgWeek = week.length ? Math.round(week.reduce((s, x) => s + x.workers, 0) / week.length) : null;
  const projectDay = p.start_date && p.end_date && day >= p.start_date
    ? `${daysBetween(p.start_date, day) + 1} / ${daysBetween(p.start_date, p.end_date) + 1}` : null;

  // What the timetable had going on that day. Progress is only known as it stands now.
  const scheduled = state.tasks.filter((t) => t.start_date <= day && day <= t.end_date);
  const ahead = lookAhead(state.tasks, day, 7);

  el.innerHTML = `
    <div class="page-head no-print">
      <a href="#/p/${p.id}/log">← ჟურნალზე დაბრუნება</a>
      <span class="day-nav">
        ${prev ? `<a class="btn btn-ghost btn-sm" href="#/p/${p.id}/day/${prev.id}">← წინა დღე</a>` : ''}
        ${next ? `<a class="btn btn-ghost btn-sm" href="#/p/${p.id}/day/${next.id}"><span>შემდეგი დღე</span> →</a>` : ''}
        <button class="btn btn-primary" data-print>ბეჭდვა / PDF</button>
      </span>
    </div>
    <div class="report">
      ${reportHead(p, 'დღიური ანგარიში', `
        <span class="report-date">${fmtDate(day)}</span><br>
        <span class="muted small">${weekday(day)}</span>
        ${projectDay ? `<br><span class="small"><span>პროექტის დღე</span> <b>${projectDay}</b></span>` : ''}`)}

      <section class="stats">
        ${tile('ამინდი', l.weather ? esc(l.weather) : '-')}
        ${tile('მუშები', l.workers ?? '-', { sub: avgWeek != null ? `<span>საშუალოდ წინა 7 დღეში:</span> ${avgWeek}` : '' })}
        ${tile('ფოტოები', l.log_photos.length)}
        ${tile('გრაფიკით მიმდინარე სამუშაო', scheduled.length)}
      </section>

      <section class="card">
        <h2>შესრულებული სამუშაო</h2>
        <p style="margin:0;white-space:pre-line">${esc(pick(l, 'work_done')) || '<span class="muted">-</span>'}</p>
      </section>

      ${pick(l, 'notes') ? `
      <section class="card">
        <h2>შენიშვნები</h2>
        <p style="margin:0;white-space:pre-line">${esc(pick(l, 'notes'))}</p>
      </section>` : ''}

      <section>
        <h2>ამ დღეს გრაფიკით მიმდინარე სამუშაოები</h2>
        ${scheduled.length ? `
          <div class="table-wrap"><table>
            <thead><tr><th>სამუშაო</th><th>კონტრაქტორი</th><th>ვადები</th><th class="num">სამუშაოს დღე</th><th>შესრულება</th></tr></thead>
            <tbody>${scheduled.map((t) => {
              const [label, chip] = STATUS[taskStatus(t, today)];
              return `<tr><td>${esc(pick(t, 'name'))}</td><td>${esc(contractorName(t.contractor_id)) || '-'}</td>
                <td class="small" style="white-space:nowrap">${fmtDate(t.start_date)} - ${fmtDate(t.end_date)}</td>
                <td class="num">${daysBetween(t.start_date, day) + 1} / ${daysBetween(t.start_date, t.end_date) + 1}</td>
                <td><div class="bar"><span style="width:${t.progress}%"></span></div><span class="small"><b>${t.progress}%</b></span> <span class="chip ${chip}">${label}</span></td></tr>`;
            }).join('')}</tbody>
          </table></div>
          ${day < today ? '<p class="muted small" style="margin:0.4rem 0 0">შესრულება ნაჩვენებია დღევანდელი მდგომარეობით.</p>' : ''}`
          : '<p class="muted">ამ დღეს გრაფიკით სამუშაო არ იყო.</p>'}
      </section>

      <section class="two">
        <div class="card">
          <h3>მომდევნო 7 დღე</h3>
          ${ahead.length ? aheadList(ahead.slice(0, 8)) : '<p class="muted" style="margin:0">კვირაში არაფერი იწყება და არაფერი სრულდება</p>'}
        </div>
        <div class="card">
          <h3>მუშები, ბოლო 14 დღე</h3>
          ${workerBars(state.logs, addDays(day, -13), 14, day)}
        </div>
      </section>

      ${l.log_photos.length ? `
      <section>
        <h2>ფოტოები</h2>
        <div class="day-photos">${l.log_photos.map((ph) => `<img alt="" data-full="${esc(ph.path)}">`).join('')}</div>
      </section>` : ''}

      <section class="signs">
        <div><span class="muted small">შეადგინა</span><b>${esc(pick(l, 'author_name')) || '&nbsp;'}</b><i></i><span class="muted small">ხელმოწერა</span></div>
        <div><span class="muted small">დაადასტურა</span><b>&nbsp;</b><i></i><span class="muted small">ხელმოწერა</span></div>
      </section>
    </div>`;

  $('[data-print]', el).addEventListener('click', () => window.print());

  // The photos at full size, so the printed page is sharp.
  const imgs = $$('img[data-full]', el);
  if (imgs.length) {
    const { data } = await db.storage.from('photos').createSignedUrls(imgs.map((img) => img.dataset.full), 3600);
    const urls = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
    imgs.forEach((img) => { img.src = urls.get(img.dataset.full) ?? ''; });
  }
}
