-- EdMessenger — Class wall, group chats, classroom replies, DM delete, daily upload quotas
-- Run once in Supabase SQL Editor after previous migrations.
-- Project: https://ijxoffbsedvcqbqeohju.supabase.co

create extension if not exists pgcrypto with schema extensions;

-- ═══════════════════════════════════════════
-- 1) Classroom reply fields
-- ═══════════════════════════════════════════
alter table public.messages
  add column if not exists reply_to_id uuid,
  add column if not exists reply_to_content text,
  add column if not exists reply_to_name text;

-- ═══════════════════════════════════════════
-- 2) Class wall posts (Facebook-style feed)
-- ═══════════════════════════════════════════
create table if not exists public.wall_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null default '',
  attachments jsonb,
  created_at timestamptz not null default now()
);
create index if not exists wall_posts_created_idx on public.wall_posts (created_at desc);
grant select, insert, delete on public.wall_posts to authenticated;
grant all on public.wall_posts to service_role;
alter table public.wall_posts enable row level security;

drop policy if exists "wall read" on public.wall_posts;
create policy "wall read" on public.wall_posts
  for select to authenticated using (true);

drop policy if exists "wall insert" on public.wall_posts;
create policy "wall insert" on public.wall_posts
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "wall delete" on public.wall_posts;
create policy "wall delete" on public.wall_posts
  for delete to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create or replace function public.prune_wall_posts()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.wall_posts
  where id not in (
    select id from public.wall_posts
    order by created_at desc
    limit 80
  );
end;
$$;
grant execute on function public.prune_wall_posts() to authenticated;

-- ═══════════════════════════════════════════
-- 3) Group chats
-- ═══════════════════════════════════════════
create table if not exists public.chat_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  password_hash text, -- null = open group
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists chat_groups_created_idx on public.chat_groups (created_at desc);
grant select on public.chat_groups to authenticated;
grant all on public.chat_groups to service_role;
alter table public.chat_groups enable row level security;

drop policy if exists "groups read" on public.chat_groups;
create policy "groups read" on public.chat_groups
  for select to authenticated using (true);

-- Writes go through security-definer RPCs only
drop policy if exists "groups insert" on public.chat_groups;
drop policy if exists "groups update" on public.chat_groups;
drop policy if exists "groups delete" on public.chat_groups;

create table if not exists public.chat_group_members (
  group_id uuid not null references public.chat_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user_idx on public.chat_group_members (user_id);
grant select on public.chat_group_members to authenticated;
grant all on public.chat_group_members to service_role;
alter table public.chat_group_members enable row level security;

drop policy if exists "group members read" on public.chat_group_members;
create policy "group members read" on public.chat_group_members
  for select to authenticated using (true);

create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.chat_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null default '',
  attachments jsonb,
  created_at timestamptz not null default now()
);
create index if not exists group_messages_group_idx on public.group_messages (group_id, created_at desc);
grant select, insert, delete on public.group_messages to authenticated;
grant all on public.group_messages to service_role;
alter table public.group_messages enable row level security;

drop policy if exists "group msgs read" on public.group_messages;
create policy "group msgs read" on public.group_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.chat_group_members m
      where m.group_id = group_messages.group_id and m.user_id = auth.uid()
    )
  );

drop policy if exists "group msgs insert" on public.group_messages;
create policy "group msgs insert" on public.group_messages
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.chat_group_members m
      where m.group_id = group_messages.group_id and m.user_id = auth.uid()
    )
  );

