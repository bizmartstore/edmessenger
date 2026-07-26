-- EdMessenger — classroom reactions, group replies, group quizzes, app feedback
-- Run after SUPABASE_MIGRATION_SOCIAL_TOOLS.sql

-- ═══════════════════════════════════════════
-- 1) Classroom chat reactions (like / emoticon)
-- ═══════════════════════════════════════════
create table if not exists public.classroom_msg_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null default '👍',
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
grant select, insert, update, delete on public.classroom_msg_reactions to authenticated;
grant all on public.classroom_msg_reactions to service_role;
alter table public.classroom_msg_reactions enable row level security;

drop policy if exists "cmsg react read" on public.classroom_msg_reactions;
create policy "cmsg react read" on public.classroom_msg_reactions
  for select to authenticated using (true);

drop policy if exists "cmsg react write" on public.classroom_msg_reactions;
create policy "cmsg react write" on public.classroom_msg_reactions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.toggle_classroom_msg_reaction(p_msg uuid, p_emoji text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  existing text;
  allowed text[] := array['👍','❤️','😂','🎉','🔥','👀'];
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if not (p_emoji = any(allowed)) then raise exception 'Invalid reaction'; end if;
  select emoji into existing from public.classroom_msg_reactions
  where message_id = p_msg and user_id = me;
  if existing is not null and existing = p_emoji then
    delete from public.classroom_msg_reactions where message_id = p_msg and user_id = me;
    return;
  end if;
  insert into public.classroom_msg_reactions (message_id, user_id, emoji)
  values (p_msg, me, p_emoji)
  on conflict (message_id, user_id) do update set emoji = excluded.emoji;
end;
$$;
grant execute on function public.toggle_classroom_msg_reaction(uuid, text) to authenticated;

create or replace function public.get_classroom_msg_reactions(p_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(message_id::text, emojis), '{}'::jsonb)
  from (
    select message_id,
      jsonb_object_agg(emoji, cnt) as emojis
    from (
      select message_id, emoji, count(*)::int as cnt
      from public.classroom_msg_reactions
      where message_id = any(p_ids)
      group by message_id, emoji
    ) t
    group by message_id
  ) x;
$$;
grant execute on function public.get_classroom_msg_reactions(uuid[]) to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.classroom_msg_reactions;
exception when duplicate_object then null; when others then null; end $$;

-- ═══════════════════════════════════════════
-- 2) Group chat replies
-- ═══════════════════════════════════════════
alter table public.group_messages
  add column if not exists reply_to_id uuid,
  add column if not exists reply_to_content text,
  add column if not exists reply_to_name text;

create or replace function public.soft_delete_group_message(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  owner uuid;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  select user_id into owner from public.group_messages where id = p_id;
  if owner is null then raise exception 'Message not found'; end if;
  if owner <> me and not public.has_role(me, 'admin') then
    raise exception 'Not allowed';
  end if;
  update public.group_messages
  set
    deleted_at = now(),
    content = '',
    attachments = null,
    meta = null,
    reply_to_content = null
  where id = p_id;
end;
$$;
grant execute on function public.soft_delete_group_message(uuid) to authenticated;

-- ═══════════════════════════════════════════
-- 3) Group quizzes (owner creates, members take)
-- ═══════════════════════════════════════════
create table if not exists public.group_quizzes (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.chat_groups(id) on delete cascade,
  title text not null,
  description text,
  published boolean not null default false,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (length(trim(title)) >= 2),
  check (length(title) <= 120)
);
create index if not exists group_quizzes_group_idx on public.group_quizzes (group_id, created_at desc);
grant select, insert, update, delete on public.group_quizzes to authenticated;
grant all on public.group_quizzes to service_role;
alter table public.group_quizzes enable row level security;

drop policy if exists "gq read" on public.group_quizzes;
create policy "gq read" on public.group_quizzes
  for select to authenticated
  using (
    exists (
      select 1 from public.chat_group_members m
      where m.group_id = group_quizzes.group_id and m.user_id = auth.uid()
    )
  );

drop policy if exists "gq owner write" on public.group_quizzes;
create policy "gq owner write" on public.group_quizzes
  for all to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.chat_groups g
      where g.id = group_quizzes.group_id and g.created_by = auth.uid()
    )
    or public.has_role(auth.uid(), 'admin')
  )
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.chat_groups g
      where g.id = group_quizzes.group_id and g.created_by = auth.uid()
    )
  );

create table if not exists public.group_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.group_quizzes(id) on delete cascade,
  question text not null,
  options jsonb not null,
  correct_index int not null default 0,
  order_index int not null default 0,
  check (length(trim(question)) >= 1),
  check (correct_index >= 0)
);
create index if not exists group_quiz_questions_quiz_idx on public.group_quiz_questions (quiz_id, order_index);
grant select, insert, update, delete on public.group_quiz_questions to authenticated;
grant all on public.group_quiz_questions to service_role;
alter table public.group_quiz_questions enable row level security;

