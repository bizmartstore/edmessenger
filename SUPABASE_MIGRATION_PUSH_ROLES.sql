-- Push notification recipient lookup (bypasses user_roles RLS via security definer)
-- Run once in Supabase SQL Editor after SUPABASE_SETUP.sql

create or replace function public.get_user_ids_by_role(_role app_role)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select user_id from public.user_roles where role = _role;
$$;

grant execute on function public.get_user_ids_by_role(app_role) to authenticated;

-- A profile is created in the same transaction as the first Google sign-in.
-- Keep created_at and updated_at identical until the app atomically claims
-- the one-time "new student" admin notification.
alter table public.profiles
  alter column updated_at set default now();
