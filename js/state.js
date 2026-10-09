// What the app knows right now: who is signed in, and the open project's data.
import { db, q } from './db.js';
import { daysBetween } from './ui.js';

export const state = {
  me: null,               // this person's row in "people"
  project: null,          // the open project
  tasks: [],
  contractors: [],        // the company's whole list
  projectContractors: [], // contracts on the open project (staff only)
  money: [],              // (staff only)
  logs: [],               // newest first, each with its log_photos
  documents: [],          // newest first; staff-only ones reach staff only
};

export const isAdmin = () => state.me?.role === 'admin';
export const isStaff = () => state.me?.role === 'admin' || state.me?.role === 'staff';

export const ROLE_NAMES = { admin: 'ადმინისტრატორი', staff: 'თანამშრომელი', subcontractor: 'ქვეკონტრაქტორი' };

/** Everything the open project's tabs show, fetched together. */
export async function loadProject(id) {
  const staff = isStaff();
  const [project, tasks, contractors, logs, documents, contracts, money] = await Promise.all([
    q(db.from('projects').select('*').eq('id', id).maybeSingle()),
    q(db.from('tasks').select('*').eq('project_id', id).order('start_date').order('name')),
    q(db.from('contractors').select('*').order('name')),
    q(db.from('daily_logs').select('*, log_photos(id, path)').eq('project_id', id).order('log_date', { ascending: false })),
    q(db.from('documents').select('*').eq('project_id', id).order('created_at', { ascending: false })),
    staff ? q(db.from('project_contractors').select('*').eq('project_id', id)) : [],
    staff ? q(db.from('money').select('*').eq('project_id', id).order('entry_date').order('created_at')) : [],
  ]);
  Object.assign(state, { project, tasks, contractors, logs, documents, projectContractors: contracts, money });
  return project;
}

export async function reloadTasks() {
  state.tasks = await q(db.from('tasks').select('*').eq('project_id', state.project.id).order('start_date').order('name'));
}
export async function reloadLogs() {
  state.logs = await q(db.from('daily_logs').select('*, log_photos(id, path)').eq('project_id', state.project.id).order('log_date', { ascending: false }));
}
export async function reloadDocuments() {
  state.documents = await q(db.from('documents').select('*').eq('project_id', state.project.id).order('created_at', { ascending: false }));
}
export async function reloadContractors() {
  const [contractors, contracts] = await Promise.all([
    q(db.from('contractors').select('*').order('name')),
    q(db.from('project_contractors').select('*').eq('project_id', state.project.id)),
  ]);
  Object.assign(state, { contractors, projectContractors: contracts });
}
export async function reloadMoney() {
  state.money = await q(db.from('money').select('*').eq('project_id', state.project.id).order('entry_date').order('created_at'));
}

export const contractorName = (id) => state.contractors.find((c) => c.id === id)?.name ?? '';

// ---------- Timetable progress ----------
export const STATUS = {
  done: ['დასრულებული', 'chip-done'],
  late: ['ვადაგადაცილებული', 'chip-late'],
  now: ['მიმდინარე', 'chip-now'],
  later: ['დასაწყები', ''],
};
export function taskStatus(t, today) {
  if (t.progress >= 100) return 'done';
  if (t.end_date < today) return 'late';
  if (t.start_date <= today) return 'now';
  return 'later';
}

/**
 * How far the work is (each item weighted by its length in days), against how
 * far it should be by today if every item ran evenly from its start to finish.
 */
export function progressOf(tasks, today) {
  let weight = 0, done = 0, planned = 0;
  for (const t of tasks) {
    const days = daysBetween(t.start_date, t.end_date) + 1;
    const elapsed = Math.min(Math.max(daysBetween(t.start_date, today) + 1, 0), days);
    weight += days;
    done += (t.progress / 100) * days;
    planned += elapsed;
  }
  return weight
    ? { actual: Math.round((done / weight) * 100), planned: Math.round((planned / weight) * 100), count: tasks.length }
    : { actual: 0, planned: 0, count: 0 };
}

// ---------- Money ----------
export const CATEGORIES = {
  client: 'დამკვეთის გადახდა',
  contractor: 'კონტრაქტორი',
  materials: 'მასალები',
  equipment: 'ტექნიკა',
  wages: 'ხელფასები',
  other: 'სხვა',
};
export const IN_CATEGORIES = ['client', 'other'];
export const OUT_CATEGORIES = ['contractor', 'materials', 'equipment', 'wages', 'other'];

export function moneyTotals(entries) {
  let incoming = 0, outgoing = 0;
  for (const m of entries) {
    if (m.direction === 'in') incoming += Number(m.amount);
    else outgoing += Number(m.amount);
  }
  return { incoming, outgoing, balance: incoming - outgoing };
}

/** Month by month: in, out, and the balance carried forward. */
export function moneyByMonth(entries) {
  const months = new Map();
  for (const m of entries) {
    const key = m.entry_date.slice(0, 7);
    const row = months.get(key) ?? { month: key, incoming: 0, outgoing: 0 };
    if (m.direction === 'in') row.incoming += Number(m.amount);
    else row.outgoing += Number(m.amount);
    months.set(key, row);
  }
  let running = 0;
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).map((r) => {
    running += r.incoming - r.outgoing;
    return { ...r, net: r.incoming - r.outgoing, balance: running };
  });
}

/** What was paid out to each contractor on the open project. */
export function paidTo(contractorId) {
  return state.money
    .filter((m) => m.direction === 'out' && m.contractor_id === contractorId)
    .reduce((sum, m) => sum + Number(m.amount), 0);
}
