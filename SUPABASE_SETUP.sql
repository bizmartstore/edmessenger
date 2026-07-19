-- =============================================================
-- EduChat — Supabase setup
-- Run this ENTIRE file in your Supabase SQL Editor once.
-- Project: https://ijxoffbsedvcqbqeohju.supabase.co
-- =============================================================

-- ▸▸▸  CONFIGURE THESE TWO VALUES BEFORE RUNNING  ◂◂◂
--    ADMIN_PASSCODE:   the passcode you'll type in the footer
--    ADMIN_EMAILS:     comma-separated allow-list of educator Google emails
-- =============================================================

-- 0) EXTENSIONS
create extension if not exists pgcrypto;

-- 1) ROLES ENUM + user_roles
do $$ begin
  create type app_role as enum ('admin', 'student');
exception when duplicate_object then null; end $$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null default 'student',
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

drop policy if exists "read own roles" on public.user_roles;
create policy "read own roles" on public.user_roles for select to authenticated
  using (user_id = auth.uid());

-- Security-definer role check
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role);
$$;

-- 2) PROFILES
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.profiles to authenticated;
grant insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

drop policy if exists "profiles read all" on public.profiles;
create policy "profiles read all" on public.profiles for select to authenticated using (true);
drop policy if exists "profiles upsert own" on public.profiles;
create policy "profiles upsert own" on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update to authenticated using (id = auth.uid());

-- Auto-create profile on sign-up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);
  -- default student role
  insert into public.user_roles (user_id, role) values (new.id, 'student')
  on conflict do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3) CLASSROOM MESSAGES (group chat)
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null default '',
  attachments jsonb,
  created_at timestamptz not null default now()
);
create index if not exists messages_created_idx on public.messages (created_at);
grant select, insert on public.messages to authenticated;
grant all on public.messages to service_role;
alter table public.messages enable row level security;
drop policy if exists "read all messages" on public.messages;
create policy "read all messages" on public.messages for select to authenticated using (true);
drop policy if exists "insert own message" on public.messages;
create policy "insert own message" on public.messages for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "delete own message" on public.messages;
create policy "delete own message" on public.messages for delete to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- FK reference so PostgREST embedded select works: messages.user_id → profiles.id
do $$ begin
  alter table public.messages add constraint messages_user_id_fkey
    foreign key (user_id) references public.profiles(id) on delete cascade;
exception when duplicate_object then null; when others then null; end $$;

-- 4) DIRECT MESSAGES (private)
create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  content text not null default '',
  attachments jsonb,
  created_at timestamptz not null default now()
);
create index if not exists dm_conv_idx on public.direct_messages (sender_id, recipient_id, created_at);
create index if not exists dm_recipient_idx on public.direct_messages (recipient_id, created_at);
grant select, insert, delete on public.direct_messages to authenticated;
grant all on public.direct_messages to service_role;
alter table public.direct_messages enable row level security;
drop policy if exists "read own dms" on public.direct_messages;
create policy "read own dms" on public.direct_messages for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());
drop policy if exists "send dms" on public.direct_messages;
create policy "send dms" on public.direct_messages for insert to authenticated
  with check (sender_id = auth.uid());
drop policy if exists "delete own dms" on public.direct_messages;
create policy "delete own dms" on public.direct_messages for delete to authenticated
  using (sender_id = auth.uid());

-- DM preview list
create or replace function public.list_dm_previews()
returns table (peer_id uuid, peer_name text, peer_avatar text, last_message text, last_at timestamptz)
language sql stable security definer set search_path = public as $$
  with pairs as (
    select
      case when sender_id = auth.uid() then recipient_id else sender_id end as peer_id,
      content, created_at,
      row_number() over (
        partition by case when sender_id = auth.uid() then recipient_id else sender_id end
        order by created_at desc
      ) as rn
    from public.direct_messages
    where sender_id = auth.uid() or recipient_id = auth.uid()
  )
  select p.peer_id, pr.full_name, pr.avatar_url, p.content, p.created_at
  from pairs p
  left join public.profiles pr on pr.id = p.peer_id
  where p.rn = 1
  order by p.created_at desc;
