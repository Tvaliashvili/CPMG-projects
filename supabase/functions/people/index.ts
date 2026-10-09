// =============================================================
// people - an admin adds a person, sets a new password, or removes one.
// Sign-up is closed: every account is made here, with a password the admin
// passes on (e.g. on WhatsApp); the person can change it after signing in.
//
//   { action: "add", email, full_name, full_name_en?, role, company?, company_en?, password, project_ids? }
//   { action: "password", user_id, password }
//   { action: "remove", user_id }
// =============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const ROLES = ["admin", "staff", "subcontractor"];
const UUID = /^[0-9a-f-]{36}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json({ error: "შედით სისტემაში." }, 401);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: me } = await admin.from("people").select("role").eq("user_id", user.id).maybeSingle();
  if (me?.role !== "admin") return json({ error: "ეს მხოლოდ ადმინისტრატორს შეუძლია." }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const password = String(body.password ?? "");
  const goodPassword = password.length >= 8;

  if (body.action === "add") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const fullName = String(body.full_name ?? "").trim();
    const role = String(body.role ?? "");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "ელფოსტა არასწორია." }, 400);
    if (!fullName) return json({ error: "ჩაწერეთ სახელი და გვარი." }, 400);
    if (!ROLES.includes(role)) return json({ error: "როლი არასწორია." }, 400);
    if (!goodPassword) return json({ error: "პაროლი მინიმუმ 8 სიმბოლო უნდა იყოს." }, 400);

    const { data: made, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: fullName },
    });
    if (error || !made.user) {
      const taken = /already|exists|registered/i.test(error?.message ?? "");
      return json({ error: taken ? "ამ ელფოსტით ანგარიში უკვე არსებობს." : error?.message ?? "ვერ შეიქმნა." }, 400);
    }
    const id = made.user.id;
    const { error: rowError } = await admin.from("people").insert({
      user_id: id, email, full_name: fullName, role,
      full_name_en: String(body.full_name_en ?? "").trim() || null,
      company: String(body.company ?? "").trim() || null,
      company_en: String(body.company_en ?? "").trim() || null,
    });
    if (rowError) {
      await admin.auth.admin.deleteUser(id); // no half-made account
      return json({ error: rowError.message }, 400);
    }
    const projects = Array.isArray(body.project_ids) ? body.project_ids.filter((p) => UUID.test(String(p))) : [];
    if (role === "subcontractor" && projects.length) {
      await admin.from("project_people").insert(projects.map((p) => ({ project_id: p, user_id: id })));
    }
    return json({ user_id: id });
  }

  const target = String(body.user_id ?? "");
  if (!UUID.test(target)) return json({ error: "Bad request" }, 400);

  if (body.action === "password") {
    if (!goodPassword) return json({ error: "პაროლი მინიმუმ 8 სიმბოლო უნდა იყოს." }, 400);
    const { error } = await admin.auth.admin.updateUserById(target, { password });
    return error ? json({ error: error.message }, 400) : json({ ok: true });
  }

  if (body.action === "remove") {
    if (target === user.id) return json({ error: "საკუთარ თავს ვერ წაშლით." }, 400);
    const { error } = await admin.auth.admin.deleteUser(target); // the people row goes with it
    return error ? json({ error: error.message }, 400) : json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
});
