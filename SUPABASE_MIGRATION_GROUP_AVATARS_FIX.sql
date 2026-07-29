-- Fix group avatar upload RLS ("new row violates row-level security policy")
-- Run in Supabase SQL Editor. Safe to re-run.

-- Ensure column exists
alter table public.chat_groups
  add column if not exists avatar_url text;

-- Owner-only avatar URL update (security definer bypasses table RLS)
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

-- list_chat_groups must return avatar_url for Groups tab display
drop function if exists public.list_chat_groups();
create function public.list_chat_groups()
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

-- Storage bucket
insert into storage.buckets (id, name, public)
values ('group-avatars', 'group-avatars', true)
on conflict (id) do update set public = true;

-- Drop old policies then recreate with WITH CHECK (needed for upsert)
drop policy if exists "public read group avatars" on storage.objects;
drop policy if exists "group owner upsert avatar" on storage.objects;
drop policy if exists "group owner insert avatar" on storage.objects;
drop policy if exists "group owner update avatar" on storage.objects;
drop policy if exists "group owner delete avatar" on storage.objects;

create policy "public read group avatars" on storage.objects
  for select
  using (bucket_id = 'group-avatars');

create policy "group owner insert avatar" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'group-avatars'
    and exists (
      select 1 from public.chat_groups g
      where g.created_by = auth.uid()
        and (
          g.id::text = split_part(name, '/', 1)
          or g.id::text = (storage.foldername(name))[1]
        )
    )
  );

create policy "group owner update avatar" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'group-avatars'
    and exists (
      select 1 from public.chat_groups g
      where g.created_by = auth.uid()
        and (
          g.id::text = split_part(name, '/', 1)
          or g.id::text = (storage.foldername(name))[1]
        )
    )
  )
  with check (
    bucket_id = 'group-avatars'
    and exists (
      select 1 from public.chat_groups g
      where g.created_by = auth.uid()
        and (
          g.id::text = split_part(name, '/', 1)
          or g.id::text = (storage.foldername(name))[1]
        )
    )
  );

create policy "group owner delete avatar" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'group-avatars'
    and exists (
      select 1 from public.chat_groups g
      where g.created_by = auth.uid()
        and (
          g.id::text = split_part(name, '/', 1)
          or g.id::text = (storage.foldername(name))[1]
        )
    )
  );
