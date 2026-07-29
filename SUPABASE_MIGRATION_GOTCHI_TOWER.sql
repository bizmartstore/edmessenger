-- EdMessenger — Gotchi Tower (quiz-based multiplayer educational RPG)
-- Run in Supabase SQL Editor after subjects, edgotchis, and gcoins migrations.

-- ── Events (teacher/admin creates tower climbs) ─────────────────────────────
create table if not exists public.gotchi_tower_events (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  difficulty text not null default 'mixed'
    check (difficulty in ('easy', 'medium', 'hard', 'mixed')),
  floor_count int not null default 20 check (floor_count >= 5 and floor_count <= 100),
  player_limit int not null default 30 check (player_limit >= 2 and player_limit <= 100),
  gcoin_reward int not null default 25 check (gcoin_reward >= 0 and gcoin_reward <= 500),
  pvp_enabled boolean not null default true,
  pvp_wager_min int not null default 0 check (pvp_wager_min >= 0),
  pvp_wager_max int not null default 50 check (pvp_wager_max >= 0),
  status text not null default 'draft'
    check (status in ('draft', 'lobby', 'live', 'ended')),
  theme text not null default 'academy',
  published_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(title)) >= 2 and length(title) <= 80),
  check (length(trim(code)) >= 4 and length(code) <= 12),
  check (pvp_wager_max >= pvp_wager_min)
);

create index if not exists gotchi_tower_events_subject_idx
  on public.gotchi_tower_events (subject_id, status);
create index if not exists gotchi_tower_events_code_idx
  on public.gotchi_tower_events (code);
create index if not exists gotchi_tower_events_creator_idx
  on public.gotchi_tower_events (created_by);

-- ── Quiz questions for an event ─────────────────────────────────────────────
create table if not exists public.gotchi_tower_questions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.gotchi_tower_events(id) on delete cascade,
  question text not null,
  options jsonb not null,
  correct_index int not null check (correct_index >= 0 and correct_index <= 5),
  explanation text not null default '',
  hint text not null default '',
  difficulty text not null default 'medium'
    check (difficulty in ('easy', 'medium', 'hard')),
  category text not null default 'general',
  competency text not null default '',
  estimated_seconds int not null default 30 check (estimated_seconds >= 5 and estimated_seconds <= 300),
  floor_min int not null default 1,
  floor_max int not null default 100,
  approved boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(options) = 'array'),
  check (length(trim(question)) >= 3)
);

create index if not exists gotchi_tower_questions_event_idx
  on public.gotchi_tower_questions (event_id, approved, sort_order);

-- ── Player progress in an event ─────────────────────────────────────────────
create table if not exists public.gotchi_tower_players (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.gotchi_tower_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  display_name text not null,
  gotchi_name text not null default 'Gotchi',
  voxels jsonb not null default '[]'::jsonb,
  floor int not null default 1 check (floor >= 1),
  xp int not null default 0 check (xp >= 0),
  level int not null default 1 check (level >= 1 and level <= 99),
  knowledge int not null default 10,
  resolve int not null default 10,
  agility int not null default 10,
  insight int not null default 10,
  spirit int not null default 10,
  harmony int not null default 10,
  hp int not null default 100,
  max_hp int not null default 100,
  energy int not null default 50,
  max_energy int not null default 50,
  gcoins_earned int not null default 0,
  correct_answers int not null default 0,
  wrong_answers int not null default 0,
  battles_won int not null default 0,
  battles_lost int not null default 0,
  inventory jsonb not null default '[]'::jsonb,
  companions jsonb not null default '[]'::jsonb,
  equipment jsonb not null default '{}'::jsonb,
  titles text[] not null default array[]::text[],
  online boolean not null default false,
  pos_x real not null default 400,
  pos_y real not null default 300,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id),
  check (jsonb_typeof(voxels) = 'array'),
  check (jsonb_typeof(inventory) = 'array'),
  check (jsonb_typeof(companions) = 'array')
);

create index if not exists gotchi_tower_players_event_idx
  on public.gotchi_tower_players (event_id, floor desc);
create index if not exists gotchi_tower_players_user_idx
  on public.gotchi_tower_players (user_id);

