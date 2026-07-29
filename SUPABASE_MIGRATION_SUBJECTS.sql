-- EdMessenger — admin subjects (optional password) + group avatars
-- Run after SUPABASE_MIGRATION_GAMES_PASSWORD.sql

create extension if not exists pgcrypto with schema extensions;

-- ═══════════════════════════════════════════
-- 1) Subjects
-- ═══════════════════════════════════════════
create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  password_hash text, -- null = open (no password)
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists subjects_sort_idx on public.subjects (sort_order, name);
grant select on public.subjects to authenticated;
grant all on public.subjects to service_role;
alter table public.subjects enable row level security;

drop policy if exists "subjects read" on public.subjects;
create policy "subjects read" on public.subjects
  for select to authenticated using (true);

-- Writes go through security-definer RPCs only

alter table public.profiles
  add column if not exists selected_subject_id uuid references public.subjects(id) on delete set null;

alter table public.lessons
  add column if not exists subject_id uuid references public.subjects(id) on delete set null;

alter table public.quizzes
  add column if not exists subject_id uuid references public.subjects(id) on delete set null;

alter table public.activities
  add column if not exists subject_id uuid references public.subjects(id) on delete set null;

alter table public.reviewers
  add column if not exists subject_id uuid references public.subjects(id) on delete set null;