drop policy if exists "group msgs delete" on public.group_messages;
create policy "group msgs delete" on public.group_messages
  for delete to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create or replace function public.prune_group_messages(p_group uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.group_messages
  where group_id = p_group
    and id not in (
      select id from public.group_messages
      where group_id = p_group
      order by created_at desc
      limit 50
    );
end;
$$;
grant execute on function public.prune_group_messages(uuid) to authenticated;

-- Create group (optional password). Creator auto-joins.
create or replace function public.create_chat_group(
  p_name text,
  p_description text default null,
  p_password text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  gid uuid;
  me uuid := auth.uid();
  hash text := null;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then
    raise exception 'Group name too short';
  end if;
  if p_password is not null and length(trim(p_password)) > 0 then
    hash := crypt(trim(p_password), gen_salt('bf'));
  end if;
  insert into public.chat_groups (name, description, password_hash, created_by)
  values (trim(p_name), nullif(trim(coalesce(p_description, '')), ''), hash, me)
  returning id into gid;
  insert into public.chat_group_members (group_id, user_id) values (gid, me);
  return gid;
end;
$$;
grant execute on function public.create_chat_group(text, text, text) to authenticated;

-- Join group (password required when set)
create or replace function public.join_chat_group(p_group uuid, p_password text default null)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  me uuid := auth.uid();
  hash text;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  select password_hash into hash from public.chat_groups where id = p_group;
  if not found then raise exception 'Group not found'; end if;
  if hash is not null then
    if p_password is null or crypt(trim(p_password), hash) <> hash then
      raise exception 'Incorrect password';
    end if;
  end if;
  insert into public.chat_group_members (group_id, user_id)
  values (p_group, me)
  on conflict do nothing;
  return true;
end;
$$;
grant execute on function public.join_chat_group(uuid, text) to authenticated;

-- Leave group
create or replace function public.leave_chat_group(p_group uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  delete from public.chat_group_members
  where group_id = p_group and user_id = auth.uid();
end;
$$;
grant execute on function public.leave_chat_group(uuid) to authenticated;

-- List groups with membership + lock flag (never expose hash)
create or replace function public.list_chat_groups()
returns table (
  id uuid,
  name text,
  description text,
  has_password boolean,
  created_by uuid,
  created_at timestamptz,
  member_count bigint,
  is_member boolean,
  last_message text,
  last_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id,
    g.name,
    g.description,
    (g.password_hash is not null) as has_password,
    g.created_by,
    g.created_at,
    (select count(*) from public.chat_group_members m where m.group_id = g.id) as member_count,
    exists (
      select 1 from public.chat_group_members m
      where m.group_id = g.id and m.user_id = auth.uid()
    ) as is_member,
    (
      select gm.content from public.group_messages gm
      where gm.group_id = g.id
      order by gm.created_at desc limit 1
    ) as last_message,
    (
      select gm.created_at from public.group_messages gm
      where gm.group_id = g.id
      order by gm.created_at desc limit 1
    ) as last_at
  from public.chat_groups g
  order by coalesce(
    (select gm.created_at from public.group_messages gm where gm.group_id = g.id order by gm.created_at desc limit 1),
    g.created_at
  ) desc;
$$;
grant execute on function public.list_chat_groups() to authenticated;

-- Member IDs for push targeting
create or replace function public.get_group_member_ids(p_group uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(user_id), '{}'::uuid[])
  from public.chat_group_members
  where group_id = p_group;
$$;
grant execute on function public.get_group_member_ids(uuid) to authenticated;

-- ═══════════════════════════════════════════
-- 4) Delete entire private-message conversation
-- ═══════════════════════════════════════════
create or replace function public.delete_dm_conversation(peer uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Not authenticated'; end if;
  delete from public.direct_messages
  where (sender_id = me and recipient_id = peer)
     or (sender_id = peer and recipient_id = me);
end;
$$;
grant execute on function public.delete_dm_conversation(uuid) to authenticated;

-- ═══════════════════════════════════════════
-- 5) Daily upload quotas (wall + group)
-- ═══════════════════════════════════════════
create table if not exists public.daily_upload_usage (
  user_id uuid not null references public.profiles(id) on delete cascade,
  usage_date date not null default (timezone('utc', now()))::date,
  scope text not null check (scope in ('wall', 'group')),
  images int not null default 0,
  docs int not null default 0,
  primary key (user_id, usage_date, scope)
);
grant select on public.daily_upload_usage to authenticated;
grant all on public.daily_upload_usage to service_role;
alter table public.daily_upload_usage enable row level security;

drop policy if exists "quota read own" on public.daily_upload_usage;
create policy "quota read own" on public.daily_upload_usage
  for select to authenticated using (user_id = auth.uid());

-- Returns { ok, images_used, docs_used, images_limit, docs_limit, error }
create or replace function public.consume_upload_quota(
  p_scope text,
  p_images int default 0,
  p_docs int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  today date := (timezone('utc', now()))::date;
  lim_img int;
  lim_doc int;
  cur_img int;
  cur_doc int;
begin
  if me is null then
    return jsonb_build_object('ok', false, 'error', 'Not authenticated');
  end if;
  if p_scope not in ('wall', 'group') then
    return jsonb_build_object('ok', false, 'error', 'Invalid scope');
  end if;

  if p_scope = 'wall' then
    lim_img := 5; lim_doc := 3;
  else
    lim_img := 8; lim_doc := 5;
  end if;

  insert into public.daily_upload_usage (user_id, usage_date, scope, images, docs)
  values (me, today, p_scope, 0, 0)
  on conflict (user_id, usage_date, scope) do nothing;

  select images, docs into cur_img, cur_doc
  from public.daily_upload_usage
  where user_id = me and usage_date = today and scope = p_scope
  for update;

  if cur_img + greatest(p_images, 0) > lim_img then
    return jsonb_build_object(
      'ok', false,
      'error', format('Daily image limit reached (%s/%s). Try again tomorrow.', cur_img, lim_img),
      'images_used', cur_img, 'docs_used', cur_doc,
      'images_limit', lim_img, 'docs_limit', lim_doc
    );
  end if;
  if cur_doc + greatest(p_docs, 0) > lim_doc then
    return jsonb_build_object(
      'ok', false,
      'error', format('Daily document limit reached (%s/%s). Try again tomorrow.', cur_doc, lim_doc),
      'images_used', cur_img, 'docs_used', cur_doc,
      'images_limit', lim_img, 'docs_limit', lim_doc
    );
  end if;

  update public.daily_upload_usage
  set images = images + greatest(p_images, 0),
      docs = docs + greatest(p_docs, 0)
  where user_id = me and usage_date = today and scope = p_scope
  returning images, docs into cur_img, cur_doc;

  return jsonb_build_object(
    'ok', true,
    'images_used', cur_img, 'docs_used', cur_doc,
    'images_limit', lim_img, 'docs_limit', lim_doc
  );
end;
$$;
grant execute on function public.consume_upload_quota(text, int, int) to authenticated;

create or replace function public.get_upload_quota(p_scope text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  today date := (timezone('utc', now()))::date;
  lim_img int;
  lim_doc int;
  cur_img int := 0;
  cur_doc int := 0;
begin
  if me is null then return '{}'::jsonb; end if;
  if p_scope = 'wall' then lim_img := 5; lim_doc := 3;
  else lim_img := 8; lim_doc := 5; end if;

  select coalesce(images, 0), coalesce(docs, 0) into cur_img, cur_doc
  from public.daily_upload_usage
  where user_id = me and usage_date = today and scope = p_scope;

  return jsonb_build_object(
    'images_used', coalesce(cur_img, 0),
    'docs_used', coalesce(cur_doc, 0),
    'images_limit', lim_img,
    'docs_limit', lim_doc
  );
end;
$$;
grant execute on function public.get_upload_quota(text) to authenticated;

-- ═══════════════════════════════════════════
-- 6) Unread: include groups (+ wall optional)
-- ═══════════════════════════════════════════
create or replace function public.mark_section_read(sec text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  if sec not in ('classroom', 'dms', 'groups', 'activities', 'lessons', 'quizzes', 'announcements', 'wall') then
    return;
  end if;
  insert into public.user_section_reads (user_id, section, last_read_at)
  values (auth.uid(), sec, now())
  on conflict (user_id, section) do update set last_read_at = excluded.last_read_at;
end;
$$;
grant execute on function public.mark_section_read(text) to authenticated;

create or replace function public.get_unread_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  lr_classroom timestamptz;
  lr_dms timestamptz;
  lr_groups timestamptz;
  lr_activities timestamptz;
  lr_lessons timestamptz;
  lr_quizzes timestamptz;
  lr_announcements timestamptz;
  lr_wall timestamptz;
  c_classroom int;
  c_dms int;
  c_groups int;
  c_activities int;
  c_lessons int;
  c_reviewers int;
  c_quizzes int;
  c_announcements int;
  c_wall int;
  c_chat int;
  c_total int;
begin
  if me is null then
    return '{}'::jsonb;
  end if;

  select
    coalesce(max(case when section = 'classroom' then last_read_at end), '1970-01-01'::timestamptz),
    coalesce(max(case when section = 'dms' then last_read_at end), '1970-01-01'::timestamptz),
    coalesce(max(case when section = 'groups' then last_read_at end), '1970-01-01'::timestamptz),
    coalesce(max(case when section = 'activities' then last_read_at end), '1970-01-01'::timestamptz),
    coalesce(max(case when section = 'lessons' then last_read_at end), '1970-01-01'::timestamptz),
    coalesce(max(case when section = 'quizzes' then last_read_at end), '1970-01-01'::timestamptz),
    coalesce(max(case when section = 'announcements' then last_read_at end), '1970-01-01'::timestamptz),
    coalesce(max(case when section = 'wall' then last_read_at end), '1970-01-01'::timestamptz)
  into lr_classroom, lr_dms, lr_groups, lr_activities, lr_lessons, lr_quizzes, lr_announcements, lr_wall
  from public.user_section_reads
  where user_id = me;

  select count(*)::int into c_classroom
  from public.messages
  where user_id <> me and created_at > lr_classroom;

  select count(*)::int into c_dms
  from public.direct_messages
  where recipient_id = me and created_at > lr_dms;

  select count(*)::int into c_groups
  from public.group_messages gm
  where gm.user_id <> me
    and gm.created_at > lr_groups
    and exists (
      select 1 from public.chat_group_members m
      where m.group_id = gm.group_id and m.user_id = me
    );

  select count(*)::int into c_activities
  from public.activities
  where created_at > lr_activities;

  select count(*)::int into c_lessons
  from public.lessons
  where created_at > lr_lessons;

  select count(*)::int into c_reviewers
  from public.reviewers
  where published and created_at > lr_lessons;

  c_lessons := c_lessons + c_reviewers;

  select count(*)::int into c_quizzes
  from public.quizzes
  where published and created_at > lr_quizzes;

  select count(*)::int into c_announcements
  from public.announcements
  where created_at > lr_announcements;

  select count(*)::int into c_wall
  from public.wall_posts
  where user_id <> me and created_at > lr_wall;

  c_chat := c_classroom + c_dms + c_groups;
  c_total := c_chat + c_activities + c_lessons + c_quizzes + c_announcements + c_wall;

  return jsonb_build_object(
    'classroom', c_classroom,
    'dms', c_dms,
    'groups', c_groups,
    'chat', c_chat,
    'activities', c_activities,
    'lessons', c_lessons,
    'quizzes', c_quizzes,
    'announcements', c_announcements,
    'wall', c_wall,
    'total', c_total
  );
end;
$$;
grant execute on function public.get_unread_counts() to authenticated;

-- ═══════════════════════════════════════════
-- 7) Realtime
-- ═══════════════════════════════════════════
do $$ begin
  alter publication supabase_realtime add table public.wall_posts;
exception when duplicate_object then null; when others then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.group_messages;
exception when duplicate_object then null; when others then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.chat_groups;
exception when duplicate_object then null; when others then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.chat_group_members;
exception when duplicate_object then null; when others then null; end $$;
