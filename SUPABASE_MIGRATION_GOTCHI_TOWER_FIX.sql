-- Gotchi Tower FIX (run in Supabase SQL Editor if you already applied the old migration)
-- Fixes: separate Tower avatars (not EdGotchi), recursive RLS 500s, join RPC signature, peer list

-- ── Separate Tower Gotchi (NOT EdGotchi) ────────────────────────────────────
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

-- ── Fix recursive RLS on players (caused HTTP 500 on peer list) ─────────────
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

-- ── Join RPC: uses Tower avatar (not EdGotchi); accepts optional overrides ──
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

  -- Prefer explicit args, then saved Tower avatar (never EdGotchi)
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

  -- Upsert avatar if client sent a fresh design
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
    -- Race: another request inserted first — return that row
    select * into new_row from public.gotchi_tower_players
    where event_id = ev.id and user_id = auth.uid();
    if found then
      return new_row;
    end if;
    raise;
end;
$$;

grant execute on function public.join_gotchi_tower(text, text, jsonb) to authenticated;

-- Convenience overload: code-only (uses saved Tower avatar)
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

-- Peer list RPC (avoids RLS recursion / PostgREST 500)
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
