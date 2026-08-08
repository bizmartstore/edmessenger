-- EdMessenger — Escape Room powerups (bought with GCoins)
-- Run in Supabase SQL Editor after SUPABASE_MIGRATION_ESCAPE_ROOM.sql and
-- SUPABASE_MIGRATION_GCOINS_STORE.sql.

-- 1) Extra run stats on escape attempts
alter table public.activity_escape_attempts
  add column if not exists keys_used integer not null default 0;
alter table public.activity_escape_attempts
  add column if not exists bonus numeric not null default 0;
alter table public.activity_escape_attempts
  add column if not exists powerups_used jsonb not null default '{}'::jsonb;

-- 2) Powerup prices (server whitelist)
create table if not exists public.powerup_prices (
  item_id text primary key,
  price int not null check (price >= 0 and price <= 5000),
  updated_at timestamptz not null default now()
);
grant select on public.powerup_prices to authenticated;
grant all on public.powerup_prices to service_role;
alter table public.powerup_prices enable row level security;

drop policy if exists "powerup prices read" on public.powerup_prices;
create policy "powerup prices read" on public.powerup_prices
  for select to authenticated using (true);

drop policy if exists "powerup prices admin" on public.powerup_prices;
create policy "powerup prices admin" on public.powerup_prices
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

insert into public.powerup_prices (item_id, price) values
  ('pw_time_freeze', 30),
  ('pw_xray', 25),
  ('pw_reveal_letters', 20),
  ('pw_shield', 35),
  ('pw_skeleton_key', 60),
  ('pw_lucky_charm', 50)
on conflict (item_id) do nothing;

-- 3) Inventory
create table if not exists public.user_powerups (
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_id text not null,
  qty int not null default 0 check (qty >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id)
);
grant select, insert, update, delete on public.user_powerups to authenticated;
grant all on public.user_powerups to service_role;
alter table public.user_powerups enable row level security;

drop policy if exists "powerups read own" on public.user_powerups;
create policy "powerups read own" on public.user_powerups
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "powerups write own" on public.user_powerups;
create policy "powerups write own" on public.user_powerups
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 4) RPCs
create or replace function public._powerup_inventory(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(item_id, qty), '{}'::jsonb)
  from public.user_powerups
  where user_id = p_user;
$$;

create or replace function public.get_my_powerups()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if me is null then return '{}'::jsonb; end if;
  return public._powerup_inventory(me);
end;
$$;
grant execute on function public.get_my_powerups() to authenticated;

create or replace function public.buy_powerup(p_item_id text, p_qty int default 1)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  price int;
  qty int := greatest(1, least(coalesce(p_qty, 1), 10));
  cost int;
  bal int;
begin
  if me is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;

  select pp.price into price from public.powerup_prices pp where pp.item_id = p_item_id;
  if price is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_item');
  end if;
  cost := price * qty;

  select gcoins into bal from public.profiles where id = me for update;
  if bal is null or bal < cost then
    return jsonb_build_object('ok', false, 'reason', 'insufficient', 'balance', coalesce(bal, 0), 'price', cost);
  end if;

  update public.profiles set gcoins = gcoins - cost where id = me returning gcoins into bal;

  insert into public.user_powerups (user_id, item_id, qty)
  values (me, p_item_id, qty)
  on conflict (user_id, item_id)
  do update set qty = public.user_powerups.qty + excluded.qty, updated_at = now();

  return jsonb_build_object('ok', true, 'reason', 'purchased', 'balance', bal,
    'inventory', public._powerup_inventory(me));
end;
$$;
grant execute on function public.buy_powerup(text, int) to authenticated;

create or replace function public.consume_powerup(p_item_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  have int;
begin
  if me is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;

  select qty into have from public.user_powerups
  where user_id = me and item_id = p_item_id for update;

  if coalesce(have, 0) <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'none_left',
      'inventory', public._powerup_inventory(me));
  end if;

  update public.user_powerups
  set qty = qty - 1, updated_at = now()
  where user_id = me and item_id = p_item_id;

  return jsonb_build_object('ok', true, 'inventory', public._powerup_inventory(me));
end;
$$;
grant execute on function public.consume_powerup(text) to authenticated;
