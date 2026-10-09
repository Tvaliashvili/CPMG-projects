// Daily log: one entry a day - weather, workers, the work done, notes and photos.
import { db, q } from './db.js';
import { $, $$, esc, fmtDate, weekday, todayISO, toast, openForm, options, showPhoto, pick, pair, texts } from './ui.js';
import { state, isStaff, reloadLogs } from './state.js';

const WEATHER = ['მზიანი', 'ღრუბლიანი', 'წვიმა', 'თოვლი', 'ქარიანი', 'ცხელი', 'ყინვა'];
const PAGE = 15;
let shown = PAGE;
let shownFor = null;

export async function renderLogs(el) {
  if (shownFor !== state.project.id) { shown = PAGE; shownFor = state.project.id; }
  const logs = state.logs.slice(0, shown);
  const today = todayISO();
  const hasToday = state.logs.some((l) => l.log_date === today);

  el.innerHTML = `
    <div class="page-head">
      <h2>დღიური ჟურნალი <span class="muted small">(${state.logs.length})</span></h2>
      ${isStaff() ? `<button class="btn btn-primary" data-new-log>${hasToday ? '+ ახალი ჩანაწერი' : '+ დღევანდელი ჩანაწერი'}</button>` : ''}
    </div>
    ${logs.length ? `<div class="stack">${logs.map(logCard).join('')}</div>` : '<div class="empty">ჩანაწერები ჯერ არ არის.</div>'}
    ${state.logs.length > shown ? '<p style="text-align:center;margin-top:1rem"><button class="btn btn-ghost" data-more>მეტის ჩვენება</button></p>' : ''}`;

  $('[data-new-log]', el)?.addEventListener('click', () => logForm(null, el));
  $('[data-more]', el)?.addEventListener('click', () => { shown += PAGE; renderLogs(el); });
  $$('[data-edit-log]', el).forEach((b) => b.addEventListener('click', () => logForm(state.logs.find((l) => l.id === b.dataset.editLog), el)));
  await showThumbs(el, logs);
}

function logCard(l) {
  return `
    <article class="card log">
      <div class="log-head">
        <h3>${fmtDate(l.log_date)} <span class="muted small">${weekday(l.log_date)}</span></h3>
        <div class="log-meta">
          ${l.weather ? `<span class="chip">${esc(l.weather)}</span>` : ''}
          ${l.workers != null ? `<span class="chip">მუშები: ${l.workers}</span>` : ''}
          <a class="btn btn-ghost btn-sm" href="#/p/${state.project.id}/day/${l.id}">ანგარიში</a>
          ${isStaff() ? `<button class="btn btn-ghost btn-sm" data-edit-log="${l.id}">რედაქტირება</button>` : ''}
        </div>
      </div>
      ${pick(l, 'work_done') ? `<div><div class="log-label">შესრულებული სამუშაო</div><p>${esc(pick(l, 'work_done'))}</p></div>` : ''}
      ${pick(l, 'notes') ? `<div><div class="log-label">შენიშვნები</div><p>${esc(pick(l, 'notes'))}</p></div>` : ''}
      ${l.log_photos.length ? `<div class="photos">${l.log_photos.map((ph) => `<button type="button" data-photo="${esc(ph.path)}"><img alt="" data-thumb="${esc(thumbOf(ph.path))}"></button>`).join('')}</div>` : ''}
      ${pick(l, 'author_name') ? `<span class="muted small">ავტორი: ${esc(pick(l, 'author_name'))}</span>` : ''}
    </article>`;
}

// ---------- Photos: a full copy and a small one, read through short-lived links ----------
const thumbOf = (path) => path.replace(/\.jpg$/, '_t.jpg');

async function signed(paths) {
  if (!paths.length) return new Map();
  const { data } = await db.storage.from('photos').createSignedUrls(paths, 3600);
  return new Map((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
}

async function showThumbs(el, logs) {
  const paths = logs.flatMap((l) => l.log_photos.map((ph) => thumbOf(ph.path)));
  const urls = await signed(paths);
  $$('img[data-thumb]', el).forEach((img) => { img.src = urls.get(img.dataset.thumb) ?? ''; });
  $$('[data-photo]', el).forEach((b) => b.addEventListener('click', async () => {
    const url = (await signed([b.dataset.photo])).get(b.dataset.photo);
    if (url) showPhoto(url);
  }));
}

/** A photo made smaller in the browser, as a JPEG: a phone's 5 MB picture becomes a few hundred KB. */
async function shrink(file, max, quality) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => (blob ? resolve(blob) : reject(new Error('ფოტო ვერ დამუშავდა.'))), 'image/jpeg', quality));
}

