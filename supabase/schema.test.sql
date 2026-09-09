-- ---------------------------------------------------------------------------
-- Behavioural tests for the booking rules. Run them with supabase/run-tests.sh.
-- Run against a throwaway Postgres that already has stub.sql + schema.sql.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on
set client_min_messages to warning;

create or replace function t_fails(stmt text, needle text) returns text
language plpgsql as $$
begin
  execute stmt;
  return format('FAIL  expected an error mentioning "%s", statement succeeded', needle);
exception when others then
  if position(lower(needle) in lower(sqlerrm)) > 0 then
    return format('ok    rejected: %s', needle);
  end if;
  return format('FAIL  wrong error for "%s" -> %s', needle, sqlerrm);
end $$;

create or replace function t_works(stmt text, label text) returns text
language plpgsql as $$
begin
  execute stmt;
  return format('ok    %s', label);
exception when others then
  return format('FAIL  %s -> %s', label, sqlerrm);
end $$;

-- Two members and an admin -------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ada@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'grace@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'admin@example.com');
update public.profiles set is_admin = true, tier = 'founder' where email = 'admin@example.com';

-- A club-local helper: tomorrow at a given wall-clock time -------------------
create or replace function t_at(days int, wall text) returns timestamptz
language sql stable as $$
  select (((now() at time zone public.club_tz())::date + days) + wall::time)
         at time zone public.club_tz()
$$;
create or replace function t_range(days int, from_t text, to_t text) returns tstzrange
language sql stable as $$ select tstzrange(t_at(days, from_t), t_at(days, to_t), '[)') $$;

create or replace function t_room(nm text) returns uuid
language sql stable as $$ select id from public.rooms where name = nm $$;

\echo ''
\echo '--- Booking as an ordinary member ---'
select set_config('test.uid', '11111111-1111-1111-1111-111111111111', false);

select t_works($$insert into public.bookings (room_id, user_id, during, title)
  values (t_room('The Boardroom'), '11111111-1111-1111-1111-111111111111', t_range(1, '10:00', '12:00'), 'Board meeting')$$,
  'member books 10:00-12:00 tomorrow');

\echo ''
\echo '--- Double-booking is impossible ---'
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', false);

select t_fails($$insert into public.bookings (room_id, user_id, during)
  values (t_room('The Boardroom'), '22222222-2222-2222-2222-222222222222', t_range(1, '11:00', '12:00'))$$,
  'conflicting key value');

select t_fails($$insert into public.bookings (room_id, user_id, during)
  values (t_room('The Boardroom'), '22222222-2222-2222-2222-222222222222', t_range(1, '09:00', '10:30'))$$,
  'conflicting key value');

select t_fails($$insert into public.bookings (room_id, user_id, during)
  values (t_room('The Boardroom'), '22222222-2222-2222-2222-222222222222', t_range(1, '10:30', '11:00'))$$,
  'conflicting key value');

select t_works($$insert into public.bookings (room_id, user_id, during)
  values (t_room('The Boardroom'), '22222222-2222-2222-2222-222222222222', t_range(1, '12:00', '13:00'))$$,
  'a booking may start exactly when another ends');

select t_works($$insert into public.bookings (room_id, user_id, during)
  values (t_room('The Study'), '22222222-2222-2222-2222-222222222222', t_range(1, '10:00', '11:00'))$$,
  'same time in a different room is fine');

\echo ''
\echo '--- Tier rules ---'
select set_config('test.uid', '11111111-1111-1111-1111-111111111111', false);

select t_fails($$insert into public.bookings (room_id, user_id, during)
  values (t_room('The Study'), '11111111-1111-1111-1111-111111111111', t_range(1, '14:00', '17:00'))$$,
  'hours in a single booking');

select t_fails($$insert into public.bookings (room_id, user_id, during)
  values (t_room('The Study'), '11111111-1111-1111-1111-111111111111', t_range(-1, '14:00', '15:00'))$$,
  'in the past');

select t_fails($$insert into public.bookings (room_id, user_id, during)
  values (t_room('The Study'), '11111111-1111-1111-1111-111111111111', t_range(60, '14:00', '15:00'))$$,
  'days ahead');

