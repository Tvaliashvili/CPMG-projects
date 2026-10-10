-- =============================================================
-- CPMG Projects - the database
-- Run once on a new Supabase project (SQL editor). Safe to run again:
-- everything is "if not exists" / "or replace".
--
-- Who sees what (enforced here, not only on screen):
--   admin          everything, and adds or removes people
--   staff          every project, all of it to read; they write daily logs only
--   subcontractor  only the projects they are added to: daily logs and
--                  timetable, read-only - never contractors' contracts or money
-- =============================================================

create extension if not exists pgcrypto;

-- ---------- People: one row per account, made by the "people" function ----------
create table if not exists public.people (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null unique,
  full_name  text not null,
  role       text not null check (role in ('admin', 'staff', 'subcontractor')),
  company    text,                       -- a subcontractor's firm
  created_at timestamptz not null default now()
);

-- ---------- Projects ----------
create table if not exists public.projects (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  client         text,
  address        text,
  start_date     date,
  end_date       date,
  contract_value numeric(14, 2) check (contract_value >= 0),   -- what the client pays in all
  archived       boolean not null default false,
  created_at     timestamptz not null default now()
);

-- Which projects a subcontractor can open (staff and admins see them all).
create table if not exists public.project_people (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id    uuid not null references public.people(user_id) on delete cascade,
  primary key (project_id, user_id)
);

-- ---------- Contractors: one list for the company ----------
create table if not exists public.contractors (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  trade          text,                   -- e.g. electrical works
  contact_person text,
  phone          text,
  email          text,
  notes          text,
  created_at     timestamptz not null default now()
);

-- A contractor on a project, with what was agreed. Money: staff only.
create table if not exists public.project_contractors (
  project_id      uuid not null references public.projects(id) on delete cascade,
  contractor_id   uuid not null references public.contractors(id) on delete cascade,
  scope           text,
  contract_amount numeric(14, 2) not null default 0 check (contract_amount >= 0),
  primary key (project_id, contractor_id)
);

-- ---------- Timetable ----------
create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  name          text not null,
  contractor_id uuid references public.contractors(id) on delete set null,
  start_date    date not null,
  end_date      date not null,
  progress      int  not null default 0 check (progress between 0 and 100),
  notes         text,
  created_at    timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists tasks_project on public.tasks (project_id, start_date);

-- ---------- Daily logs: one a day per project ----------
create table if not exists public.daily_logs (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  log_date    date not null,
  weather     text,
  workers     int check (workers >= 0),
  work_done   text,
  notes       text,
  author_id   uuid references public.people(user_id) on delete set null,
  author_name text,
  created_at  timestamptz not null default now(),
  unique (project_id, log_date)
);

create table if not exists public.log_photos (
  id         uuid primary key default gen_random_uuid(),
  log_id     uuid not null references public.daily_logs(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  path       text not null unique,       -- in the "photos" bucket: <project>/<log>/<file>.jpg
  created_at timestamptz not null default now()
);
create index if not exists log_photos_log on public.log_photos (log_id);

-- ---------- Money in and out ----------
create table if not exists public.money (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  entry_date    date not null,
  direction     text not null check (direction in ('in', 'out')),
  amount        numeric(14, 2) not null check (amount > 0),
  category      text not null check (category in ('client', 'contractor', 'materials', 'equipment', 'wages', 'other')),
  contractor_id uuid references public.contractors(id) on delete set null,
  description   text,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now()
);
create index if not exists money_project on public.money (project_id, entry_date);

-- =============================================================
-- Who is asking
-- =============================================================
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.people where user_id = auth.uid()
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'admin', false)
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('admin', 'staff'), false)
$$;