$$;
grant execute on function public.list_dm_previews() to authenticated;

-- 5) LESSONS (PDFs)
create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  file_url text not null,
  file_name text not null,
  file_size bigint not null default 0,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
grant select on public.lessons to authenticated;
grant insert, update, delete on public.lessons to authenticated;
grant all on public.lessons to service_role;
alter table public.lessons enable row level security;
drop policy if exists "lessons read" on public.lessons;
create policy "lessons read" on public.lessons for select to authenticated using (true);
drop policy if exists "lessons admin write" on public.lessons;
create policy "lessons admin write" on public.lessons for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- 6) QUIZZES
create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  published boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
grant select on public.quizzes to authenticated;
grant insert, update, delete on public.quizzes to authenticated;
grant all on public.quizzes to service_role;
alter table public.quizzes enable row level security;
drop policy if exists "quizzes read published or admin" on public.quizzes;
create policy "quizzes read published or admin" on public.quizzes for select to authenticated
  using (published or public.has_role(auth.uid(), 'admin'));
drop policy if exists "quizzes admin write" on public.quizzes;
create policy "quizzes admin write" on public.quizzes for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  question text not null,
  options jsonb not null,
  correct_index int not null default 0,
  order_index int not null default 0
);
grant select on public.quiz_questions to authenticated;
grant insert, update, delete on public.quiz_questions to authenticated;
grant all on public.quiz_questions to service_role;
alter table public.quiz_questions enable row level security;
drop policy if exists "qq read if quiz visible" on public.quiz_questions;
create policy "qq read if quiz visible" on public.quiz_questions for select to authenticated
  using (exists (select 1 from public.quizzes q where q.id = quiz_id and (q.published or public.has_role(auth.uid(), 'admin'))));
drop policy if exists "qq admin write" on public.quiz_questions;
create policy "qq admin write" on public.quiz_questions for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  score int not null default 0,
  created_at timestamptz not null default now(),
  unique (quiz_id, user_id)
);
grant select, insert, update on public.quiz_attempts to authenticated;
grant all on public.quiz_attempts to service_role;
alter table public.quiz_attempts enable row level security;
drop policy if exists "attempts self read" on public.quiz_attempts;
create policy "attempts self read" on public.quiz_attempts for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
drop policy if exists "attempts self write" on public.quiz_attempts;
create policy "attempts self write" on public.quiz_attempts for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists "attempts self update" on public.quiz_attempts;
create policy "attempts self update" on public.quiz_attempts for update to authenticated
  using (user_id = auth.uid());

-- 7) ATTENDANCE
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null default (now() at time zone 'utc')::date,
  checked_in_at timestamptz not null default now(),
  unique (user_id, date)
);
grant select, insert on public.attendance to authenticated;
grant all on public.attendance to service_role;
alter table public.attendance enable row level security;
drop policy if exists "att self read" on public.attendance;
create policy "att self read" on public.attendance for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
drop policy if exists "att self insert" on public.attendance;
create policy "att self insert" on public.attendance for insert to authenticated
  with check (user_id = auth.uid());

create or replace function public.attendance_for_date(d date)
returns table (user_id uuid, date date, checked_in_at timestamptz, full_name text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select a.user_id, a.date, a.checked_in_at, p.full_name, p.avatar_url
  from public.attendance a
  left join public.profiles p on p.id = a.user_id
  where a.date = d
    and public.has_role(auth.uid(), 'admin')
  order by a.checked_in_at asc;
$$;
grant execute on function public.attendance_for_date(date) to authenticated;

-- 8) STUDENT REPORT
create or replace function public.student_reports()
returns table (student_id uuid, full_name text, avatar_url text, attendance_days bigint, quizzes_taken bigint, avg_score numeric)
language sql stable security definer set search_path = public as $$
  select
    p.id as student_id,
    p.full_name,
    p.avatar_url,
    (select count(*) from public.attendance a where a.user_id = p.id) as attendance_days,
    (select count(*) from public.quiz_attempts qa where qa.user_id = p.id) as quizzes_taken,
    (select avg( (qa.score::numeric / nullif((select count(*) from public.quiz_questions qq where qq.quiz_id = qa.quiz_id), 0)) * 100 )
       from public.quiz_attempts qa where qa.user_id = p.id) as avg_score
  from public.profiles p
  where public.has_role(auth.uid(), 'admin')
  order by attendance_days desc, quizzes_taken desc;