-- ── Companion catalog (static seed; players own instances in jsonb) ─────────
create table if not exists public.gotchi_tower_companion_defs (
  id text primary key,
  name text not null,
  rarity text not null check (rarity in ('common', 'uncommon', 'rare', 'epic', 'legendary')),
  element text not null
    check (element in ('arcane', 'nature', 'flame', 'tide', 'storm', 'crystal', 'spirit')),
  passive text not null,
  active_skill text not null,
  base_knowledge int not null default 5,
  base_resolve int not null default 5,
  base_agility int not null default 5,
  base_insight int not null default 5,
  base_spirit int not null default 5,
  base_harmony int not null default 5,
  description text not null default ''
);

insert into public.gotchi_tower_companion_defs
  (id, name, rarity, element, passive, active_skill, base_knowledge, base_resolve, base_agility, base_insight, base_spirit, base_harmony, description)
values
  ('sparkling', 'Sparkling', 'common', 'arcane', 'quiz_boost', 'arcane_bolt', 8, 4, 6, 5, 7, 4, 'A curious mote that brightens quiz focus.'),
  ('leafkin', 'Leafkin', 'common', 'nature', 'regen_tick', 'vine_lash', 4, 7, 5, 4, 4, 8, 'Gentle healer of the crystal gardens.'),
  ('emberpup', 'Emberpup', 'uncommon', 'flame', 'crit_warmth', 'flame_burst', 6, 5, 8, 7, 6, 3, 'Playful flame that sparks critical insight.'),
  ('tideling', 'Tideling', 'uncommon', 'tide', 'shield_wave', 'tidal_guard', 5, 9, 4, 5, 5, 7, 'Wards the team with flowing barriers.'),
  ('stormlet', 'Stormlet', 'rare', 'storm', 'turn_haste', 'thunder_quiz', 7, 4, 10, 8, 6, 4, 'Accelerates turn order with crackling energy.'),
  ('crystalowl', 'Crystal Owl', 'rare', 'crystal', 'hint_echo', 'prism_focus', 10, 5, 5, 10, 7, 6, 'Whispers hints when Insight is high.'),
  ('spiritecho', 'Spirit Echo', 'epic', 'spirit', 'energy_surge', 'harmony_pulse', 8, 6, 6, 8, 12, 10, 'Restores energy and boosts support skills.'),
  ('archivon', 'Archivon', 'legendary', 'arcane', 'master_scholar', 'tome_nova', 14, 8, 7, 12, 10, 9, 'Ancient academy guardian of knowledge.')
on conflict (id) do nothing;

-- ── Grants & RLS ────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.gotchi_tower_events to authenticated;
grant select, insert, update, delete on public.gotchi_tower_questions to authenticated;
grant select, insert, update, delete on public.gotchi_tower_players to authenticated;
grant select on public.gotchi_tower_companion_defs to authenticated;
grant all on public.gotchi_tower_events to service_role;
grant all on public.gotchi_tower_questions to service_role;
grant all on public.gotchi_tower_players to service_role;
grant all on public.gotchi_tower_companion_defs to service_role;

alter table public.gotchi_tower_events enable row level security;
alter table public.gotchi_tower_questions enable row level security;
alter table public.gotchi_tower_players enable row level security;
alter table public.gotchi_tower_companion_defs enable row level security;

-- Note: gotchi_tower_avatars grants/RLS are created with the table below (after player policies).

-- Helpers: is admin?
create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

-- Events: admins full access; students read published for their subject
drop policy if exists "gt_events_admin_all" on public.gotchi_tower_events;
create policy "gt_events_admin_all" on public.gotchi_tower_events
  for all to authenticated
  using (public.is_admin_user())
  with check (public.is_admin_user());

drop policy if exists "gt_events_student_read" on public.gotchi_tower_events;
create policy "gt_events_student_read" on public.gotchi_tower_events
  for select to authenticated
  using (
    status in ('lobby', 'live')
    and subject_id = (select selected_subject_id from public.profiles where id = auth.uid())
  );

-- Questions: admins manage; students read approved for joined/live events
drop policy if exists "gt_questions_admin_all" on public.gotchi_tower_questions;
create policy "gt_questions_admin_all" on public.gotchi_tower_questions
  for all to authenticated
  using (public.is_admin_user())
  with check (public.is_admin_user());

