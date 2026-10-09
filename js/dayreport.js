// Daily report: one day's log on one page - print it, or save it as a PDF from the print window.
import { db } from './db.js';
import { $, $$, esc, fmtDate, weekday, pick } from './ui.js';
import { state } from './state.js';

export async function renderDayReport(el, logId) {
  const p = state.project;
  const l = state.logs.find((x) => x.id === logId);
  if (!l) {
    el.innerHTML = `<div class="empty">ჩანაწერი ვერ მოიძებნა.</div>
      <p><a href="#/p/${p.id}/log">← ჟურნალზე დაბრუნება</a></p>`;
    return;
  }

  el.innerHTML = `
    <div class="page-head no-print">
      <a href="#/p/${p.id}/log">← ჟურნალზე დაბრუნება</a>
      <button class="btn btn-primary" data-print>ბეჭდვა / PDF</button>
    </div>
    <div class="report">
      <div class="report-head">
        <div>
          <img class="report-logo" src="img/logo-mark.png" alt="CPMG">
          <h1 style="margin-top:0.6rem">${esc(pick(p, 'name'))}</h1>
          <p class="muted" style="margin:0.2rem 0 0">${[pick(p, 'client') && `დამკვეთი: ${esc(pick(p, 'client'))}`, pick(p, 'address') && esc(pick(p, 'address'))].filter(Boolean).map((part) => `<span>${part}</span>`).join(' · ')}</p>
        </div>
        <div style="text-align:right">
          <b>დღიური ანგარიში</b><br>
          <span style="font-size:1.25rem;font-weight:700">${fmtDate(l.log_date)}</span><br>
          <span class="muted small">${weekday(l.log_date)}</span>
        </div>
      </div>

      <section class="stats">
        <div class="stat"><b>${l.weather ? esc(l.weather) : '-'}</b><span>ამინდი</span></div>
        <div class="stat"><b>${l.workers ?? '-'}</b><span>მუშები</span></div>
        <div class="stat"><b>${l.log_photos.length}</b><span>ფოტოები</span></div>
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

      ${l.log_photos.length ? `
      <section>
        <h2>ფოტოები</h2>
        <div class="day-photos">${l.log_photos.map((ph) => `<img alt="" data-full="${esc(ph.path)}">`).join('')}</div>
      </section>` : ''}

      ${pick(l, 'author_name') ? `<p class="muted small" style="margin:0">ავტორი: ${esc(pick(l, 'author_name'))}</p>` : ''}
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