async function uploadPhotos(logId, files) {
  const bucket = db.storage.from('photos');
  for (const file of files) {
    const path = `${state.project.id}/${logId}/${crypto.randomUUID()}.jpg`;
    const [full, small] = await Promise.all([shrink(file, 1600, 0.78), shrink(file, 360, 0.7)]);
    const up = await bucket.upload(path, full, { contentType: 'image/jpeg' });
    if (up.error) throw new Error(`ფოტო ვერ აიტვირთა: ${up.error.message}`);
    await bucket.upload(thumbOf(path), small, { contentType: 'image/jpeg' });
    await q(db.from('log_photos').insert({ log_id: logId, project_id: state.project.id, path }));
  }
}

async function removePhotos(photos) {
  if (!photos.length) return;
  await db.storage.from('photos').remove(photos.flatMap((ph) => [ph.path, thumbOf(ph.path)]));
  await q(db.from('log_photos').delete().in('id', photos.map((ph) => ph.id)));
}

// ---------- The form ----------
function logForm(log, el) {
  let current = log;
  openForm({
    title: log ? `ჩანაწერი - ${fmtDate(log.log_date)}` : 'ახალი ჩანაწერი',
    body: `
      <div class="row">
        <label>თარიღი<input name="log_date" type="date" required max="${todayISO()}" value="${esc(log?.log_date ?? todayISO())}"></label>
        <label>ამინდი<select name="weather"><option value=""></option>${options(WEATHER.map((w) => [w, w]), log?.weather)}</select></label>
      </div>
      <label>მუშების რაოდენობა<input name="workers" type="number" min="0" max="2000" inputmode="numeric" value="${esc(log?.workers)}"></label>
      ${pair('შესრულებული სამუშაო', 'work_done', log, { textarea: true, rows: 4, placeholder: 'რა გაკეთდა, სად, ვინ' })}
      ${pair('შენიშვნები', 'notes', log, { textarea: true, rows: 2 })}
      ${log?.log_photos.length ? `
        <div><div class="log-label">მონიშნეთ წასაშლელი ფოტოები</div>
          <div class="photo-pick">${log.log_photos.map((ph) => `
            <label><img alt="" data-thumb="${esc(thumbOf(ph.path))}"><input type="checkbox" name="drop" value="${ph.id}"></label>`).join('')}</div></div>` : ''}
      <label>ფოტოების დამატება<input name="photos" type="file" accept="image/*" multiple></label>`,
    onOpen: async (form) => {
      const urls = await signed($$('img[data-thumb]', form).map((img) => img.dataset.thumb));
      $$('img[data-thumb]', form).forEach((img) => { img.src = urls.get(img.dataset.thumb) ?? ''; });
    },
    onSubmit: async (form, data) => {
      const workers = data.get('workers');
      const row = {
        log_date: data.get('log_date'),
        weather: data.get('weather') || null,
        workers: workers === '' ? null : Number(workers),
        ...texts(data, 'work_done'),
        ...texts(data, 'notes'),
      };
      // Once saved, a retry (say, after a photo failed to upload) changes this log - never adds a second.
      const saved = current
        ? await q(db.from('daily_logs').update(row).eq('id', current.id).select().single())
        : await q(db.from('daily_logs').insert({ ...row, project_id: state.project.id }).select().single());
      const drop = data.getAll('drop');
      await removePhotos((current?.log_photos ?? []).filter((ph) => drop.includes(ph.id)));
      current = { ...saved, log_photos: (current?.log_photos ?? []).filter((ph) => !drop.includes(ph.id)) };
      const files = [...form.photos.files];
      if (files.length) {
        $('[type=submit]', form).textContent = 'ფოტოები იტვირთება…';
        await uploadPhotos(saved.id, files);
      }
      await reloadLogs();
      toast('შენახულია');
      renderLogs(el);
    },
    onDelete: log ? async () => {
      await removePhotos(log.log_photos);
      await q(db.from('daily_logs').delete().eq('id', log.id));
      await reloadLogs();
      toast('ჩანაწერი წაიშალა');
      renderLogs(el);
    } : null,
  });
}
