-- Unread counts v2: include published reviewers in lessons badge + expose total
-- Run once in Supabase SQL Editor (after SUPABASE_MIGRATION_PROFILE_BANNERS.sql
-- and SUPABASE_MIGRATION_REVIEWERS.sql).

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
  c_reviewers int;
  c_quizzes int;
  c_announcements int;
  c_chat int;
  c_total int;
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

  -- New published reviewers also bump the Lessons tab badge
  select count(*)::int into c_reviewers
  from public.reviewers
  where published and created_at > lr_lessons;

  c_lessons := c_lessons + c_reviewers;

  select count(*)::int into c_quizzes
  from public.quizzes
  where published and created_at > lr_quizzes;

  select count(*)::int into c_announcements
  from public.announcements
  where created_at > lr_announcements;

  c_chat := c_classroom + c_dms;
  c_total := c_chat + c_activities + c_lessons + c_quizzes + c_announcements;

  return jsonb_build_object(
    'classroom', c_classroom,
    'dms', c_dms,
    'chat', c_chat,
    'activities', c_activities,
    'lessons', c_lessons,
    'quizzes', c_quizzes,
    'announcements', c_announcements,
    'total', c_total
  );
end;
$$;

grant execute on function public.get_unread_counts() to authenticated;