create or replace function public.can_see_project(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_staff()
      or exists (select 1 from public.project_people pp where pp.project_id = p and pp.user_id = auth.uid())
$$;

-- A photo's project is the first folder of its path.
create or replace function public.can_see_photo(path text) returns boolean
language sql stable security definer set search_path = public as $$
  select case when split_part(path, '/', 1) ~ '^[0-9a-f-]{36}$'
              then public.can_see_project(split_part(path, '/', 1)::uuid) else false end
$$;

-- A log is signed by whoever saves it - never by what the browser says.
create or replace function public.sign_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
    new.author_name := (select full_name from public.people where user_id = auth.uid());
  else
    new.author_id := old.author_id;
    new.author_name := old.author_name;
  end if;
  return new;
end $$;
drop trigger if exists daily_logs_sign on public.daily_logs;
create trigger daily_logs_sign before insert or update on public.daily_logs
  for each row execute function public.sign_log();

-- =============================================================
-- Rules
-- =============================================================
alter table public.people              enable row level security;
alter table public.projects            enable row level security;
alter table public.project_people      enable row level security;
alter table public.contractors         enable row level security;
alter table public.project_contractors enable row level security;
alter table public.tasks               enable row level security;
alter table public.daily_logs          enable row level security;
alter table public.log_photos          enable row level security;
alter table public.money               enable row level security;

do $$
declare r record;
begin
  -- Start from nothing, so running this again never leaves an old rule behind.
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- People: you see yourself; staff see everyone (names on logs and tasks). Admins change them.
create policy people_read   on public.people for select to authenticated using (user_id = auth.uid() or public.is_staff());
create policy people_insert on public.people for insert to authenticated with check (public.is_admin());
create policy people_update on public.people for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy people_delete on public.people for delete to authenticated using (public.is_admin() and user_id <> auth.uid());

-- Projects: only administrators make, change and delete them.
create policy projects_read   on public.projects for select to authenticated using (public.can_see_project(id));
create policy projects_insert on public.projects for insert to authenticated with check (public.is_admin());
create policy projects_update on public.projects for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy projects_delete on public.projects for delete to authenticated using (public.is_admin());

create policy project_people_read  on public.project_people for select to authenticated using (public.is_staff() or user_id = auth.uid());
create policy project_people_write on public.project_people for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Contractors: names and phones for anyone signed in (a subcontractor sees who does a timetable item).
create policy contractors_read   on public.contractors for select to authenticated using (public.my_role() is not null);
create policy contractors_insert on public.contractors for insert to authenticated with check (public.is_admin());
create policy contractors_update on public.contractors for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy contractors_delete on public.contractors for delete to authenticated using (public.is_admin());

-- Contracts and money: staff read them, administrators change them; subcontractors never see them.
create policy project_contractors_read  on public.project_contractors for select to authenticated using (public.is_staff());
create policy project_contractors_write on public.project_contractors for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy money_read  on public.money for select to authenticated using (public.is_staff());
create policy money_write on public.money for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Timetable: read on the projects you can see; administrators change it.
-- Daily logs and their photos: staff write them (the one thing staff change).
create policy tasks_read  on public.tasks for select to authenticated using (public.can_see_project(project_id));
create policy tasks_write on public.tasks for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy logs_read   on public.daily_logs for select to authenticated using (public.can_see_project(project_id));
create policy logs_write  on public.daily_logs for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy photos_read  on public.log_photos for select to authenticated using (public.can_see_project(project_id));
create policy photos_write on public.log_photos for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- =============================================================
-- Photos: a private bucket, read through short-lived links
-- =============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists cpmg_photos_read on storage.objects;
drop policy if exists cpmg_photos_insert on storage.objects;
drop policy if exists cpmg_photos_delete on storage.objects;
create policy cpmg_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.can_see_photo(name));
create policy cpmg_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.is_staff());
create policy cpmg_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.is_staff());

-- =============================================================
-- Documents: drawings, specifications, permits and other files on a project.
-- Everyone on the project sees them, subcontractors included - except files
-- marked staff only. Administrators upload, rename and delete.
-- =============================================================
create table if not exists public.documents (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  name          text not null,
  category      text not null default 'other' check (category in ('drawings', 'specs', 'permits', 'other')),
  staff_only    boolean not null default false,
  path          text not null unique,     -- in the "documents" bucket: <project>/<id>.<ext>
  size_bytes    bigint,
  mime          text,
  uploaded_by   uuid references public.people(user_id) on delete set null,
  uploader_name text,
  created_at    timestamptz not null default now()
);
create index if not exists documents_project on public.documents (project_id, category);

create or replace function public.sign_document() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.uploaded_by := auth.uid();
    new.uploader_name := (select full_name from public.people where user_id = auth.uid());
  else
    new.uploaded_by := old.uploaded_by;
    new.uploader_name := old.uploader_name;
    new.path := old.path;
  end if;
  return new;
end $$;
drop trigger if exists documents_sign on public.documents;
create trigger documents_sign before insert or update on public.documents
  for each row execute function public.sign_document();

alter table public.documents enable row level security;
drop policy if exists documents_read on public.documents;
drop policy if exists documents_write on public.documents;
create policy documents_read on public.documents for select to authenticated
  using (public.can_see_project(project_id) and (not staff_only or public.is_staff()));
create policy documents_write on public.documents for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- A file can be opened by whoever can see its row.
create or replace function public.can_see_document(file_path text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.documents d
    where d.path = file_path and public.can_see_project(d.project_id) and (not d.staff_only or public.is_staff())
  )
$$;

-- How much of the storage is used, in bytes (photos and documents). Staff only.
create or replace function public.storage_used() returns bigint
language sql stable security definer set search_path = public as $$
  select case when public.is_staff()
    then coalesce((select sum((metadata->>'size')::bigint) from storage.objects), 0) else null end
$$;

-- 50 MB a file: the most Supabase's free plan takes.
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists cpmg_documents_read on storage.objects;
drop policy if exists cpmg_documents_insert on storage.objects;
drop policy if exists cpmg_documents_delete on storage.objects;
create policy cpmg_documents_read on storage.objects for select to authenticated
  using (bucket_id = 'documents' and public.can_see_document(name));
create policy cpmg_documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.is_admin());
create policy cpmg_documents_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and public.is_admin());

