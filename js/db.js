// The database client, and a helper that turns a Supabase answer into data or an error.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** Awaits a query; returns its data or throws its error in words people can read. */
export async function q(query) {
  const { data, error } = await query;
  if (error) throw new Error(readable(error));
  return data;
}

function readable(error) {
  const m = error.message || String(error);
  if (/duplicate key.*daily_logs_project_id_log_date/i.test(m)) return 'ამ დღის ჩანაწერი უკვე არსებობს.';
  if (/row-level security|permission denied/i.test(m)) return 'ამის უფლება არ გაქვთ.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'კავშირი ვერ დამყარდა. შეამოწმეთ ინტერნეტი.';
  return m;
}

/** Signs out on this device only - it works even when the server has already ended the session. */
export async function signOutHere() {
  await db.auth.signOut({ scope: 'local' });
}

/** Calls the "people" function (admins only). */
export async function peopleCall(body) {
  const { data, error } = await db.functions.invoke('people', { body });
  if (error) {
    let message = error.message;
    try { message = (await error.context.json()).error || message; } catch { /* keep the general message */ }
    if (error.context?.status === 401) {
      // The sign-in has ended on the server: back to the sign-in screen.
      await signOutHere();
      throw new Error('სესია ამოიწურა. შედით თავიდან.');
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
