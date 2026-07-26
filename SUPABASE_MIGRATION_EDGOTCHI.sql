-- EdMessenger — Edgotchi virtual pet (one compact row per student)
-- Run after SUPABASE_MIGRATION_CHAT_FEEDBACK_GROUP_QUIZ.sql
-- Quota-safe: single upsert per user, small jsonb voxels, no realtime.

create table if not exists public.edgotchis (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  name text not null,
  voxels jsonb not null default '[]'::jsonb,
  level int not null default 1 check (level >= 1 and level <= 99),
  xp int not null default 0 check (xp >= 0),
  hp int not null default 100,
  max_hp int not null default 100,
  mana int not null default 50,
  max_mana int not null default 50,
  wins int not null default 0,
  battles int not null default 0,
  skills text[] not null default array['spark']::text[],
  map_id text not null default 'campus',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(name)) >= 2 and length(name) <= 24),
  check (jsonb_typeof(voxels) = 'array'),
  check (hp >= 0 and max_hp > 0 and mana >= 0 and max_mana > 0)
);

create index if not exists edgotchis_level_idx on public.edgotchis (level desc);

grant select, insert, update on public.edgotchis to authenticated;
grant all on public.edgotchis to service_role;

alter table public.edgotchis enable row level security;

drop policy if exists "edgotchi read own" on public.edgotchis;
create policy "edgotchi read own" on public.edgotchis
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "edgotchi insert own" on public.edgotchis;
create policy "edgotchi insert own" on public.edgotchis
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "edgotchi update own" on public.edgotchis;
create policy "edgotchi update own" on public.edgotchis
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Optional: students can peek at peers' public battle stats (name/level/voxels only) for sparring
-- Kept own-only for quota + privacy; NPC foes are used in battles instead.