$$;
grant execute on function public.student_reports() to authenticated;

-- 9) ADMIN PASSCODE REDEMPTION
create table if not exists public.admin_config (
  id int primary key default 1,
  passcode_hash text not null,
  allowed_emails text[] not null default '{}',
  check (id = 1)
);
grant select on public.admin_config to authenticated;
grant all on public.admin_config to service_role;
alter table public.admin_config enable row level security;
-- No policies for anon/authenticated → only service_role and SECURITY DEFINER fns can read.

-- ═════════════════════════════════════════════════════════════════
-- 🛠  EDIT THE NEXT TWO LINES: your passcode + allowed educator emails
-- ═════════════════════════════════════════════════════════════════
insert into public.admin_config (id, passcode_hash, allowed_emails)
values (
  1,
  crypt('CHANGE-ME-PASSCODE', gen_salt('bf')),
  array['you@gmail.com']  -- add every educator email that may unlock admin
)
on conflict (id) do update set
  passcode_hash = excluded.passcode_hash,
  allowed_emails = excluded.allowed_emails;

-- Redeem passcode → grants 'admin' role to auth.uid() if email allowed + passcode matches
create or replace function public.redeem_admin_passcode(passcode text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare
  cfg public.admin_config%rowtype;
  my_email text;
begin
  select * into cfg from public.admin_config where id = 1;
  if cfg is null then return false; end if;

  select email into my_email from auth.users where id = auth.uid();
  if my_email is null then return false; end if;
  if not (lower(my_email) = any (select lower(x) from unnest(cfg.allowed_emails) x)) then return false; end if;

  if crypt(passcode, cfg.passcode_hash) <> cfg.passcode_hash then return false; end if;

  insert into public.user_roles (user_id, role) values (auth.uid(), 'admin')
  on conflict do nothing;
  return true;
end; $$;
grant execute on function public.redeem_admin_passcode(text) to authenticated;

-- 10) REALTIME publication
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.direct_messages;

-- 11) STORAGE BUCKETS (public)
insert into storage.buckets (id, name, public) values ('chat-files', 'chat-files', true)
  on conflict (id) do update set public = true;
insert into storage.buckets (id, name, public) values ('lessons', 'lessons', true)
  on conflict (id) do update set public = true;

-- Storage policies: authenticated users can upload; anyone can read.
drop policy if exists "public read chat-files" on storage.objects;
create policy "public read chat-files" on storage.objects for select using (bucket_id = 'chat-files');
drop policy if exists "auth insert chat-files" on storage.objects;
create policy "auth insert chat-files" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-files');
drop policy if exists "auth delete own chat-files" on storage.objects;
create policy "auth delete own chat-files" on storage.objects for delete to authenticated
  using (bucket_id = 'chat-files' and owner = auth.uid());

drop policy if exists "public read lessons" on storage.objects;
create policy "public read lessons" on storage.objects for select using (bucket_id = 'lessons');
drop policy if exists "admin insert lessons" on storage.objects;
create policy "admin insert lessons" on storage.objects for insert to authenticated
  with check (bucket_id = 'lessons' and public.has_role(auth.uid(), 'admin'));
drop policy if exists "admin delete lessons" on storage.objects;
create policy "admin delete lessons" on storage.objects for delete to authenticated
  using (bucket_id = 'lessons' and public.has_role(auth.uid(), 'admin'));

-- =============================================================
-- DONE. Next steps outside SQL:
--  ▸ Supabase Auth → Providers → enable Google + add client id/secret.
--  ▸ Supabase Auth → URL configuration → set Site URL to your deployed URL
--    and add http://localhost:5173 (or your preview URL) to Redirect URLs.
-- =============================================================