-- List subjects (never expose password hash)
create or replace function public.list_subjects()
returns table (
  id uuid,
  name text,
  has_password boolean,
  sort_order int,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.name,
    (s.password_hash is not null and length(s.password_hash) > 0) as has_password,
    s.sort_order,
    s.created_at
  from public.subjects s
  order by s.sort_order, s.name;
$$;
grant execute on function public.list_subjects() to authenticated;

-- Admin: create subject with optional password
create or replace function public.create_subject(
  p_name text,
  p_password text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  me uuid := auth.uid();
  hash text := null;
  sid uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if not public.has_role(me, 'admin') then raise exception 'Admin only'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then
    raise exception 'Subject name too short';
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
  insert into public.subjects (name, password_hash)
  values (trim(p_name), hash)
  returning id into sid;
  return sid;
end;
$$;
grant execute on function public.create_subject(text, text) to authenticated;

-- Admin: update subject name and/or password
-- p_password: null = keep existing password, '' = clear password, non-empty = set new
create or replace function public.update_subject(
  p_id uuid,
  p_name text default null,
  p_password text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  me uuid := auth.uid();
  hash text;
  keep_password boolean := p_password is null;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if not public.has_role(me, 'admin') then raise exception 'Admin only'; end if;
  if not exists (select 1 from public.subjects where id = p_id) then
    raise exception 'Subject not found';
  end if;

  if not keep_password then
    if length(trim(coalesce(p_password, ''))) = 0 then
      hash := null;
    else
      if length(trim(p_password)) < 3 then
        raise exception 'Password must be at least 3 characters';
      end if;
      if length(trim(p_password)) > 64 then
        raise exception 'Password too long';
      end if;
      hash := crypt(trim(p_password), gen_salt('bf'));
    end if;
  end if;

  if keep_password then
    update public.subjects
    set name = coalesce(nullif(trim(p_name), ''), name)
    where id = p_id;
  else
    update public.subjects
    set name = coalesce(nullif(trim(p_name), ''), name),
        password_hash = hash
    where id = p_id;
  end if;

  return true;
end;
$$;
grant execute on function public.update_subject(uuid, text, text) to authenticated;

-- Admin: delete subject (clears user selections via FK)
create or replace function public.delete_subject(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if not public.has_role(me, 'admin') then raise exception 'Admin only'; end if;
  delete from public.subjects where id = p_id;
end;
$$;
grant execute on function public.delete_subject(uuid) to authenticated;

-- Student: select subject (validates optional password server-side)
create or replace function public.select_subject(
  p_subject_id uuid,
  p_password text default null
)
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

  select password_hash into hash from public.subjects where id = p_subject_id;
  if not found then raise exception 'Subject not found'; end if;

  if hash is not null and length(hash) > 0 then
    if p_password is null or length(trim(p_password)) = 0 then
      return false;
    end if;
    if crypt(trim(p_password), hash) <> hash then
      return false;
    end if;
  end if;

  update public.profiles
  set selected_subject_id = p_subject_id,
      updated_at = now()
  where id = me;

  return true;
end;
$$;
grant execute on function public.select_subject(uuid, text) to authenticated;

-- Student: clear subject selection
create or replace function public.clear_subject()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  update public.profiles
  set selected_subject_id = null,
      updated_at = now()
  where id = auth.uid();
end;
$$;
grant execute on function public.clear_subject() to authenticated;

-- ═══════════════════════════════════════════
-- 2) Unread counts filtered by selected subject
-- ═══════════════════════════════════════════
create or replace function public.get_unread_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  sub_id uuid;
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

  select selected_subject_id into sub_id from public.profiles where id = me;

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

  if sub_id is not null then
    select count(*)::int into c_activities
    from public.activities
    where created_at > lr_activities and subject_id = sub_id;

    select count(*)::int into c_lessons
    from public.lessons
    where created_at > lr_lessons and subject_id = sub_id;

    select count(*)::int into c_reviewers
    from public.reviewers
    where published and created_at > lr_lessons and subject_id = sub_id;

    select count(*)::int into c_quizzes
    from public.quizzes
    where published and created_at > lr_quizzes and subject_id = sub_id;
  else
    c_activities := 0;
    c_lessons := 0;
    c_reviewers := 0;
    c_quizzes := 0;
  end if;

  c_lessons := c_lessons + c_reviewers;

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
-- 3) Group avatars
-- ═══════════════════════════════════════════
alter table public.chat_groups
  add column if not exists avatar_url text;

-- Owner-only avatar update (server-side)
create or replace function public.update_group_avatar(p_group uuid, p_url text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if p_url is null or length(trim(p_url)) = 0 then
    raise exception 'Avatar URL required';
  end if;
  update public.chat_groups
  set avatar_url = trim(p_url)
  where id = p_group and created_by = me;
  if not found then
    raise exception 'Only the group owner can update the avatar';
  end if;
  return true;
end;
$$;
grant execute on function public.update_group_avatar(uuid, text) to authenticated;

-- Extend list_chat_groups with avatar_url
create or replace function public.list_chat_groups()
returns table (
  id uuid,
  name text,
  description text,
  has_password boolean,
  avatar_url text,
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
    g.avatar_url,
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

-- Storage bucket for group avatars
insert into storage.buckets (id, name, public) values ('group-avatars', 'group-avatars', true)
on conflict (id) do nothing;

drop policy if exists "public read group avatars" on storage.objects;
create policy "public read group avatars" on storage.objects
  for select using (bucket_id = 'group-avatars');

drop policy if exists "group owner upsert avatar" on storage.objects;
create policy "group owner upsert avatar" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'group-avatars'
    and exists (
      select 1 from public.chat_groups g
      where g.id = ((storage.foldername(name))[1])::uuid
        and g.created_by = auth.uid()
    )
  );

drop policy if exists "group owner update avatar" on storage.objects;
create policy "group owner update avatar" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'group-avatars'
    and exists (
      select 1 from public.chat_groups g
      where g.id = ((storage.foldername(name))[1])::uuid
        and g.created_by = auth.uid()
    )
  );

drop policy if exists "group owner delete avatar" on storage.objects;
create policy "group owner delete avatar" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'group-avatars'
    and exists (
      select 1 from public.chat_groups g
      where g.id = ((storage.foldername(name))[1])::uuid
        and g.created_by = auth.uid()
    )
  );

-- Realtime for subjects (admin creates, students see in profile)
do $$ begin
  alter publication supabase_realtime add table public.subjects;
exception when duplicate_object then null; when others then null; end $$;