drop policy if exists "gqq read" on public.group_quiz_questions;
create policy "gqq read" on public.group_quiz_questions
  for select to authenticated
  using (
    exists (
      select 1
      from public.group_quizzes q
      join public.chat_group_members m on m.group_id = q.group_id
      where q.id = group_quiz_questions.quiz_id and m.user_id = auth.uid()
    )
  );

drop policy if exists "gqq owner write" on public.group_quiz_questions;
create policy "gqq owner write" on public.group_quiz_questions
  for all to authenticated
  using (
    exists (
      select 1
      from public.group_quizzes q
      join public.chat_groups g on g.id = q.group_id
      where q.id = group_quiz_questions.quiz_id
        and (g.created_by = auth.uid() or public.has_role(auth.uid(), 'admin'))
    )
  )
  with check (
    exists (
      select 1
      from public.group_quizzes q
      join public.chat_groups g on g.id = q.group_id
      where q.id = group_quiz_questions.quiz_id and g.created_by = auth.uid()
    )
  );

create table if not exists public.group_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.group_quizzes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  score int not null default 0,
  created_at timestamptz not null default now(),
  unique (quiz_id, user_id)
);
grant select, insert, update on public.group_quiz_attempts to authenticated;
grant all on public.group_quiz_attempts to service_role;
alter table public.group_quiz_attempts enable row level security;

drop policy if exists "gqa read" on public.group_quiz_attempts;
create policy "gqa read" on public.group_quiz_attempts
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_role(auth.uid(), 'admin')
    or exists (
      select 1
      from public.group_quizzes q
      join public.chat_groups g on g.id = q.group_id
      where q.id = group_quiz_attempts.quiz_id and g.created_by = auth.uid()
    )
  );

drop policy if exists "gqa insert" on public.group_quiz_attempts;
create policy "gqa insert" on public.group_quiz_attempts
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.group_quizzes q
      join public.chat_group_members m on m.group_id = q.group_id
      where q.id = group_quiz_attempts.quiz_id
        and q.published = true
        and m.user_id = auth.uid()
    )
  );

drop policy if exists "gqa update" on public.group_quiz_attempts;
create policy "gqa update" on public.group_quiz_attempts
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.list_group_quiz_results(p_quiz uuid)
returns table (
  user_id uuid,
  full_name text,
  avatar_url text,
  score int,
  total int,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.user_id,
    p.full_name,
    p.avatar_url,
    a.score,
    (select count(*)::int from public.group_quiz_questions qq where qq.quiz_id = a.quiz_id) as total,
    a.created_at
  from public.group_quiz_attempts a
  join public.profiles p on p.id = a.user_id
  join public.group_quizzes q on q.id = a.quiz_id
  join public.chat_groups g on g.id = q.group_id
  where a.quiz_id = p_quiz
    and (
      g.created_by = auth.uid()
      or public.has_role(auth.uid(), 'admin')
      or a.user_id = auth.uid()
    )
  order by a.score desc, a.created_at asc;
$$;
grant execute on function public.list_group_quiz_results(uuid) to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.group_quizzes;
exception when duplicate_object then null; when others then null; end $$;

-- ═══════════════════════════════════════════
-- 4) App feedback (student suggestions)
-- ═══════════════════════════════════════════
create table if not exists public.app_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null default 'feature',
  title text not null,
  body text not null,
  status text not null default 'new',
  admin_note text,
  created_at timestamptz not null default now(),
  check (category in ('feature', 'bug', 'improvement', 'other')),
  check (status in ('new', 'reviewed', 'planned', 'done', 'archived')),
  check (length(trim(title)) >= 2 and length(title) <= 120),
  check (length(trim(body)) >= 5 and length(body) <= 2000)
);
create index if not exists app_feedback_created_idx on public.app_feedback (created_at desc);
create index if not exists app_feedback_status_idx on public.app_feedback (status, created_at desc);
grant select, insert, update on public.app_feedback to authenticated;
grant all on public.app_feedback to service_role;
alter table public.app_feedback enable row level security;

drop policy if exists "feedback read" on public.app_feedback;
create policy "feedback read" on public.app_feedback
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "feedback insert" on public.app_feedback;
create policy "feedback insert" on public.app_feedback
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "feedback admin update" on public.app_feedback;
create policy "feedback admin update" on public.app_feedback
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

do $$ begin
  alter publication supabase_realtime add table public.app_feedback;
exception when duplicate_object then null; when others then null; end $$;
