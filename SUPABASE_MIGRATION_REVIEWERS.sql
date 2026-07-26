-- Lesson reviewers: quiz-style practice with explanations (linked to lessons).
-- Run after SUPABASE_SETUP.sql (and prior migrations).

create table if not exists public.reviewers (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid references public.lessons(id) on delete set null,
  title text not null,
  description text,
  published boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

grant select on public.reviewers to authenticated;
grant insert, update, delete on public.reviewers to authenticated;
grant all on public.reviewers to service_role;
alter table public.reviewers enable row level security;

drop policy if exists "reviewers read published or admin" on public.reviewers;
create policy "reviewers read published or admin" on public.reviewers for select to authenticated
  using (published or public.has_role(auth.uid(), 'admin'));

drop policy if exists "reviewers admin write" on public.reviewers;
create policy "reviewers admin write" on public.reviewers for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create table if not exists public.reviewer_questions (
  id uuid primary key default gen_random_uuid(),
  reviewer_id uuid not null references public.reviewers(id) on delete cascade,
  question text not null,
  options jsonb not null,
  correct_index int not null default 0,
  explanation text,
  order_index int not null default 0
);

grant select on public.reviewer_questions to authenticated;
grant insert, update, delete on public.reviewer_questions to authenticated;
grant all on public.reviewer_questions to service_role;
alter table public.reviewer_questions enable row level security;

drop policy if exists "rq read if reviewer visible" on public.reviewer_questions;
create policy "rq read if reviewer visible" on public.reviewer_questions for select to authenticated
  using (
    exists (
      select 1 from public.reviewers r
      where r.id = reviewer_id
        and (r.published or public.has_role(auth.uid(), 'admin'))
    )
  );

drop policy if exists "rq admin write" on public.reviewer_questions;
create policy "rq admin write" on public.reviewer_questions for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Optional best-score tracking (practice can be retaken; upsert keeps latest)
create table if not exists public.reviewer_attempts (
  id uuid primary key default gen_random_uuid(),
  reviewer_id uuid not null references public.reviewers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  score int not null default 0,
  created_at timestamptz not null default now(),
  unique (reviewer_id, user_id)
);

grant select, insert, update on public.reviewer_attempts to authenticated;
grant all on public.reviewer_attempts to service_role;
alter table public.reviewer_attempts enable row level security;

drop policy if exists "reviewer attempts self read" on public.reviewer_attempts;
create policy "reviewer attempts self read" on public.reviewer_attempts for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "reviewer attempts self insert" on public.reviewer_attempts;
create policy "reviewer attempts self insert" on public.reviewer_attempts for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "reviewer attempts self update" on public.reviewer_attempts;
create policy "reviewer attempts self update" on public.reviewer_attempts for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Realtime (ignore if already added)
do $$
begin
  alter publication supabase_realtime add table public.reviewers;
exception when duplicate_object then null;
end $$;
