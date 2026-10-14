-- Turn on row-level security for every table in `public`.
--
-- Supabase exposes `public` through its PostgREST API (/rest/v1) to the `anon` and `authenticated`
-- roles, which had SELECT on every table — orders, addresses, users, audit_log included — with RLS
-- off everywhere. Migrations 0009/0010 created policies on `users` but never enabled RLS, so those
-- policies did nothing and anyone holding the project's publishable key could read every row.
--
-- With RLS on and no policy, `anon`/`authenticated` see nothing. The app is unaffected: its Drizzle
-- connection is the `postgres` role (table owner, BYPASSRLS), and the one PostgREST read the app
-- makes — middleware.ts reading the signed-in user's own role via lib/db/session-role.ts — is exactly
-- what the existing `users_can_read_own_row` policy allows. Any table added later must enable RLS too.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
