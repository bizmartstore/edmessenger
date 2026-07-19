-- Announcements, activities, admin emails
-- Run in Supabase SQL Editor

-- Fix primary admin emails (both spellings)
create or replace function public.ensure_primary_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  my_email text;
begin
  select email into my_email from auth.users where id = auth.uid();
  if my_email is null then return false; end if;
  if lower(my_email) not in (
    lower('sheethappenswithjaa@gmail.com'),
    lower('sheethappenwithjaa@gmail.com')
  ) then
    return false;
  end if;
  insert into public.user_roles (user_id, role)
  values (auth.uid(), 'admin')
  on conflict do nothing;
  return true;
end;
$$;
grant execute on function public.ensure_primary_admin() to authenticated;

update public.admin_config
set allowed_emails = array['sheethappenswithjaa@gmail.com', 'sheethappenwithjaa@gmail.com']
where id = 1;

insert into public.user_roles (user_id, role)
select id, 'admin'::public.app_role
from auth.users
where lower(email) in (
  lower('sheethappenswithjaa@gmail.com'),
  lower('sheethappenwithjaa@gmail.com')
)
on conflict do nothing;

-- Announcements (keep latest 20 to protect quota)
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
grant select on public.announcements to authenticated;
grant insert, update, delete on public.announcements to authenticated;
alter table public.announcements enable row level security;

drop policy if exists "ann read all" on public.announcements;
create policy "ann read all" on public.announcements for select to authenticated using (true);
drop policy if exists "ann admin write" on public.announcements;
create policy "ann admin write" on public.announcements for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin'));
drop policy if exists "ann admin update" on public.announcements;
create policy "ann admin update" on public.announcements for update to authenticated
  using (public.has_role(auth.uid(), 'admin'));
drop policy if exists "ann admin delete" on public.announcements;
create policy "ann admin delete" on public.announcements for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create or replace function public.prune_announcements()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.announcements where id in (
    select id from public.announcements order by created_at desc offset 20
  );
end; $$;
grant execute on function public.prune_announcements() to authenticated;

-- Activities + submissions
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  due_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
grant select on public.activities to authenticated;
grant insert, update, delete on public.activities to authenticated;
alter table public.activities enable row level security;

drop policy if exists "act read all" on public.activities;
create policy "act read all" on public.activities for select to authenticated using (true);
drop policy if exists "act admin insert" on public.activities;
create policy "act admin insert" on public.activities for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin'));
drop policy if exists "act admin update" on public.activities;
create policy "act admin update" on public.activities for update to authenticated
  using (public.has_role(auth.uid(), 'admin'));
drop policy if exists "act admin delete" on public.activities;
create policy "act admin delete" on public.activities for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create table if not exists public.activity_submissions (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  note text not null default '',
  attachments jsonb,
  created_at timestamptz not null default now(),
  unique (activity_id, user_id)
);
grant select, insert, update on public.activity_submissions to authenticated;
grant delete on public.activity_submissions to authenticated;
alter table public.activity_submissions enable row level security;

drop policy if exists "sub self read" on public.activity_submissions;
create policy "sub self read" on public.activity_submissions for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
drop policy if exists "sub self insert" on public.activity_submissions;
create policy "sub self insert" on public.activity_submissions for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists "sub self update" on public.activity_submissions;
create policy "sub self update" on public.activity_submissions for update to authenticated
  using (user_id = auth.uid());
drop policy if exists "sub admin delete" on public.activity_submissions;
create policy "sub admin delete" on public.activity_submissions for delete to authenticated
  using (public.has_role(auth.uid(), 'admin') or user_id = auth.uid());

-- Storage bucket for activity submissions (reuse chat-files is fine; optional dedicated)
insert into storage.buckets (id, name, public) values ('activity-files', 'activity-files', true)
  on conflict (id) do update set public = true;
drop policy if exists "public read activity-files" on storage.objects;
create policy "public read activity-files" on storage.objects for select using (bucket_id = 'activity-files');
drop policy if exists "auth insert activity-files" on storage.objects;
create policy "auth insert activity-files" on storage.objects for insert to authenticated
  with check (bucket_id = 'activity-files');
drop policy if exists "auth delete own activity-files" on storage.objects;
create policy "auth delete own activity-files" on storage.objects for delete to authenticated
  using (bucket_id = 'activity-files' and owner = auth.uid());
