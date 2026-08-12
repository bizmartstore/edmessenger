-- Quiz timer + anti-cheat (tab switching) support
-- Run this in your Supabase SQL editor.

alter table public.quizzes
  add column if not exists time_limit_seconds int not null default 0;

alter table public.quiz_attempts
  add column if not exists submitted boolean not null default true,
  add column if not exists auto_submitted boolean not null default false,
  add column if not exists tab_switches int not null default 0,
  add column if not exists updated_at timestamptz not null default now();