select t_fails($$insert into public.bookings (room_id, user_id, during)
  values (t_room('The Study'), '11111111-1111-1111-1111-111111111111', t_range(1, '06:00', '07:00'))$$,
  'is open');

select t_fails($$insert into public.bookings (room_id, user_id, during)
  values (t_room('The Study'), '11111111-1111-1111-1111-111111111111', t_range(1, '20:30', '21:30'))$$,
  'is open');

select t_fails($$insert into public.bookings (room_id, user_id, during)
  values (t_room('The Study'), '11111111-1111-1111-1111-111111111111', t_range(1, '14:10', '15:10'))$$,
  '30-minute slots');

select t_fails($$insert into public.bookings (room_id, user_id, during)
  values (t_room('The Study'), '11111111-1111-1111-1111-111111111111', t_range(1, '14:00', '14:00'))$$,
  'bookings_during_check');

\echo ''
\echo '--- You can only book for yourself ---'
select t_fails($$insert into public.bookings (room_id, user_id, during)
  values (t_room('The Snug'), '22222222-2222-2222-2222-222222222222', t_range(2, '14:00', '15:00'))$$,
  'only book for yourself');

\echo ''
\echo '--- Concurrent booking limit (member tier allows 2) ---'
select t_works($$insert into public.bookings (room_id, user_id, during)
  values (t_room('The Snug'), '11111111-1111-1111-1111-111111111111', t_range(2, '14:00', '15:00'))$$,
  'second upcoming booking allowed');
select t_fails($$insert into public.bookings (room_id, user_id, during)
  values (t_room('The Snug'), '11111111-1111-1111-1111-111111111111', t_range(3, '14:00', '15:00'))$$,
  'upcoming bookings');

\echo ''
\echo '--- An admin can move someone to another tier ---'
select set_config('test.uid', '33333333-3333-3333-3333-333333333333', false);
update public.profiles set tier = 'resident' where email = 'grace@example.com';
select case when (select tier from public.profiles where email = 'grace@example.com') = 'resident'
       then 'ok    admin upgraded a member''s tier'
       else 'FAIL  admin could not change a tier' end;

\echo ''
\echo '--- Cancelling frees the room ---'
select t_works($$update public.bookings set status = 'cancelled'
  where user_id = '11111111-1111-1111-1111-111111111111' and during = t_range(1, '10:00', '12:00')$$,
  'member cancels their own booking');

select set_config('test.uid', '22222222-2222-2222-2222-222222222222', false);
select t_works($$insert into public.bookings (room_id, user_id, during)
  values (t_room('The Boardroom'), '22222222-2222-2222-2222-222222222222', t_range(1, '11:00', '12:00'))$$,
  'the freed slot can be booked by someone else');

\echo ''
\echo '--- A booking cannot be quietly moved or reinstated ---'
select t_fails($$update public.bookings set during = t_range(1, '15:00', '16:00')
  where user_id = '22222222-2222-2222-2222-222222222222' and during = t_range(1, '11:00', '12:00')$$,
  'Cancel the booking');

select set_config('test.uid', '11111111-1111-1111-1111-111111111111', false);
select t_fails($$update public.bookings set status = 'confirmed'
  where user_id = '11111111-1111-1111-1111-111111111111' and status = 'cancelled'$$,
  'cannot be reinstated');

\echo ''
\echo '--- Blackouts ---'
select set_config('test.uid', '33333333-3333-3333-3333-333333333333', false);
select t_works($$insert into public.blackouts (room_id, during, reason)
  values (t_room('The Study'), t_range(4, '09:00', '23:00'), 'Private event')$$,
  'admin blocks out The Study');

select set_config('test.uid', '11111111-1111-1111-1111-111111111111', false);
select t_fails($$insert into public.bookings (room_id, user_id, during)
  values (t_room('The Study'), '11111111-1111-1111-1111-111111111111', t_range(4, '14:00', '15:00'))$$,
  'blocked out');

\echo ''
\echo '--- A blackout clears bookings already inside it ---'
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', false);
select t_works($$insert into public.bookings (room_id, user_id, during)
  values (t_room('The Snug'), '22222222-2222-2222-2222-222222222222', t_range(5, '15:00', '16:00'))$$,
  'member books The Snug');
