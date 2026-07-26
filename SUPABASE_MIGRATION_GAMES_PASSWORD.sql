-- EdMessenger — optional password lock for Games / Edgotchi
-- Run after SUPABASE_MIGRATION_EDGOTCHI.sql
-- Quota-safe: single settings row + tiny RPCs (no polling).

create table if not exists public.game_settings (
  id int primary key default 1 check (id = 1),
  -- null password_hash = games are open (no password)
  password_hash text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

insert into public.game_settings (id, password_hash)
values (1, null)
on conflict (id) do nothing;

grant select on public.game_settings to service_role;
grant all on public.game_settings to service_role;
alter table public.game_settings enable row level security;
-- No direct client policies — only security definer RPCs touch this table.

-- Students/admins: is a password currently required?
create or replace function public.games_password_required()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  h text;
begin
  if auth.uid() is null then return true; end if;
  select password_hash into h from public.game_settings where id = 1;
  return h is not null and length(h) > 0;
end;
$$;
grant execute on function public.games_password_required() to authenticated;

-- Unlock games with password (true = ok). Open games always succeed.
create or replace function public.unlock_games(p_password text default null)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  h text;
begin
  if auth.uid() is null then return false; end if;
  select password_hash into h from public.game_settings where id = 1;
  if h is null or length(h) = 0 then
    return true;
  end if;
  if p_password is null or length(trim(p_password)) = 0 then
    return false;
  end if;
  return crypt(trim(p_password), h) = h;
end;
$$;
grant execute on function public.unlock_games(text) to authenticated;

-- Admin only: set password (non-empty) or clear when null/blank
create or replace function public.set_games_password(p_password text default null)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  me uuid := auth.uid();
  hash text := null;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if not public.has_role(me, 'admin') then
    raise exception 'Admin only';
  end if;

  if p_password is not null and length(trim(p_password)) > 0 then
    if length(trim(p_password)) < 3 then
      raise exception 'Password must be at least 3 characters';
    end if;
    if length(trim(p_password)) > 64 then
      raise exception 'Password too long';
    end if;
    hash := crypt(trim(p_password), gen_salt('bf'));
  end if;

  insert into public.game_settings (id, password_hash, updated_at, updated_by)
  values (1, hash, now(), me)
  on conflict (id) do update set
    password_hash = excluded.password_hash,
    updated_at = now(),
    updated_by = me;

  return hash is not null;
end;
$$;
grant execute on function public.set_games_password(text) to authenticated;
