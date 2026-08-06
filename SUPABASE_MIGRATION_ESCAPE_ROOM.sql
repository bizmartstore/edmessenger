-- EdMessenger — Escape Room activity format
-- Run in Supabase SQL Editor after existing migrations.

-- 1) Activity format + escape room config
alter table public.activities
  add column if not exists format text not null default 'standard';
alter table public.activities
  add column if not exists escape_config jsonb;

do $$
begin
  begin
    alter table public.activities
      add constraint activities_format_check check (format in ('standard', 'escape'));
  exception when duplicate_object then null;
  end;
end $$;

-- 2) Escape room attempts (auto-scored, max 30 points)
create table if not exists public.activity_escape_attempts (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  seconds integer not null default 0,
  hints_used integer not null default 0,
  wrong_answers integer not null default 0,
  score numeric not null default 0,
  max_score numeric not null default 30,
  completed_at timestamptz not null default now(),
  unique (activity_id, user_id)
);
create index if not exists activity_escape_attempts_activity_idx
  on public.activity_escape_attempts (activity_id, completed_at desc);

grant select, insert, update, delete on public.activity_escape_attempts to authenticated;
grant all on public.activity_escape_attempts to service_role;
alter table public.activity_escape_attempts enable row level security;

drop policy if exists "escape attempts read own or admin" on public.activity_escape_attempts;
create policy "escape attempts read own or admin" on public.activity_escape_attempts
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "escape attempts insert own" on public.activity_escape_attempts;
create policy "escape attempts insert own" on public.activity_escape_attempts
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "escape attempts update own" on public.activity_escape_attempts;
create policy "escape attempts update own" on public.activity_escape_attempts
  for update to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  with check (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "escape attempts admin delete" on public.activity_escape_attempts;
create policy "escape attempts admin delete" on public.activity_escape_attempts
  for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'));
