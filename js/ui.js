// Small shared helpers: finding elements, formatting, pop-up forms, messages.
import { tr } from './i18n.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Text made safe to put inside HTML. */
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const lari = (n) => `${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₾`;

/** 2026-10-09 -> 09.10.2026 */
export const fmtDate = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '-');

/** Today as 2026-10-09, in the local time zone. */
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DAY = 86_400_000;
export const toTime = (iso) => new Date(`${iso}T00:00`).getTime();
export const daysBetween = (a, b) => Math.round((toTime(b) - toTime(a)) / DAY);
export const addDays = (iso, n) => {
  const d = new Date(toTime(iso) + n * DAY + 12 * 3_600_000); // noon, so a clock change never shifts the day
  return d.toISOString().slice(0, 10);
};

export const MONTHS = ['იანვარი', 'თებერვალი', 'მარტი', 'აპრილი', 'მაისი', 'ივნისი', 'ივლისი', 'აგვისტო', 'სექტემბერი', 'ოქტომბერი', 'ნოემბერი', 'დეკემბერი'];
export const MONTHS_SHORT = ['იან', 'თებ', 'მარ', 'აპრ', 'მაი', 'ივნ', 'ივლ', 'აგვ', 'სექ', 'ოქტ', 'ნოე', 'დეკ'];
export const WEEKDAYS = ['კვირა', 'ორშაბათი', 'სამშაბათი', 'ოთხშაბათი', 'ხუთშაბათი', 'პარასკევი', 'შაბათი'];
/** 2026-10 -> ოქტომბერი 2026 */
export const monthName = (ym) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
export const weekday = (iso) => WEEKDAYS[new Date(`${iso}T12:00`).getDay()];

/** A short message at the bottom of the screen. */
let toastTimer;
export function toast(text, bad = false) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.toggle('bad', bad);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, bad ? 6000 : 2500);
}

/**
 * A pop-up form. `body` is the fields' HTML; `onSubmit(form, data)` saves and
 * may throw - the message then shows in the form. `onDelete` adds a delete button.
 * `onOpen(form)` wires up anything the fields need.
 */
export function openForm({ title, body, submit = 'შენახვა', onSubmit, onDelete, deleteText = 'წაშლა', onOpen }) {
  const dialog = $('#form-dialog');
  dialog.innerHTML = `
    <form novalidate>
      <h2>${esc(title)}</h2>
      ${body}
      <p class="form-error" hidden></p>
      <div class="actions">
        ${onDelete ? `<button type="button" class="btn btn-danger" data-delete>${esc(deleteText)}</button>` : ''}
        <button type="button" class="btn btn-ghost" data-cancel>გაუქმება</button>
        ${onSubmit ? `<button type="submit" class="btn btn-primary">${esc(submit)}</button>` : ''}
      </div>
    </form>`;
  const form = $('form', dialog);
  const error = $('.form-error', form);
  const busy = (on) => $$('button', form).forEach((b) => { b.disabled = on; });
  const fail = (e) => { error.textContent = e.message || String(e); error.hidden = false; busy(false); };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    error.hidden = true;
    busy(true);
    try {
      const keepOpen = await onSubmit(form, new FormData(form));
      if (!keepOpen) dialog.close();
    } catch (err) { fail(err); return; }
    busy(false);
  });
  $('[data-cancel]', form).addEventListener('click', () => dialog.close());
  $('[data-delete]', form)?.addEventListener('click', async () => {
    if (!confirm(tr('ნამდვილად წავშალოთ?'))) return;
    busy(true);
    try { await onDelete(form); dialog.close(); } catch (err) { fail(err); }
  });
  onOpen?.(form);
  if (!dialog.open) dialog.showModal(); // one form may follow another in the same window
  return form;
}

/** A photo, full size, over the page. */
export function showPhoto(url) {
  const dialog = $('#photo-dialog');
  $('img', dialog).src = url;
  dialog.showModal();
}
$('#photo-dialog [data-close]').addEventListener('click', () => $('#photo-dialog').close());
$('#photo-dialog').addEventListener('click', (e) => { if (e.target.id === 'photo-dialog') e.target.close(); });

/** Options for a <select>, the chosen one marked. */
export const options = (list, chosen) => list
  .map(([value, label]) => `<option value="${esc(value)}"${String(value) === String(chosen ?? '') ? ' selected' : ''}>${esc(label)}</option>`)
  .join('');

/** A number from a form field, or null when it is empty. */
export const numOrNull = (v) => (v === null || String(v).trim() === '' ? null : Number(String(v).replace(',', '.')));