drop policy if exists "gt_questions_student_read" on public.gotchi_tower_questions;
create policy "gt_questions_student_read" on public.gotchi_tower_questions
  for select to authenticated
  using (
    approved = true
    and exists (
      select 1 from public.gotchi_tower_events e
      where e.id = event_id
        and e.status in ('lobby', 'live')
        and e.subject_id = (select selected_subject_id from public.profiles where id = auth.uid())
    )
  );

-- Separate Tower Gotchi avatars (NOT EdGotchi / edgotchis)
create table if not exists public.gotchi_tower_avatars (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  name text not null,
  voxels jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(name)) >= 2 and length(name) <= 24),
  check (jsonb_typeof(voxels) = 'array')
);

grant select, insert, update on public.gotchi_tower_avatars to authenticated;
grant all on public.gotchi_tower_avatars to service_role;
alter table public.gotchi_tower_avatars enable row level security;

drop policy if exists "gt_avatar_read_own" on public.gotchi_tower_avatars;
create policy "gt_avatar_read_own" on public.gotchi_tower_avatars
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "gt_avatar_insert_own" on public.gotchi_tower_avatars;
create policy "gt_avatar_insert_own" on public.gotchi_tower_avatars
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "gt_avatar_update_own" on public.gotchi_tower_avatars;
create policy "gt_avatar_update_own" on public.gotchi_tower_avatars
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Players: non-recursive read (via events/subject — NOT self-join on players)
drop policy if exists "gt_players_read" on public.gotchi_tower_players;
create policy "gt_players_read" on public.gotchi_tower_players
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin_user()
    or exists (
      select 1
      from public.gotchi_tower_events e
      where e.id = gotchi_tower_players.event_id
        and e.status in ('lobby', 'live', 'ended')
        and (
          e.created_by = auth.uid()
          or e.subject_id = (
            select selected_subject_id from public.profiles where id = auth.uid()
          )
        )
    )
  );

drop policy if exists "gt_players_insert_own" on public.gotchi_tower_players;
create policy "gt_players_insert_own" on public.gotchi_tower_players
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "gt_players_update_own" on public.gotchi_tower_players;
create policy "gt_players_update_own" on public.gotchi_tower_players
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin_user())
  with check (user_id = auth.uid() or public.is_admin_user());

drop policy if exists "gt_companions_read" on public.gotchi_tower_companion_defs;
create policy "gt_companions_read" on public.gotchi_tower_companion_defs
  for select to authenticated
  using (true);

-- Join by code: uses Tower avatar (never EdGotchi)
drop function if exists public.join_gotchi_tower(text);
drop function if exists public.join_gotchi_tower(text, text, jsonb);