-- =============================================================
-- English: every text people type has an English twin (<name>_en), filled in by hand.
-- The EN switch shows the English one, or the Georgian when it is empty.
-- =============================================================
alter table public.people              add column if not exists full_name_en text, add column if not exists company_en text;
alter table public.projects            add column if not exists name_en text, add column if not exists client_en text, add column if not exists address_en text;
alter table public.contractors         add column if not exists name_en text, add column if not exists trade_en text, add column if not exists contact_person_en text;
alter table public.project_contractors add column if not exists scope_en text;
alter table public.tasks               add column if not exists name_en text, add column if not exists notes_en text;
alter table public.daily_logs          add column if not exists work_done_en text, add column if not exists notes_en text, add column if not exists author_name_en text;
alter table public.money               add column if not exists description_en text;
alter table public.documents           add column if not exists name_en text, add column if not exists uploader_name_en text;

-- Who wrote a log, in both languages.
create or replace function public.sign_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
    select full_name, full_name_en into new.author_name, new.author_name_en from public.people where user_id = auth.uid();
  else
    new.author_id := old.author_id;
    new.author_name := old.author_name;
    new.author_name_en := old.author_name_en;
  end if;
  return new;
end $$;

create or replace function public.sign_document() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.uploaded_by := auth.uid();
    select full_name, full_name_en into new.uploader_name, new.uploader_name_en from public.people where user_id = auth.uid();
  else
    new.uploaded_by := old.uploaded_by;
    new.uploader_name := old.uploader_name;
    new.uploader_name_en := old.uploader_name_en;
    new.path := old.path;
  end if;
  return new;
end $$;

-- =============================================================
-- A password an administrator sets is temporary: at the next sign-in the
-- person must choose their own, so nobody else knows it.
-- =============================================================
alter table public.people add column if not exists must_change_password boolean not null default false;

-- Called by the person once they have chosen their own password.
create or replace function public.password_changed() returns void
language sql security definer set search_path = public as $$
  update public.people set must_change_password = false where user_id = auth.uid()
$$;
revoke all on function public.password_changed() from public, anon;
grant execute on function public.password_changed() to authenticated;

-- =============================================================
-- Chat: one conversation per project, text only. Everyone who can open the
-- project reads and writes it; people delete their own messages, admins any.
-- New messages reach open screens at once (Supabase Realtime).
-- =============================================================
create table if not exists public.chat_messages (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects(id) on delete cascade,
  user_id        uuid references public.people(user_id) on delete set null,
  author_name    text,
  author_name_en text,
  body           text not null check (length(body) between 1 and 2000),
  created_at     timestamptz not null default now()
);
create index if not exists chat_project on public.chat_messages (project_id, created_at);

-- The writer is whoever is signed in - never what the browser says.
create or replace function public.sign_chat() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.created_at := now();
  select full_name, full_name_en into new.author_name, new.author_name_en from public.people where user_id = auth.uid();
  return new;
end $$;
drop trigger if exists chat_sign on public.chat_messages;
create trigger chat_sign before insert on public.chat_messages
  for each row execute function public.sign_chat();

alter table public.chat_messages enable row level security;
drop policy if exists chat_read on public.chat_messages;
drop policy if exists chat_write on public.chat_messages;
drop policy if exists chat_delete on public.chat_messages;
create policy chat_read   on public.chat_messages for select to authenticated using (public.can_see_project(project_id));
create policy chat_write  on public.chat_messages for insert to authenticated with check (public.can_see_project(project_id));
create policy chat_delete on public.chat_messages for delete to authenticated using (user_id = auth.uid() or public.is_admin());

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;

-- A deleted chat message stays in place as "message deleted": its text is erased,
-- and who deleted it is kept (the writer, or an administrator).
alter table public.chat_messages add column if not exists deleted_at timestamptz;
alter table public.chat_messages add column if not exists deleted_by uuid;
alter table public.chat_messages alter column body drop not null;
alter table public.chat_messages drop constraint if exists chat_messages_body_check;
alter table public.chat_messages add constraint chat_messages_body_check
  check (deleted_at is not null or length(body) between 1 and 2000);
drop policy if exists chat_delete on public.chat_messages; -- deleting goes through delete_message

create or replace function public.delete_message(message_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.chat_messages
     set body = null, deleted_at = now(), deleted_by = auth.uid()
   where id = message_id and deleted_at is null
     and (user_id = auth.uid() or public.is_admin());
  if not found then raise exception 'not allowed'; end if;
end $$;
revoke all on function public.delete_message(uuid) from public, anon;
grant execute on function public.delete_message(uuid) to authenticated;

-- =============================================================
-- Waybill number on money out (RS.ge სასაქონლო ზედნადები), optional.
-- One waybill often becomes several entries - materials, equipment - so it is not unique.
-- =============================================================
alter table public.money add column if not exists waybill_no text check (length(waybill_no) <= 40);
create index if not exists money_waybill on public.money (project_id, waybill_no) where waybill_no is not null;
