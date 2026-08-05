-- EdMessenger - sections + quick gradebook (assessments & summative tests)
-- Run in Supabase SQL Editor after existing migrations.

-- 1) Section on each student profile
alter table public.profiles
  add column if not exists section text;
create index if not exists profiles_section_idx on public.profiles (section);

-- 2) Summative test scores (same shape as quiz/performance)
create table if not exists public.academic_summative_scores (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  score numeric not null default 0,
  max_score numeric not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists academic_summative_scores_student_idx
  on public.academic_summative_scores (student_id, created_at desc);
grant select, insert, update, delete on public.academic_summative_scores to authenticated;
grant all on public.academic_summative_scores to service_role;
alter table public.academic_summative_scores enable row level security;

drop policy if exists "academic summative scores read own or admin" on public.academic_summative_scores;
create policy "academic summative scores read own or admin" on public.academic_summative_scores
  for select to authenticated
  using (student_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "academic summative scores admin write" on public.academic_summative_scores;
create policy "academic summative scores admin write" on public.academic_summative_scores
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- 3) Assessment roster (Quiz 1, Quiz 2, Performance 1, Summative 1 ...) per section
create table if not exists public.academic_assessments (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('quiz', 'performance', 'summative')),
  section text,
  title text not null,
  max_score numeric not null default 100,
  created_at timestamptz not null default now(),
  unique (kind, section, title)
);
create index if not exists academic_assessments_kind_section_idx
  on public.academic_assessments (kind, section, created_at);
grant select, insert, update, delete on public.academic_assessments to authenticated;
grant all on public.academic_assessments to service_role;
alter table public.academic_assessments enable row level security;

drop policy if exists "academic assessments readable" on public.academic_assessments;
create policy "academic assessments readable" on public.academic_assessments
  for select to authenticated using (true);

drop policy if exists "academic assessments admin write" on public.academic_assessments;
create policy "academic assessments admin write" on public.academic_assessments
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
