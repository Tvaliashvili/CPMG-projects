# CPMG Projects

A simple site for CPMG's construction projects: daily logs with photos, the timetable,
contractors and their contracts, money in and out, and a one-page project report.

- **Site:** plain HTML, CSS and JavaScript in this repository, served by GitHub Pages (no build step).
- **Database, sign-in and photos:** Supabase (project settings in `js/config.js`).

## Who sees what

| Role | Sees |
|---|---|
| Administrator | Everything: projects, timetable, documents, contractors, money, people |
| Staff | Every project to read, money included; writes daily logs only |
| Subcontractor | Only the projects they are added to: daily logs and timetable, read-only, no money |

The database enforces this (`supabase/schema.sql`), not only the screens.

## People

Nobody can sign up. An administrator adds each person under **მომხმარებლები** with a password,
and passes on the address, email and password. Only an administrator changes passwords
("ახალი პაროლი" beside each person).

## Setting up a new copy

1. Create a Supabase project and run `supabase/schema.sql` in its SQL editor.
2. In Authentication, turn off "Allow new users to sign up".
3. Deploy the function: `npx supabase functions deploy people --project-ref <ref>`.
4. Put the project URL and anon key in `js/config.js`.
5. Create the first administrator in Authentication → Users, then add their row:
   `insert into people (user_id, email, full_name, role) values ('<user id>', '<email>', '<name>', 'admin');`
