// Documents: drawings, specifications, permits and other files, for everyone on the project.
// Files marked staff only are hidden from subcontractors (by the database, not only here).
import { db, q } from './db.js';
import { $, $$, esc, fmtDate, toast, openForm, options, pick, pair, texts } from './ui.js';
import { state, isStaff, isAdmin, reloadDocuments } from './state.js';

export const DOC_CATEGORIES = {
  drawings: 'ნახაზები',
  specs: 'სპეციფიკაციები',
  permits: 'ნებართვები',
  other: 'სხვა',
};
const MAX_BYTES = 50 * 1024 * 1024; // the storage takes up to 50 MB a file
const FREE_BYTES = 1024 ** 3;       // Supabase's free plan: 1 GB for photos and documents together

let category = 'all';

export const fileSize = (bytes) => {
  if (bytes == null) return '-';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

/** Opens in the browser what it can show (PDF, pictures, text); the rest downloads under its own name. */
const opensInBrowser = (mime) => /^(application\/pdf|image\/|text\/plain)/.test(mime ?? '');

export async function renderDocuments(el) {
  const docs = state.documents;
  const shown = docs.filter((d) => category === 'all' || d.category === category);
  const counts = Object.fromEntries(Object.keys(DOC_CATEGORIES).map((k) => [k, docs.filter((d) => d.category === k).length]));

  el.innerHTML = `
    <div class="page-head">
      <h2>დოკუმენტები <span class="muted small">(${docs.length})</span></h2>
      ${isAdmin() ? '<button class="btn btn-primary" data-upload>+ ფაილის ატვირთვა</button>' : ''}
    </div>
    ${isStaff() ? '<div class="usage" data-usage></div>' : ''}
    <div class="filter" style="margin-bottom:1rem;flex-wrap:wrap">
      ${[['all', `ყველა (${docs.length})`], ...Object.entries(DOC_CATEGORIES).map(([k, label]) => [k, `${label} (${counts[k]})`])]
        .map(([k, label]) => `<button type="button" data-cat="${k}" class="${category === k ? 'active' : ''}">${esc(label)}</button>`).join('')}
    </div>
    ${shown.length ? `
      <div class="table-wrap">
        <table>
          <thead><tr><th>ფაილი</th><th class="hide-phone">განყოფილება</th><th class="num hide-phone">ზომა</th><th class="hide-phone">ატვირთა</th><th></th></tr></thead>
          <tbody>${shown.map((d) => `
            <tr>
              <td><a href="#" data-open="${d.id}"><b>${esc(pick(d, 'name'))}</b></a>
                ${d.staff_only ? ' <span class="chip chip-late">მხოლოდ თანამშრომლებისთვის</span>' : ''}
                <span class="muted small show-phone"><span>${esc(DOC_CATEGORIES[d.category])}</span> · ${fileSize(d.size_bytes)} · ${fmtDate(d.created_at.slice(0, 10))}</span></td>
              <td class="hide-phone">${esc(DOC_CATEGORIES[d.category])}</td>
              <td class="num hide-phone small">${fileSize(d.size_bytes)}</td>
              <td class="hide-phone small">${esc(pick(d, 'uploader_name'))}<br><span class="muted">${fmtDate(d.created_at.slice(0, 10))}</span></td>
              <td class="num">${isAdmin() ? `<button class="btn btn-ghost btn-sm" data-edit="${d.id}">რედაქტირება</button>` : ''}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>` : `<div class="empty">${docs.length ? 'ამ განყოფილებაში ფაილები არ არის.' : 'დოკუმენტები ჯერ არ არის.'}</div>`}`;

  $('[data-upload]', el)?.addEventListener('click', () => uploadForm(el));
  $$('[data-cat]', el).forEach((b) => b.addEventListener('click', () => { category = b.dataset.cat; renderDocuments(el); }));
  $$('[data-open]', el).forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); openDocument(docs.find((d) => d.id === a.dataset.open)); }));
  $$('[data-edit]', el).forEach((b) => b.addEventListener('click', () => editForm(docs.find((d) => d.id === b.dataset.edit), el)));
  if (isStaff()) showUsage($('[data-usage]', el));
}

async function showUsage(box) {
  const { data: used } = await db.rpc('storage_used');
  if (used == null || !box) return;
  const pct = Math.min(100, Math.round((used / FREE_BYTES) * 100));
  box.innerHTML = `
    <div class="bar" style="max-width:20rem"><span style="width:${pct}%;${pct >= 85 ? 'background:var(--red)' : ''}"></span></div>
    <span class="muted small">საცავი: ${fileSize(used)} / 1 GB (${pct}%) - ფოტოები და დოკუმენტები ერთად</span>`;
}

async function openDocument(d) {
  // A window opened now, before waiting for the link, is not blocked as a pop-up.
  const win = window.open('', '_blank');
  const { data, error } = await db.storage.from('documents')
    .createSignedUrl(d.path, 3600, opensInBrowser(d.mime) ? undefined : { download: pick(d, 'name') });
  if (error || !data?.signedUrl) {
    win?.close();
    toast('ფაილი ვერ გაიხსნა.', true);
    return;
  }
  if (win) win.location = data.signedUrl;
  else location.href = data.signedUrl;
}

/** A file's extension, for its stored name (the shown name keeps every letter). */
const extension = (name) => {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name);
  return m ? `.${m[1].toLowerCase()}` : '';
};

function uploadForm(el) {
  openForm({
    title: 'ფაილის ატვირთვა',
    body: `
      <label>ფაილები<input name="files" type="file" multiple required></label>
      <p class="muted small" style="margin:-0.4rem 0 0">ერთი ფაილი - მაქსიმუმ 50 MB.</p>
      <label>განყოფილება<select name="category">${options(Object.entries(DOC_CATEGORIES), category === 'all' ? 'drawings' : category)}</select></label>
      <label class="check"><input type="checkbox" name="staff_only"> მხოლოდ თანამშრომლებისთვის (ქვეკონტრაქტორები ვერ ნახავენ)</label>`,
    submit: 'ატვირთვა',
    onSubmit: async (form, data) => {
      const files = [...form.files.files];
      const tooBig = files.find((f) => f.size > MAX_BYTES);
      if (tooBig) throw new Error(`"${tooBig.name}" 50 MB-ზე დიდია.`);
      const button = $('[type=submit]', form);
      let done = 0;
      for (const file of files) {
        button.textContent = `იტვირთება ${done + 1} / ${files.length}…`;
        const path = `${state.project.id}/${crypto.randomUUID()}${extension(file.name)}`;
        const up = await db.storage.from('documents').upload(path, file, { contentType: file.type || 'application/octet-stream' });
        if (up.error) throw new Error(`"${file.name}" ვერ აიტვირთა: ${up.error.message}`);
        try {
          await q(db.from('documents').insert({
            project_id: state.project.id, name: file.name, category: data.get('category'),
            staff_only: data.get('staff_only') === 'on', path, size_bytes: file.size, mime: file.type || null,
          }));
        } catch (e) {
          await db.storage.from('documents').remove([path]); // no file without its row
          throw e;
        }
        done += 1;
      }
      await reloadDocuments();
      toast(files.length > 1 ? `ატვირთულია ${files.length} ფაილი` : 'ატვირთულია');
      renderDocuments(el);
    },
  });
}

function editForm(d, el) {
  openForm({
    title: 'ფაილის რედაქტირება',
    body: `
      ${pair('დასახელება', 'name', d, { required: true, maxlength: 200 })}
      <label>განყოფილება<select name="category">${options(Object.entries(DOC_CATEGORIES), d.category)}</select></label>
      <label class="check"><input type="checkbox" name="staff_only" ${d.staff_only ? 'checked' : ''}> მხოლოდ თანამშრომლებისთვის (ქვეკონტრაქტორები ვერ ნახავენ)</label>`,
    onSubmit: async (form, data) => {
      await q(db.from('documents').update({
        ...texts(data, 'name'), category: data.get('category'), staff_only: data.get('staff_only') === 'on',
      }).eq('id', d.id));
      await reloadDocuments();
      toast('შენახულია');
      renderDocuments(el);
    },
    onDelete: async () => {
      await q(db.from('documents').delete().eq('id', d.id));
      await db.storage.from('documents').remove([d.path]);
      await reloadDocuments();
      toast('ფაილი წაიშალა');
      renderDocuments(el);
    },
  });
}