create or replace function public.join_gotchi_tower(
  p_code text,
  p_gotchi_name text default null,
  p_voxels jsonb default null
)
returns public.gotchi_tower_players
language plpgsql
security definer
set search_path = public
as $$
declare
  ev public.gotchi_tower_events;
  existing public.gotchi_tower_players;
  prof public.profiles;
  av public.gotchi_tower_avatars;
  player_count int;
  new_row public.gotchi_tower_players;
  v_name text;
  v_voxels jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select * into ev from public.gotchi_tower_events
  where upper(code) = upper(trim(p_code))
  limit 1;

  if not found then
    raise exception 'Invalid game code';
  end if;

  if ev.status not in ('lobby', 'live') then
    raise exception 'This tower is not open for joining (status: %)', ev.status;
  end if;

  select * into prof from public.profiles where id = auth.uid();
  if prof.selected_subject_id is distinct from ev.subject_id then
    raise exception 'Your selected subject does not match this tower event. Change subject in My Account.';
  end if;

  select * into av from public.gotchi_tower_avatars where user_id = auth.uid();

  v_name := nullif(trim(coalesce(p_gotchi_name, av.name, '')), '');
  if v_name is null then
    raise exception 'Create your Gotchi Tower avatar first';
  end if;

  if p_voxels is not null and jsonb_typeof(p_voxels) = 'array' and jsonb_array_length(p_voxels) > 0 then
    v_voxels := p_voxels;
  elsif av.voxels is not null and jsonb_typeof(av.voxels) = 'array' and jsonb_array_length(av.voxels) > 0 then
    v_voxels := av.voxels;
  else
    raise exception 'Create your Gotchi Tower avatar first';
  end if;

  if p_gotchi_name is not null or p_voxels is not null then
    insert into public.gotchi_tower_avatars (user_id, name, voxels, updated_at)
    values (auth.uid(), v_name, v_voxels, now())
    on conflict (user_id) do update
      set name = excluded.name,
          voxels = excluded.voxels,
          updated_at = now();
  end if;

  select * into existing from public.gotchi_tower_players
  where event_id = ev.id and user_id = auth.uid();

  if found then
    update public.gotchi_tower_players
      set online = true,
          gotchi_name = v_name,
          voxels = v_voxels,
          display_name = coalesce(nullif(trim(prof.full_name), ''), existing.display_name, 'Scholar'),
          updated_at = now()
      where id = existing.id
      returning * into new_row;
    return new_row;
  end if;

  select count(*) into player_count from public.gotchi_tower_players where event_id = ev.id;
  if player_count >= ev.player_limit then
    raise exception 'Tower is full';
  end if;

  insert into public.gotchi_tower_players (
    event_id, user_id, display_name, gotchi_name, voxels, companions
  ) values (
    ev.id,
    auth.uid(),
    coalesce(nullif(trim(prof.full_name), ''), 'Scholar'),
    v_name,
    v_voxels,
    '[{"def_id":"sparkling","level":1,"xp":0},{"def_id":"leafkin","level":1,"xp":0}]'::jsonb
  )
  returning * into new_row;

  return new_row;
exception
  when unique_violation then
    select * into new_row from public.gotchi_tower_players
    where event_id = ev.id and user_id = auth.uid();
    if found then
      return new_row;
    end if;
    raise;
end;
$$;

grant execute on function public.join_gotchi_tower(text, text, jsonb) to authenticated;

create or replace function public.join_gotchi_tower(p_code text)
returns public.gotchi_tower_players
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.join_gotchi_tower(p_code, null, null);
end;
$$;

grant execute on function public.join_gotchi_tower(text) to authenticated;

-- Peer list without recursive RLS (security definer)
create or replace function public.list_gotchi_tower_players(p_event_id uuid)
returns setof public.gotchi_tower_players
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  if not (
    public.is_admin_user()
    or exists (
      select 1 from public.gotchi_tower_players p
      where p.event_id = p_event_id and p.user_id = auth.uid()
    )
    or exists (
      select 1 from public.gotchi_tower_events e
      where e.id = p_event_id
        and (
          e.created_by = auth.uid()
          or e.subject_id = (
            select selected_subject_id from public.profiles where id = auth.uid()
          )
        )
    )
  ) then
    raise exception 'Not allowed to view players for this tower';
  end if;

  return query
    select *
    from public.gotchi_tower_players
    where event_id = p_event_id
    order by floor desc, joined_at asc;
end;
$$;

grant execute on function public.list_gotchi_tower_players(uuid) to authenticated;

-- Admin live analytics helper
create or replace function public.gotchi_tower_event_stats(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_admin_user() then
    raise exception 'Admin only';
  end if;

  select jsonb_build_object(
    'players', count(*),
    'online', count(*) filter (where online),
    'avg_floor', coalesce(round(avg(floor)::numeric, 1), 0),
    'max_floor', coalesce(max(floor), 0),
    'total_correct', coalesce(sum(correct_answers), 0),
    'total_wrong', coalesce(sum(wrong_answers), 0),
    'gcoins_earned', coalesce(sum(gcoins_earned), 0),
    'accuracy', case
      when coalesce(sum(correct_answers + wrong_answers), 0) = 0 then 0
      else round(100.0 * sum(correct_answers) / nullif(sum(correct_answers + wrong_answers), 0), 1)
    end
  )
  into result
  from public.gotchi_tower_players
  where event_id = p_event_id;

  return coalesce(result, '{}'::jsonb);
end;
$$;

grant execute on function public.gotchi_tower_event_stats(uuid) to authenticated;
