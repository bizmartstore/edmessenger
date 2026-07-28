-- EdMessenger - profile name parts and private academic records
-- Run in Supabase SQL Editor after existing migrations.

alter table public.profiles
  add column if not exists last_name text,
  add column if not exists first_name text,
  add column if not exists middle_name text;

create table if not exists public.academic_quiz_scores (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  score numeric not null default 0,
  max_score numeric not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists academic_quiz_scores_student_idx
  on public.academic_quiz_scores (student_id, created_at desc);
grant select, insert, update, delete on public.academic_quiz_scores to authenticated;
grant all on public.academic_quiz_scores to service_role;
alter table public.academic_quiz_scores enable row level security;

drop policy if exists "academic quiz scores read own or admin" on public.academic_quiz_scores;
create policy "academic quiz scores read own or admin" on public.academic_quiz_scores
  for select to authenticated
  using (student_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "academic quiz scores admin write" on public.academic_quiz_scores;
create policy "academic quiz scores admin write" on public.academic_quiz_scores
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create table if not exists public.academic_performance_scores (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  score numeric not null default 0,
  max_score numeric not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists academic_performance_scores_student_idx
  on public.academic_performance_scores (student_id, created_at desc);
grant select, insert, update, delete on public.academic_performance_scores to authenticated;
grant all on public.academic_performance_scores to service_role;
alter table public.academic_performance_scores enable row level security;

drop policy if exists "academic performance scores read own or admin" on public.academic_performance_scores;
create policy "academic performance scores read own or admin" on public.academic_performance_scores
  for select to authenticated
  using (student_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "academic performance scores admin write" on public.academic_performance_scores;
create policy "academic performance scores admin write" on public.academic_performance_scores
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create table if not exists public.academic_term_grades (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  term_no int not null check (term_no in (1, 2, 3)),
  grade_value text not null,
  created_at timestamptz not null default now(),
  unique (student_id, term_no)
);
create index if not exists academic_term_grades_student_idx
  on public.academic_term_grades (student_id, term_no);
grant select, insert, update, delete on public.academic_term_grades to authenticated;
grant all on public.academic_term_grades to service_role;
alter table public.academic_term_grades enable row level security;

drop policy if exists "academic term grades read own or admin" on public.academic_term_grades;
create policy "academic term grades read own or admin" on public.academic_term_grades
  for select to authenticated
  using (student_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "academic term grades admin write" on public.academic_term_grades;
create policy "academic term grades admin write" on public.academic_term_grades
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
