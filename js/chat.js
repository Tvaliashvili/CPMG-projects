// Chat: the project's conversation, text only. New messages arrive live (Supabase Realtime).
import { db, q } from './db.js';
import { $, esc, fmtDate, weekday, toast, pick } from './ui.js';
import { state, isAdmin } from './state.js';
import { tr } from './i18n.js';

let channel = null;
let messages = [];
let box = null; // the open chat's message list

/** Stops listening for new messages (when leaving the chat or the project). */
export function stopChat() {
  if (channel) db.removeChannel(channel);
  channel = null;
  box = null;
}

export async function renderChat(el) {
  const projectId = state.project.id;
  el.innerHTML = `
    <div class="chat card">
      <div class="chat-log" data-chat-log><p class="muted">იტვირთება…</p></div>
      <form class="chat-form" data-chat-form>
        <textarea name="body" rows="2" maxlength="2000" placeholder="შეტყობინება…" required></textarea>
        <button class="btn btn-primary" type="submit">გაგზავნა</button>
      </form>
      <p class="muted small chat-hint">Enter - გაგზავნა, Shift+Enter - ახალი ხაზი</p>
    </div>`;
  box = $('[data-chat-log]', el);
  const form = $('[data-chat-form]', el);

  // The latest 200, oldest first.
  const latest = await q(db.from('chat_messages').select('*').eq('project_id', projectId)
    .order('created_at', { ascending: false }).limit(200));
  if (state.project?.id !== projectId) return;
  messages = latest.reverse();
  draw(true);

  channel = db.channel(`chat-${projectId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `project_id=eq.${projectId}` },
      (change) => add(change.new))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `project_id=eq.${projectId}` },
      (change) => replace(change.new)) // a message deleted: it stays as "deleted"
    .subscribe();

  form.body.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = form.body.value.trim();
    if (!body) return;
    const button = $('button', form);
    button.disabled = true;
    try {
      const saved = await q(db.from('chat_messages').insert({ project_id: projectId, body }).select().single());
      form.body.value = '';
      add(saved);
    } catch (err) { toast(err.message, true); }
    button.disabled = false;
    form.body.focus();
  });
  box.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-delete-message]');
    if (!del || !confirm(tr('წავშალოთ შეტყობინება?'))) return;
    try {
      await q(db.rpc('delete_message', { message_id: del.dataset.deleteMessage }));
      const m = messages.find((x) => x.id === del.dataset.deleteMessage);
      if (m) replace({ ...m, body: null, deleted_at: new Date().toISOString(), deleted_by: state.me.user_id });
    } catch (err) { toast(err.message, true); }
  });
}

function replace(message) {
  const i = messages.findIndex((m) => m.id === message.id);
  if (i >= 0) { messages[i] = message; draw(false); }
}

function add(message) {
  if (!box || messages.some((m) => m.id === message.id)) return; // sent here and heard back: once
  messages.push(message);
  draw(true);
}

const localDay = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const time = (iso) => new Date(iso).toTimeString().slice(0, 5);

/** Draws the list, a date line before each new day; scrolls down when asked (or when already at the bottom). */
function draw(toBottom) {
  if (!box) return;
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  let lastDay = null;
  box.innerHTML = messages.length ? messages.map((m) => {
    const day = localDay(m.created_at);
    const dayLine = day !== lastDay ? `<div class="chat-day">${fmtDate(day)} · <span>${weekday(day)}</span></div>` : '';
    lastDay = day;
    const mine = m.user_id === state.me.user_id;
    // A deleted message keeps its place: who wrote it, and that it was deleted (by them or by an administrator).
    const deleted = m.deleted_at
      ? `<div class="chat-body chat-deleted">${m.deleted_by && m.deleted_by !== m.user_id ? 'შეტყობინება წაშალა ადმინისტრატორმა' : 'შეტყობინება წაიშალა'}</div>`
      : '';
    return `${dayLine}
      <div class="chat-msg${mine ? ' mine' : ''}">
        <div class="chat-meta"><b data-no-t>${esc(pick(m, 'author_name') || '-')}</b> <span>${time(m.created_at)}</span>
          ${!m.deleted_at && (mine || isAdmin()) ? `<button type="button" class="chat-del" data-delete-message="${m.id}" title="წაშლა">×</button>` : ''}</div>
        ${deleted || `<div class="chat-body" data-no-t>${esc(m.body)}</div>`}
      </div>`;
  }).join('') : '<p class="muted chat-empty">შეტყობინებები ჯერ არ არის. დაწერეთ პირველი.</p>';
  if (toBottom || nearBottom) box.scrollTop = box.scrollHeight;
}
