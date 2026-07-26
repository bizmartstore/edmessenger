-- EdMessenger — classroom soft-delete, wall social (likes/reactions/comments), group tools
-- Run after SUPABASE_MIGRATION_WALL_GROUPS.sql
-- Zero heavy storage: text/emoji only. Presence stays on Realtime (no DB heartbeats).

-- ═══════════════════════════════════════════
-- 1) Classroom soft-delete
-- ═══════════════════════════════════════════
alter table public.messages
  add column if not exists deleted_at timestamptz;

grant update on public.messages to authenticated;

drop policy if exists "update soft delete own message" on public.messages;
create policy "update soft delete own message" on public.messages
  for update to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  with check (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create or replace function public.soft_delete_classroom_message(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  owner uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  select user_id into owner from public.messages where id = p_id;
  if owner is null then raise exception 'Message not found'; end if;
  if owner <> me and not public.has_role(me, 'admin') then
    raise exception 'Not allowed';
  end if;
  update public.messages
  set
    deleted_at = now(),
    content = '',
    attachments = null,
    reply_to_content = null
  where id = p_id;
end;
$$;
grant execute on function public.soft_delete_classroom_message(uuid) to authenticated;

-- ═══════════════════════════════════════════
-- 2) Wall: feeling + reactions + comments
-- ═══════════════════════════════════════════
alter table public.wall_posts
  add column if not exists feeling text;

create table if not exists public.wall_reactions (
  post_id uuid not null references public.wall_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null default '❤️',
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists wall_reactions_post_idx on public.wall_reactions (post_id);
grant select, insert, update, delete on public.wall_reactions to authenticated;
grant all on public.wall_reactions to service_role;
alter table public.wall_reactions enable row level security;

drop policy if exists "wall react read" on public.wall_reactions;
create policy "wall react read" on public.wall_reactions
  for select to authenticated using (true);

drop policy if exists "wall react write" on public.wall_reactions;
create policy "wall react write" on public.wall_reactions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists public.wall_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.wall_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists wall_comments_post_idx on public.wall_comments (post_id, created_at);
grant select, insert, delete on public.wall_comments to authenticated;
grant all on public.wall_comments to service_role;
alter table public.wall_comments enable row level security;

drop policy if exists "wall comments read" on public.wall_comments;
create policy "wall comments read" on public.wall_comments
  for select to authenticated using (true);

drop policy if exists "wall comments insert" on public.wall_comments;
create policy "wall comments insert" on public.wall_comments
  for insert to authenticated with check (user_id = auth.uid() and length(trim(content)) > 0 and length(content) <= 500);

drop policy if exists "wall comments delete" on public.wall_comments;
create policy "wall comments delete" on public.wall_comments
  for delete to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- Cap comments per post (keep newest 40)
create or replace function public.prune_wall_comments(p_post uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.wall_comments
  where post_id = p_post
    and id not in (
      select id from public.wall_comments
      where post_id = p_post
      order by created_at desc
      limit 40
    );
end;
$$;
grant execute on function public.prune_wall_comments(uuid) to authenticated;

-- Aggregated social bundle for a set of posts (1 round-trip)
create or replace function public.get_wall_social(p_post_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  result jsonb := '{}'::jsonb;
  pid uuid;
  react_counts jsonb;
  my_emoji text;
  comments jsonb;
begin
  if me is null or p_post_ids is null then
    return '{}'::jsonb;
  end if;

  foreach pid in array p_post_ids loop
    select coalesce(jsonb_object_agg(emoji, cnt), '{}'::jsonb)
    into react_counts
    from (
      select emoji, count(*)::int as cnt
      from public.wall_reactions
      where post_id = pid
      group by emoji
    ) t;

    select emoji into my_emoji
    from public.wall_reactions
    where post_id = pid and user_id = me;

    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'user_id', c.user_id,
        'content', c.content,
        'created_at', c.created_at,
        'full_name', pr.full_name,
        'avatar_url', pr.avatar_url
      ) order by c.created_at asc
    ), '[]'::jsonb)
    into comments
    from (
      select * from public.wall_comments
      where post_id = pid
      order by created_at desc
      limit 40
    ) c
    left join public.profiles pr on pr.id = c.user_id;

    result := result || jsonb_build_object(
      pid::text,
      jsonb_build_object(
        'reactions', react_counts,
        'my_emoji', my_emoji,
        'comments', comments
      )
    );
  end loop;

  return result;
end;
$$;
grant execute on function public.get_wall_social(uuid[]) to authenticated;

create or replace function public.toggle_wall_reaction(p_post uuid, p_emoji text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  existing text;
  allowed text[] := array['❤️','👍','😂','😮','😢','🔥','🎉','👏'];
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if p_emoji is null or not (p_emoji = any(allowed)) then
    raise exception 'Invalid reaction';
  end if;

  select emoji into existing from public.wall_reactions
  where post_id = p_post and user_id = me;

  if existing is not null and existing = p_emoji then
    delete from public.wall_reactions where post_id = p_post and user_id = me;
    return jsonb_build_object('my_emoji', null);
  end if;

  insert into public.wall_reactions (post_id, user_id, emoji)
  values (p_post, me, p_emoji)
  on conflict (post_id, user_id) do update set emoji = excluded.emoji, created_at = now();

  return jsonb_build_object('my_emoji', p_emoji);
end;
$$;
grant execute on function public.toggle_wall_reaction(uuid, text) to authenticated;

-- ═══════════════════════════════════════════
-- 3) Group tools: soft-delete, reactions, polls, pin
-- ═══════════════════════════════════════════
alter table public.group_messages
  add column if not exists deleted_at timestamptz,
  add column if not exists msg_type text not null default 'text';
  -- text | poll | system
  add column if not exists meta jsonb;

grant update on public.group_messages to authenticated;

drop policy if exists "group msgs update" on public.group_messages;
create policy "group msgs update" on public.group_messages
  for update to authenticated
  using (
    user_id = auth.uid()
    or public.has_role(auth.uid(), 'admin')
    or exists (
      select 1 from public.chat_group_members m
      where m.group_id = group_messages.group_id and m.user_id = auth.uid()
    )
  )
  with check (true);

create or replace function public.soft_delete_group_message(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  owner uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  select user_id into owner from public.group_messages where id = p_id;
  if owner is null then raise exception 'Message not found'; end if;
  if owner <> me and not public.has_role(me, 'admin') then
    raise exception 'Not allowed';
  end if;
  update public.group_messages
  set deleted_at = now(), content = '', attachments = null, meta = null
  where id = p_id;
end;
$$;
grant execute on function public.soft_delete_group_message(uuid) to authenticated;

create table if not exists public.group_msg_reactions (
  message_id uuid not null references public.group_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null default '👍',
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
grant select, insert, update, delete on public.group_msg_reactions to authenticated;
grant all on public.group_msg_reactions to service_role;
alter table public.group_msg_reactions enable row level security;

drop policy if exists "gmsg react read" on public.group_msg_reactions;
create policy "gmsg react read" on public.group_msg_reactions
  for select to authenticated using (true);

drop policy if exists "gmsg react write" on public.group_msg_reactions;
create policy "gmsg react write" on public.group_msg_reactions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.toggle_group_msg_reaction(p_msg uuid, p_emoji text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  existing text;
  allowed text[] := array['👍','❤️','😂','🎉','🔥','👀'];
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if not (p_emoji = any(allowed)) then raise exception 'Invalid reaction'; end if;
  select emoji into existing from public.group_msg_reactions
  where message_id = p_msg and user_id = me;
  if existing is not null and existing = p_emoji then
    delete from public.group_msg_reactions where message_id = p_msg and user_id = me;
    return;
  end if;
  insert into public.group_msg_reactions (message_id, user_id, emoji)
  values (p_msg, me, p_emoji)
  on conflict (message_id, user_id) do update set emoji = excluded.emoji;
end;
$$;
grant execute on function public.toggle_group_msg_reaction(uuid, text) to authenticated;

-- Tiny text polls (no files)
create table if not exists public.group_polls (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.chat_groups(id) on delete cascade,
  message_id uuid references public.group_messages(id) on delete cascade,
  question text not null,
  options text[] not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (cardinality(options) between 2 and 4),
  check (length(question) <= 200)
);
grant select, insert on public.group_polls to authenticated;
grant all on public.group_polls to service_role;
alter table public.group_polls enable row level security;

drop policy if exists "polls read" on public.group_polls;
create policy "polls read" on public.group_polls
  for select to authenticated
  using (
    exists (
      select 1 from public.chat_group_members m
      where m.group_id = group_polls.group_id and m.user_id = auth.uid()
    )
  );

drop policy if exists "polls insert" on public.group_polls;
create policy "polls insert" on public.group_polls
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.chat_group_members m
      where m.group_id = group_polls.group_id and m.user_id = auth.uid()
    )
  );

create table if not exists public.group_poll_votes (
  poll_id uuid not null references public.group_polls(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  option_idx int not null check (option_idx >= 0 and option_idx <= 3),
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);
grant select, insert, update, delete on public.group_poll_votes to authenticated;
grant all on public.group_poll_votes to service_role;
alter table public.group_poll_votes enable row level security;

drop policy if exists "poll votes read" on public.group_poll_votes;
create policy "poll votes read" on public.group_poll_votes
  for select to authenticated using (true);

drop policy if exists "poll votes write" on public.group_poll_votes;
create policy "poll votes write" on public.group_poll_votes
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.create_group_poll(
  p_group uuid,
  p_question text,
  p_options text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  mid uuid;
  pid uuid;
  opts text[];
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.chat_group_members where group_id = p_group and user_id = me) then
    raise exception 'Not a member';
  end if;
  opts := array(select trim(x) from unnest(p_options) x where length(trim(x)) > 0);
  if cardinality(opts) < 2 or cardinality(opts) > 4 then
    raise exception 'Poll needs 2–4 options';
  end if;
  if length(trim(p_question)) < 2 then raise exception 'Question required'; end if;

  insert into public.group_messages (group_id, user_id, content, msg_type, meta)
  values (
    p_group, me, trim(p_question), 'poll',
    jsonb_build_object('options', to_jsonb(opts))
  )
  returning id into mid;

  insert into public.group_polls (group_id, message_id, question, options, created_by)
  values (p_group, mid, trim(p_question), opts, me)
  returning id into pid;

  update public.group_messages
  set meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('poll_id', pid)
  where id = mid;

  perform public.prune_group_messages(p_group);
  return mid;
end;
$$;
grant execute on function public.create_group_poll(uuid, text, text[]) to authenticated;

create or replace function public.vote_group_poll(p_poll uuid, p_option int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  gid uuid;
  n int;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  select group_id, cardinality(options) into gid, n from public.group_polls where id = p_poll;
  if gid is null then raise exception 'Poll not found'; end if;
  if not exists (select 1 from public.chat_group_members where group_id = gid and user_id = me) then
    raise exception 'Not a member';
  end if;
  if p_option < 0 or p_option >= n then raise exception 'Invalid option'; end if;
  insert into public.group_poll_votes (poll_id, user_id, option_idx)
  values (p_poll, me, p_option)
  on conflict (poll_id, user_id) do update set option_idx = excluded.option_idx;
end;
$$;
grant execute on function public.vote_group_poll(uuid, int) to authenticated;

create or replace function public.get_group_poll_results(p_poll uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'poll_id', p.id,
    'question', p.question,
    'options', to_jsonb(p.options),
    'my_vote', (
      select option_idx from public.group_poll_votes v
      where v.poll_id = p.id and v.user_id = auth.uid()
    ),
    'counts', (
      select coalesce(jsonb_agg(cnt order by idx), '[]'::jsonb)
      from (
        select o.idx, count(v.user_id)::int as cnt
        from generate_subscripts(p.options, 1) as o(idx)
        left join public.group_poll_votes v
          on v.poll_id = p.id and v.option_idx = (o.idx - 1)
        group by o.idx
      ) s
    )
  )
  from public.group_polls p
  where p.id = p_poll;
$$;
grant execute on function public.get_group_poll_results(uuid) to authenticated;

-- Pin a message (UUID only — tiny)
alter table public.chat_groups
  add column if not exists pinned_message_id uuid;

create or replace function public.pin_group_message(p_group uuid, p_message uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.chat_group_members where group_id = p_group and user_id = me) then
    raise exception 'Not a member';
  end if;
  if p_message is not null and not exists (
    select 1 from public.group_messages where id = p_message and group_id = p_group and deleted_at is null
  ) then
    raise exception 'Message not found';
  end if;
  update public.chat_groups set pinned_message_id = p_message where id = p_group;
end;
$$;
grant execute on function public.pin_group_message(uuid, uuid) to authenticated;

-- Reaction counts for group messages
create or replace function public.get_group_msg_reactions(p_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(message_id::text, emojis), '{}'::jsonb)
  from (
    select message_id,
      jsonb_object_agg(emoji, cnt) as emojis
    from (
      select message_id, emoji, count(*)::int as cnt
      from public.group_msg_reactions
      where message_id = any(p_ids)
      group by message_id, emoji
    ) t
    group by message_id
  ) x;
$$;
grant execute on function public.get_group_msg_reactions(uuid[]) to authenticated;

-- ═══════════════════════════════════════════
-- 4) Realtime for social tables
-- ═══════════════════════════════════════════
do $$ begin
  alter publication supabase_realtime add table public.wall_reactions;
exception when duplicate_object then null; when others then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.wall_comments;
exception when duplicate_object then null; when others then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.group_msg_reactions;
exception when duplicate_object then null; when others then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.group_poll_votes;
exception when duplicate_object then null; when others then null; end $$;
