-- EdMessenger quota + admin updates
-- Run this in the Supabase SQL editor (https://ijxoffbsedvcqbqeohju.supabase.co)

-- 1) Primary admin email (no passcode required)
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

-- Keep allow-list in sync (optional; passcode path still exists but unused by UI)
update public.admin_config
set allowed_emails = array['sheethappenswithjaa@gmail.com', 'sheethappenwithjaa@gmail.com']
where id = 1;

-- 2) Keep only the latest 50 classroom messages (deletes older rows + helps DB quota)
create or replace function public.prune_classroom_messages()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.messages
  where id in (
    select id from public.messages
    order by created_at desc
    offset 50
  );
end;
$$;
grant execute on function public.prune_classroom_messages() to authenticated;

-- 3) Keep only the latest 50 messages per DM thread (auth user ↔ peer)
create or replace function public.prune_dm_thread(peer uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or peer is null then return; end if;
  delete from public.direct_messages
  where id in (
    select id from public.direct_messages
    where (sender_id = me and recipient_id = peer)
       or (sender_id = peer and recipient_id = me)
    order by created_at desc
    offset 50
  );
end;
$$;
grant execute on function public.prune_dm_thread(uuid) to authenticated;

-- 4) Attendance: only admins may insert / manage check-ins
drop policy if exists "att self insert" on public.attendance;
create policy "att admin insert" on public.attendance for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin'));

-- Admins can also insert for any student (roster tools)
drop policy if exists "att admin update" on public.attendance;
create policy "att admin update" on public.attendance for update to authenticated
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "att admin delete" on public.attendance;
create policy "att admin delete" on public.attendance for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- 5) Helper for admin to mark a student present
create or replace function public.admin_mark_attendance(student uuid, d date default (now() at time zone 'utc')::date)
returns public.attendance
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.attendance;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'admin only';
  end if;
  insert into public.attendance (user_id, date)
  values (student, d)
  on conflict (user_id, date) do update set checked_in_at = now()
  returning * into row;
  return row;
end;
$$;
grant execute on function public.admin_mark_attendance(uuid, date) to authenticated;

-- Ensure primary admin is granted if they already have an auth user
insert into public.user_roles (user_id, role)
select id, 'admin'::public.app_role
from auth.users
where lower(email) in (
  lower('sheethappenswithjaa@gmail.com'),
  lower('sheethappenwithjaa@gmail.com')
)
on conflict do nothing;
