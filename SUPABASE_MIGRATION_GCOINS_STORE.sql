-- GCoins wallet, daily caps, store inventory, chat cosmetics, reaction viewers.
-- Safe to re-run. Prefer RPCs over per-row REST to avoid quota burn.

-- ─── Wallet on profiles ─────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists gcoins int not null default 0 check (gcoins >= 0);

-- ─── Daily earnings ledger ──────────────────────────────────────────────────
create table if not exists public.gcoin_daily (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null default (timezone('utc', now())::date),
  earned int not null default 0 check (earned >= 0),
  by_action jsonb not null default '{}'::jsonb,
  primary key (user_id, day)
);
grant select on public.gcoin_daily to authenticated;
grant all on public.gcoin_daily to service_role;
alter table public.gcoin_daily enable row level security;

drop policy if exists "gcoin daily read own" on public.gcoin_daily;
create policy "gcoin daily read own" on public.gcoin_daily
  for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- One-shot claim keys (lesson view once / day, etc.)
create table if not exists public.gcoin_claims (
  user_id uuid not null references public.profiles(id) on delete cascade,
  claim_key text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, claim_key)
);
grant all on public.gcoin_claims to service_role;
alter table public.gcoin_claims enable row level security;

-- ─── Reward config (admin-optional overrides) ───────────────────────────────
create table if not exists public.gcoin_reward_config (
  action_key text primary key,
  amount int not null check (amount >= 0 and amount <= 500),
  daily_action_cap int not null default 10 check (daily_action_cap >= 0 and daily_action_cap <= 100),
  updated_at timestamptz not null default now()
);
grant select on public.gcoin_reward_config to authenticated;
grant all on public.gcoin_reward_config to service_role;
alter table public.gcoin_reward_config enable row level security;

drop policy if exists "gcoin rewards read" on public.gcoin_reward_config;
create policy "gcoin rewards read" on public.gcoin_reward_config
  for select to authenticated using (true);

drop policy if exists "gcoin rewards admin" on public.gcoin_reward_config;
create policy "gcoin rewards admin" on public.gcoin_reward_config
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

insert into public.gcoin_reward_config (action_key, amount, daily_action_cap) values
  ('daily_max', 50, 50),
  ('classroom_message', 1, 5),
  ('dm_message', 1, 5),
  ('group_message', 1, 5),
  ('wall_post', 2, 3),
  ('feedback', 5, 3),
  ('complete_activity', 8, 5),
  ('complete_reviewer', 10, 5),
  ('view_lesson', 2, 8),
  ('download_lesson', 3, 5)
on conflict (action_key) do nothing;

-- ─── Cosmetics / inventory ──────────────────────────────────────────────────
create table if not exists public.user_cosmetics (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  owned_items text[] not null default '{}',
  active_bubble text not null default 'bubble_classic',
  bg_classroom text null,
  bg_dm text null,
  bg_group text null,
  bg_wall text null,
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.user_cosmetics to authenticated;
grant all on public.user_cosmetics to service_role;
alter table public.user_cosmetics enable row level security;

drop policy if exists "cosmetics read" on public.user_cosmetics;
create policy "cosmetics read" on public.user_cosmetics
  for select to authenticated using (true);

drop policy if exists "cosmetics write own" on public.user_cosmetics;
create policy "cosmetics write own" on public.user_cosmetics
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Store item prices (server whitelist; catalog UI is client-side)
create table if not exists public.store_item_prices (
  item_id text primary key,
  price int not null check (price >= 0 and price <= 5000),
  kind text not null check (kind in ('bubble', 'background', 'pack')),
  updated_at timestamptz not null default now()
);
grant select on public.store_item_prices to authenticated;
grant all on public.store_item_prices to service_role;
alter table public.store_item_prices enable row level security;

drop policy if exists "store prices read" on public.store_item_prices;
create policy "store prices read" on public.store_item_prices
  for select to authenticated using (true);

drop policy if exists "store prices admin" on public.store_item_prices;
create policy "store prices admin" on public.store_item_prices
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

insert into public.store_item_prices (item_id, price, kind) values
  ('bubble_classic', 0, 'bubble'),
  ('bubble_ocean', 25, 'bubble'),
  ('bubble_sunset', 25, 'bubble'),
  ('bubble_mint', 30, 'bubble'),
  ('bubble_lavender', 30, 'bubble'),
  ('bubble_candy', 40, 'bubble'),
  ('bubble_neon', 50, 'bubble'),
  ('bubble_ink', 45, 'bubble'),
  ('bubble_peach', 35, 'bubble'),
  ('bubble_aurora', 60, 'bubble'),
  ('bubble_glass', 55, 'bubble'),
  ('bubble_comic', 50, 'bubble'),
  ('bubble_forest', 35, 'bubble'),
  ('bubble_rose', 35, 'bubble'),
  ('bubble_midnight', 55, 'bubble'),
  ('bubble_honey', 30, 'bubble'),
  ('bubble_bubblegum', 40, 'bubble'),
  ('bg_dots', 20, 'background'),
  ('bg_grid', 20, 'background'),
  ('bg_waves', 30, 'background'),
  ('bg_stars', 35, 'background'),
  ('bg_leaves', 30, 'background'),
  ('bg_paper', 25, 'background'),
  ('bg_sunset_sky', 40, 'background'),
  ('bg_soft_mesh', 45, 'background'),
  ('bg_confetti', 35, 'background'),
  ('bg_chalkboard', 40, 'background'),
  ('bg_ocean_depth', 40, 'background'),
  ('bg_sakura', 45, 'background'),
  ('bg_custom_unlock', 80, 'pack')
on conflict (item_id) do nothing;

-- ─── Helpers ────────────────────────────────────────────────────────────────
create or replace function public._gcoin_cfg(p_key text, p_default_amount int, p_default_cap int)
returns table(amount int, daily_action_cap int)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select c.amount from public.gcoin_reward_config c where c.action_key = p_key),
    p_default_amount
  ),
  coalesce(
    (select c.daily_action_cap from public.gcoin_reward_config c where c.action_key = p_key),
    p_default_cap
  );