select set_config('test.uid', '33333333-3333-3333-3333-333333333333', false);
select t_works($$insert into public.blackouts (room_id, during, reason)
  values (t_room('The Snug'), t_range(5, '12:00', '18:00'), 'Maintenance')$$,
  'admin blocks the same window');
select case when (select status from public.bookings
                  where room_id = t_room('The Snug') and during = t_range(5, '15:00', '16:00')) = 'cancelled'
       then 'ok    the booking inside it was cancelled'
       else 'FAIL  booking survived the blackout' end;

\echo ''
\echo '--- Admins may overrun the member rules, but not a blackout ---'
select t_works($$insert into public.bookings (room_id, user_id, during, created_by_admin)
  values (t_room('The Boardroom'), '33333333-3333-3333-3333-333333333333', t_range(45, '08:00', '14:00'), true)$$,
  'admin books 6 hours, 45 days out');
select t_fails($$insert into public.bookings (room_id, user_id, during)
  values (t_room('The Snug'), '33333333-3333-3333-3333-333333333333', t_range(5, '13:00', '14:00'))$$,
  'blocked out');

\echo ''
\echo '--- Even an admin cannot double-book ---'
select t_fails($$insert into public.bookings (room_id, user_id, during)
  values (t_room('The Boardroom'), '33333333-3333-3333-3333-333333333333', t_range(1, '11:30', '12:30'))$$,
  'conflicting key value');

\echo ''
\echo '--- Monthly hour allowance (member tier: 8 hrs) ---'
select set_config('test.uid', '33333333-3333-3333-3333-333333333333', false);
update public.membership_tiers set max_active_bookings = 50 where slug = 'member';
select set_config('test.uid', '11111111-1111-1111-1111-111111111111', false);
delete from public.bookings where user_id = '11111111-1111-1111-1111-111111111111';
select t_works($$insert into public.bookings (room_id, user_id, during)
  select t_room('The Boardroom'), '11111111-1111-1111-1111-111111111111', t_range(d, '15:00', '17:00')
  from generate_series(6, 9) d$$, 'four 2-hour bookings = 8 hours');
select t_fails($$insert into public.bookings (room_id, user_id, during)
  values (t_room('The Boardroom'), '11111111-1111-1111-1111-111111111111', t_range(10, '15:00', '16:00'))$$,
  'hours this month');

\echo ''
\echo '--- Members cannot promote themselves ---'
select set_config('test.uid', '11111111-1111-1111-1111-111111111111', false);
update public.profiles set is_admin = true, tier = 'founder'
  where id = '11111111-1111-1111-1111-111111111111';
select case when (select is_admin or tier <> 'member' from public.profiles
                  where id = '11111111-1111-1111-1111-111111111111')
       then 'FAIL  a member promoted themselves'
       else 'ok    self-promotion silently ignored' end;

\echo ''
\echo '--- availability() hides who booked what ---'
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', false);
select case when count(*) filter (where kind = 'busy' and label <> 'Booked') = 0
        and count(*) filter (where kind = 'mine') > 0
       then 'ok    other members show as "Booked" with no identity'
       else 'FAIL  availability leaked booking owners' end
from public.availability(now(), now() + interval '60 days');

select case when count(*) > 0 then 'ok    blackouts appear in availability'
            else 'FAIL  blackouts missing from availability' end
from public.availability(now(), now() + interval '60 days') where kind = 'blocked';

\echo ''
\echo '--- A club-wide blackout covers every room ---'
select set_config('test.uid', '33333333-3333-3333-3333-333333333333', false);
select t_works($$insert into public.blackouts (room_id, during, reason)
  values (null, t_range(11, '00:00', '23:59'), 'Club closed')$$, 'admin closes the whole club');
select case when count(distinct room_id) = (select count(*) from public.rooms)
       then 'ok    it blocks every room'
       else 'FAIL  club-wide blackout did not cover all rooms' end
from public.availability(t_at(11, '08:00'), t_at(11, '20:00')) where kind = 'blocked';
select set_config('test.uid', '11111111-1111-1111-1111-111111111111', false);
select t_fails($$insert into public.bookings (room_id, user_id, during)
  values (t_room('The Study'), '11111111-1111-1111-1111-111111111111', t_range(11, '14:00', '15:00'))$$,
  'blocked out');
