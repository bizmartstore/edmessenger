-- Live content updates (announcements / lessons / quizzes / activities)
-- Run once in Supabase SQL Editor after the base setup.
-- Realtime uses websockets — it does NOT burn REST row quota like polling would.

do $$
begin
  begin
    alter publication supabase_realtime add table public.announcements;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.activities;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.lessons;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.quizzes;
  exception when duplicate_object then null;
  end;
end $$;
