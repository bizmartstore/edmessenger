-- EdMessenger — profiles (school/contact), banners, unread tracking, avatars bucket
-- Run in Supabase SQL Editor after previous migrations.
-- Project: https://ijxoffbsedvcqbqeohju.supabase.co

-- 1) Profile fields
alter table public.profiles
  add column if not exists school text,
  add column if not exists contact_number text;

-- Admins may update any profile
drop policy if exists "profiles admin update" on public.profiles;
create policy "profiles admin update" on public.profiles
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- 2) Banner carousel
create table if not exists public.banners (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  image_path text,
  sort_order int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists banners_sort_idx on public.banners (sort_order, created_at);
grant select on public.banners to authenticated;
grant insert, update, delete on public.banners to authenticated;
grant all on public.banners to service_role;
alter table public.banners enable row level security;

drop policy if exists "banners read" on public.banners;
create policy "banners read" on public.banners
  for select to authenticated using (true);

drop policy if exists "banners admin write" on public.banners;
create policy "banners admin write" on public.banners
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- 3) Per-user last-read timestamps for red badges
create table if not exists public.user_section_reads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  section text not null,
  last_read_at timestamptz not null default '1970-01-01'::timestamptz,
  primary key (user_id, section)
);
grant select, insert, update on public.user_section_reads to authenticated;
grant all on public.user_section_reads to service_role;
alter table public.user_section_reads enable row level security;

drop policy if exists "reads own" on public.user_section_reads;
create policy "reads own" on public.user_section_reads
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.mark_section_read(sec text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  if sec not in ('classroom', 'dms', 'activities', 'lessons', 'quizzes', 'announcements') then
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
  lr_activities timestamptz;
  lr_lessons timestamptz;
  lr_quizzes timestamptz;
  lr_announcements timestamptz;
  c_classroom int;
  c_dms int;
  c_activities int;
  c_lessons int;
  c_quizzes int;
  c_announcements int;
begin
  if me is null then
    return '{}'::jsonb;
  end if;

  select
    coalesce(max(case when section = 'classroom' then last_read_at end), '1970-01-01'::timestamptz),
    coalesce(max(case when section = 'dms' then last_read_at end), '1970-01-01'::timestamptz),
    coalesce(max(case when section = 'activities' then last_read_at end), '1970-01-01'::timestamptz),
    coalesce(max(case when section = 'lessons' then last_read_at end), '1970-01-01'::timestamptz),
    coalesce(max(case when section = 'quizzes' then last_read_at end), '1970-01-01'::timestamptz),
    coalesce(max(case when section = 'announcements' then last_read_at end), '1970-01-01'::timestamptz)
  into lr_classroom, lr_dms, lr_activities, lr_lessons, lr_quizzes, lr_announcements
  from public.user_section_reads
  where user_id = me;

  select count(*)::int into c_classroom
  from public.messages
  where user_id <> me and created_at > lr_classroom;

  select count(*)::int into c_dms
  from public.direct_messages
  where recipient_id = me and created_at > lr_dms;

  select count(*)::int into c_activities
  from public.activities
  where created_at > lr_activities;

  select count(*)::int into c_lessons
  from public.lessons
  where created_at > lr_lessons;

  select count(*)::int into c_quizzes
  from public.quizzes
  where published and created_at > lr_quizzes;

  select count(*)::int into c_announcements
  from public.announcements
  where created_at > lr_announcements;

  return jsonb_build_object(
    'classroom', c_classroom,
    'dms', c_dms,
    'chat', c_classroom + c_dms,
    'activities', c_activities,
    'lessons', c_lessons,
    'quizzes', c_quizzes,
    'announcements', c_announcements
  );
end;
$$;
grant execute on function public.get_unread_counts() to authenticated;

-- 4) Storage: avatars + banners
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('banners', 'banners', true)
on conflict (id) do nothing;

drop policy if exists "public read avatars" on storage.objects;
create policy "public read avatars" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "auth upsert own avatars" on storage.objects;
create policy "auth upsert own avatars" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "auth update own avatars" on storage.objects;
create policy "auth update own avatars" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "auth delete own avatars" on storage.objects;
create policy "auth delete own avatars" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "admin write any avatars" on storage.objects;
create policy "admin write any avatars" on storage.objects
  for all to authenticated
  using (bucket_id = 'avatars' and public.has_role(auth.uid(), 'admin'))
  with check (bucket_id = 'avatars' and public.has_role(auth.uid(), 'admin'));

drop policy if exists "public read banners" on storage.objects;
create policy "public read banners" on storage.objects
  for select using (bucket_id = 'banners');

drop policy if exists "admin insert banners" on storage.objects;
create policy "admin insert banners" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'banners' and public.has_role(auth.uid(), 'admin'));

drop policy if exists "admin delete banners" on storage.objects;
create policy "admin delete banners" on storage.objects
  for delete to authenticated
  using (bucket_id = 'banners' and public.has_role(auth.uid(), 'admin'));