$$;

create or replace function public.ensure_user_cosmetics(p_user uuid default auth.uid())
returns public.user_cosmetics
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.user_cosmetics;
begin
  if p_user is null then
    raise exception 'Not authenticated';
  end if;
  insert into public.user_cosmetics (user_id, owned_items)
  values (p_user, array['bubble_classic'])
  on conflict (user_id) do nothing;
  select * into row from public.user_cosmetics where user_id = p_user;
  return row;
end;
$$;
grant execute on function public.ensure_user_cosmetics(uuid) to authenticated;

-- Award GCoins with daily total + per-action caps. Optional claim_key = once-only.
-- by_action stores { action: { n: times, c: coins } } for clear caps (times, not coins).
create or replace function public.award_gcoins(p_action text, p_claim_key text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  today date := (timezone('utc', now())::date);
  cfg_amount int;
  cfg_cap int;
  daily_max int;
  day_earned int := 0;
  action_times int := 0;
  action_coins int := 0;
  by_act jsonb := '{}'::jsonb;
  entry jsonb;
  award int := 0;
  bal int := 0;
  room int;
begin
  if me is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;
  if p_action is null or length(trim(p_action)) = 0 or p_action = 'daily_max' then
    return jsonb_build_object('ok', false, 'reason', 'bad_action');
  end if;

  select amount, daily_action_cap into cfg_amount, cfg_cap
  from public._gcoin_cfg(p_action, 0, 0);
  if cfg_amount is null or cfg_amount <= 0 then
    select gcoins into bal from public.profiles where id = me;
    return jsonb_build_object('ok', true, 'awarded', 0, 'balance', coalesce(bal, 0), 'reason', 'zero_reward');
  end if;

  select amount into daily_max from public._gcoin_cfg('daily_max', 50, 50);
  daily_max := coalesce(daily_max, 50);

  if p_claim_key is not null and length(trim(p_claim_key)) > 0 then
    begin
      insert into public.gcoin_claims (user_id, claim_key) values (me, p_claim_key);
    exception when unique_violation then
      select gcoins into bal from public.profiles where id = me;
      return jsonb_build_object('ok', true, 'awarded', 0, 'balance', coalesce(bal, 0), 'reason', 'already_claimed');
    end;
  end if;

  insert into public.gcoin_daily (user_id, day, earned, by_action)
  values (me, today, 0, '{}'::jsonb)
  on conflict (user_id, day) do nothing;

  select earned, by_action into day_earned, by_act
  from public.gcoin_daily
  where user_id = me and day = today
  for update;

  entry := by_act -> p_action;
  if entry is null then
    -- legacy: plain int meant coins awarded for that action
    if jsonb_typeof(by_act -> p_action) = 'number' then
      action_coins := coalesce((by_act ->> p_action)::int, 0);
      action_times := case when cfg_amount > 0 then least(cfg_cap, (action_coins / cfg_amount)) else 0 end;
    else
      action_times := 0;
      action_coins := 0;
    end if;
  elsif jsonb_typeof(entry) = 'number' then
    action_coins := coalesce((entry #>> '{}')::int, 0);
    action_times := case when cfg_amount > 0 then least(cfg_cap, (action_coins / greatest(cfg_amount, 1))) else 0 end;
  else
    action_times := coalesce((entry ->> 'n')::int, 0);
    action_coins := coalesce((entry ->> 'c')::int, 0);
  end if;

  if action_times >= coalesce(cfg_cap, 0) then
    select gcoins into bal from public.profiles where id = me;
    return jsonb_build_object('ok', true, 'awarded', 0, 'balance', coalesce(bal, 0), 'daily_earned', day_earned, 'daily_cap', daily_max, 'reason', 'action_cap');
  end if;

  room := greatest(0, daily_max - day_earned);
  award := least(cfg_amount, room);
  if award <= 0 then
    select gcoins into bal from public.profiles where id = me;
    return jsonb_build_object('ok', true, 'awarded', 0, 'balance', coalesce(bal, 0), 'daily_earned', day_earned, 'daily_cap', daily_max, 'reason', 'daily_cap');
  end if;

  update public.gcoin_daily
  set earned = earned + award,
      by_action = jsonb_set(
        by_act,
        array[p_action],
        jsonb_build_object('n', action_times + 1, 'c', action_coins + award),
        true
      )
  where user_id = me and day = today;

  update public.profiles
  set gcoins = gcoins + award
  where id = me
  returning gcoins into bal;

  return jsonb_build_object(
    'ok', true,
    'awarded', award,
    'balance', coalesce(bal, 0),
    'daily_earned', day_earned + award,
    'daily_cap', daily_max,
    'reason', 'awarded'
  );
end;
$$;
grant execute on function public.award_gcoins(text, text) to authenticated;

create or replace function public.get_my_gcoin_wallet()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  today date := (timezone('utc', now())::date);
  bal int := 0;
  day_earned int := 0;
  daily_max int := 50;
  cos public.user_cosmetics;
  rewards jsonb;
begin
  if me is null then
    return '{}'::jsonb;
  end if;
  select coalesce(gcoins, 0) into bal from public.profiles where id = me;
  select coalesce(earned, 0) into day_earned from public.gcoin_daily where user_id = me and day = today;
  select amount into daily_max from public._gcoin_cfg('daily_max', 50, 50);
  cos := public.ensure_user_cosmetics(me);
  select coalesce(jsonb_object_agg(action_key, jsonb_build_object('amount', amount, 'daily_action_cap', daily_action_cap)), '{}'::jsonb)
  into rewards
  from public.gcoin_reward_config;
  return jsonb_build_object(
    'gcoins', bal,
    'daily_earned', day_earned,
    'daily_cap', coalesce(daily_max, 50),
    'cosmetics', jsonb_build_object(
      'owned_items', to_jsonb(cos.owned_items),
      'active_bubble', cos.active_bubble,
      'bg_classroom', cos.bg_classroom,
      'bg_dm', cos.bg_dm,
      'bg_group', cos.bg_group,
      'bg_wall', cos.bg_wall
    ),
    'rewards', rewards
  );
end;
$$;
grant execute on function public.get_my_gcoin_wallet() to authenticated;

create or replace function public.purchase_store_item(p_item_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  price int;
  bal int;
  cos public.user_cosmetics;
begin
  if me is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;
  select sip.price into price from public.store_item_prices sip where sip.item_id = p_item_id;
  if price is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_item');
  end if;

  cos := public.ensure_user_cosmetics(me);
  if p_item_id = any (cos.owned_items) then
    select gcoins into bal from public.profiles where id = me;
    return jsonb_build_object('ok', true, 'reason', 'already_owned', 'balance', bal, 'cosmetics', cos);
  end if;

  select gcoins into bal from public.profiles where id = me for update;
  if bal < price then
    return jsonb_build_object('ok', false, 'reason', 'insufficient', 'balance', bal, 'price', price);
  end if;

  update public.profiles set gcoins = gcoins - price where id = me returning gcoins into bal;
  update public.user_cosmetics
  set owned_items = array_append(owned_items, p_item_id),
      updated_at = now()
  where user_id = me
  returning * into cos;

  return jsonb_build_object('ok', true, 'reason', 'purchased', 'balance', bal, 'price', price, 'item_id', p_item_id, 'cosmetics', jsonb_build_object(
    'owned_items', to_jsonb(cos.owned_items),
    'active_bubble', cos.active_bubble,
    'bg_classroom', cos.bg_classroom,
    'bg_dm', cos.bg_dm,
    'bg_group', cos.bg_group,
    'bg_wall', cos.bg_wall
  ));
end;
$$;
grant execute on function public.purchase_store_item(text) to authenticated;

create or replace function public.set_active_bubble(p_item_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  cos public.user_cosmetics;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  cos := public.ensure_user_cosmetics(me);
  if not (p_item_id = any (cos.owned_items)) then
    return jsonb_build_object('ok', false, 'reason', 'not_owned');
  end if;
  update public.user_cosmetics
  set active_bubble = p_item_id, updated_at = now()
  where user_id = me
  returning * into cos;
  return jsonb_build_object('ok', true, 'active_bubble', cos.active_bubble);
end;
$$;
grant execute on function public.set_active_bubble(text) to authenticated;

create or replace function public.set_chat_background(p_surface text, p_value text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  cos public.user_cosmetics;
  is_custom boolean;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if p_surface not in ('classroom', 'dm', 'group', 'wall') then
    return jsonb_build_object('ok', false, 'reason', 'bad_surface');
  end if;
  cos := public.ensure_user_cosmetics(me);
  is_custom := p_value is not null and (p_value like 'http://%' or p_value like 'https://%');
  if is_custom and not ('bg_custom_unlock' = any (cos.owned_items)) then
    return jsonb_build_object('ok', false, 'reason', 'need_custom_unlock');
  end if;
  if p_value is not null and not is_custom and not (p_value = any (cos.owned_items)) then
    return jsonb_build_object('ok', false, 'reason', 'not_owned');
  end if;

  if p_surface = 'classroom' then
    update public.user_cosmetics set bg_classroom = p_value, updated_at = now() where user_id = me returning * into cos;
  elsif p_surface = 'dm' then
    update public.user_cosmetics set bg_dm = p_value, updated_at = now() where user_id = me returning * into cos;
  elsif p_surface = 'group' then
    update public.user_cosmetics set bg_group = p_value, updated_at = now() where user_id = me returning * into cos;
  else
    update public.user_cosmetics set bg_wall = p_value, updated_at = now() where user_id = me returning * into cos;
  end if;

  return jsonb_build_object('ok', true, 'surface', p_surface, 'value', p_value);
end;
$$;
grant execute on function public.set_chat_background(text, text) to authenticated;

create or replace function public.admin_upsert_gcoin_reward(p_key text, p_amount int, p_cap int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Admin only';
  end if;
  insert into public.gcoin_reward_config (action_key, amount, daily_action_cap, updated_at)
  values (p_key, greatest(0, least(500, p_amount)), greatest(0, least(100, p_cap)), now())
  on conflict (action_key) do update
  set amount = excluded.amount,
      daily_action_cap = excluded.daily_action_cap,
      updated_at = now();
end;
$$;
grant execute on function public.admin_upsert_gcoin_reward(text, int, int) to authenticated;

-- ─── Reaction viewers (lazy; one RPC on tap) ────────────────────────────────
create or replace function public.list_wall_reactors(p_post uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', r.user_id,
      'emoji', r.emoji,
      'full_name', p.full_name,
      'avatar_url', p.avatar_url,
      'created_at', r.created_at
    ) order by r.created_at)
    from public.wall_reactions r
    join public.profiles p on p.id = r.user_id
    where r.post_id = p_post
  ), '[]'::jsonb);
end;
$$;
grant execute on function public.list_wall_reactors(uuid) to authenticated;

create or replace function public.list_classroom_msg_reactors(p_msg uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', r.user_id,
      'emoji', r.emoji,
      'full_name', p.full_name,
      'avatar_url', p.avatar_url,
      'created_at', r.created_at
    ) order by r.created_at)
    from public.classroom_msg_reactions r
    join public.profiles p on p.id = r.user_id
    where r.message_id = p_msg
  ), '[]'::jsonb);
end;
$$;
grant execute on function public.list_classroom_msg_reactors(uuid) to authenticated;

create or replace function public.list_group_msg_reactors(p_msg uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', r.user_id,
      'emoji', r.emoji,
      'full_name', p.full_name,
      'avatar_url', p.avatar_url,
      'created_at', r.created_at
    ) order by r.created_at)
    from public.group_msg_reactions r
    join public.profiles p on p.id = r.user_id
    where r.message_id = p_msg
  ), '[]'::jsonb);
end;
$$;
grant execute on function public.list_group_msg_reactors(uuid) to authenticated;
