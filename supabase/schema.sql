-- ============================================================================
-- Three Cities Social — room booking schema
-- Run this once in the Supabase SQL editor on a fresh project.
-- Safe to re-run: everything is idempotent.
-- ============================================================================

create extension if not exists btree_gist;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Club settings (single row)
-- ---------------------------------------------------------------------------
create table if not exists public.settings (
  id            boolean primary key default true check (id),
  club_name     text        not null default 'Three Cities Social',
  timezone      text        not null default 'America/New_York',
  support_email text        not null default 'hello@threecitiessocial.com',
  reminder_minutes integer  not null default 60,   -- how long before a slot to nudge
  updated_at    timestamptz not null default now()
);
alter table public.settings add column if not exists reminder_minutes integer not null default 60;
insert into public.settings (id) values (true) on conflict (id) do nothing;

create or replace function public.club_tz() returns text
language sql stable as $$ select timezone from public.settings where id $$;

-- ---------------------------------------------------------------------------
-- Membership tiers — these carry the booking rules
-- ---------------------------------------------------------------------------
create table if not exists public.membership_tiers (
  slug                  text primary key,
  name                  text    not null,
  can_book              boolean not null default true,
  max_hours_per_booking numeric not null default 2,      -- length of any one booking
  max_advance_days      integer not null default 14,     -- how far ahead they may book
  max_active_bookings   integer not null default 3,      -- concurrent upcoming bookings
  max_hours_per_month   numeric,                         -- null = unlimited
  sort_order            integer not null default 0
);

insert into public.membership_tiers
  (slug, name, can_book, max_hours_per_booking, max_advance_days, max_active_bookings, max_hours_per_month, sort_order)
values
  ('guest',    'Guest',            false, 0,  0,  0, 0,    0),
  ('member',   'Member',           true,  2,  14, 2, 8,    1),
  ('resident', 'Resident Member',  true,  4,  30, 5, 40,   2),
  ('founder',  'Founding Member',  true,  8,  60, 10, null, 3)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Profiles — one per auth user
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  full_name  text,
  phone      text,
  tier       text not null default 'member' references public.membership_tiers (slug),
  is_admin   boolean not null default false,
  notify_email boolean not null default true,
  notify_push  boolean not null default true,
  created_at timestamptz not null default now()
);

-- Auto-create a profile whenever someone signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Members may edit their own name/phone/notification prefs but never their own
-- tier or admin flag. Enforced here so no RLS policy has to be clever about it.
create or replace function public.guard_profile_self_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null for the SQL editor, the service_role key and psql —
  -- trusted, out-of-band sessions. That is how the first admin gets made, and
  -- how support scripts fix a tier. Anyone arriving through the app has a uid.
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  new.tier     := old.tier;
  new.is_admin := old.is_admin;
  new.email    := old.email;
  return new;
end $$;

drop trigger if exists profiles_guard_self_update on public.profiles;
create trigger profiles_guard_self_update
  before update on public.profiles
  for each row execute function public.guard_profile_self_update();

-- Security-definer admin check: keeps RLS policies from recursing on profiles.
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = uid), false)
$$;

-- ---------------------------------------------------------------------------
-- Rooms
-- ---------------------------------------------------------------------------
create table if not exists public.rooms (
  id            uuid primary key default gen_random_uuid(),
  name          text    not null,
  description   text,
  capacity      integer not null default 4,
  color         text    not null default '#427179',
  opens_at      time    not null default '09:00',
  closes_at     time    not null default '21:00',
  slot_minutes  integer not null default 30 check (slot_minutes in (15, 30, 60)),
  min_minutes   integer not null default 30,
  allowed_tiers text[],                                  -- null = every tier that can_book
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  check (closes_at > opens_at)
);

insert into public.rooms (name, description, capacity, color, opens_at, closes_at, sort_order)
select * from (values
  ('The Boardroom', 'Long table, screen, door that shuts. Best for pitches and board meetings.', 10, '#427179', '08:00'::time, '21:00'::time, 1),
  ('The Study',     'Quiet two-to-four seater off the lounge. Calls, one-to-ones, focused work.',  4, '#6B582A', '08:00'::time, '21:00'::time, 2),
  ('The Snug',      'Soft seating for three. Informal, warm, good for interviews.',                3, '#984929', '09:00'::time, '22:00'::time, 3)
) as seed
where not exists (select 1 from public.rooms);

-- ---------------------------------------------------------------------------
-- Blackouts — private events, maintenance, staff holds
-- ---------------------------------------------------------------------------
create table if not exists public.blackouts (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid references public.rooms (id) on delete cascade,  -- null = every room
  during     tstzrange not null,
  reason     text not null default 'Closed',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (not isempty(during) and lower(during) is not null and upper(during) is not null)
);

create index if not exists blackouts_during_idx on public.blackouts using gist (during);
create index if not exists blackouts_room_idx   on public.blackouts (room_id);

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------
create table if not exists public.bookings (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.rooms (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  during       tstzrange not null,
  title        text,
  status       text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_by_admin boolean not null default false,
  created_at   timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete set null,
  confirmation_sent_at timestamptz,
  reminder_sent_at     timestamptz,
  check (not isempty(during) and lower(during) is not null and upper(during) is not null)
);

-- ===== The line that makes double-booking impossible ========================
-- Postgres itself refuses two confirmed bookings whose time ranges overlap in
-- the same room. Not application logic, not a check-then-insert race: the
-- index rejects the second writer even under simultaneous requests.
alter table public.bookings drop constraint if exists bookings_no_overlap;
alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (room_id with =, during with &&)
  where (status = 'confirmed');
-- ============================================================================

create index if not exists bookings_during_idx on public.bookings using gist (during);
create index if not exists bookings_user_idx   on public.bookings (user_id, status);
create index if not exists bookings_room_idx   on public.bookings (room_id, status);

-- ---------------------------------------------------------------------------
-- Booking rules, enforced in the database
-- ---------------------------------------------------------------------------
create or replace function public.enforce_booking_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_room      public.rooms%rowtype;
  v_profile   public.profiles%rowtype;
  v_tier      public.membership_tiers%rowtype;
  v_tz        text := public.club_tz();
  v_start     timestamptz := lower(new.during);
  v_end       timestamptz := upper(new.during);
  v_hours     numeric;
  v_is_admin  boolean := public.is_admin();
  v_local_start time;
  v_local_end   time;
  v_month_start timestamptz;
  v_month_end   timestamptz;
  v_used_hours  numeric;
  v_active      integer;
  v_blackout    text;
begin
  if new.status <> 'confirmed' then
    return new;
  end if;

  select * into v_room from public.rooms where id = new.room_id;
  if not found then
    raise exception 'That room no longer exists.' using errcode = 'P0001';
  end if;
  if not v_room.is_active and not v_is_admin then
    raise exception 'That room is not currently bookable.' using errcode = 'P0001';
  end if;

  select * into v_profile from public.profiles where id = new.user_id;
  if not found then
    raise exception 'No member profile found for this booking.' using errcode = 'P0001';
  end if;

  select * into v_tier from public.membership_tiers where slug = v_profile.tier;

  v_hours := extract(epoch from (v_end - v_start)) / 3600.0;
  if v_hours <= 0 then
    raise exception 'A booking must end after it starts.' using errcode = 'P0001';
  end if;

  -- Blackouts apply to everyone, admins included: if the room is closed for a
  -- private event, nobody is quietly booked into it.
  select coalesce(b.reason, 'Closed') into v_blackout
  from public.blackouts b
  where (b.room_id = new.room_id or b.room_id is null)
    and b.during && new.during
  limit 1;
  if v_blackout is not null then
    raise exception 'That time is blocked out (%).', v_blackout using errcode = 'P0001';
  end if;

  -- Admins may override every remaining rule (overruns, short notice, tiers).
  if v_is_admin then
    return new;
  end if;

  if new.user_id <> auth.uid() then
    raise exception 'You can only book for yourself.' using errcode = 'P0001';
  end if;

  if v_tier is null or not v_tier.can_book then
    raise exception 'Your membership does not include room booking. Contact the club to upgrade.'
      using errcode = 'P0001';
  end if;

  if v_room.allowed_tiers is not null and not (v_profile.tier = any (v_room.allowed_tiers)) then
    raise exception '% is not available on the % tier.', v_room.name, coalesce(v_tier.name, v_profile.tier)
      using errcode = 'P0001';
  end if;

  if v_start < now() then
    raise exception 'That slot is in the past.' using errcode = 'P0001';
  end if;

  if v_start > now() + make_interval(days => v_tier.max_advance_days) then
    raise exception 'You can book up to % days ahead on the % tier.', v_tier.max_advance_days, v_tier.name
      using errcode = 'P0001';
  end if;

  if v_hours > v_tier.max_hours_per_booking then
    raise exception 'The % tier allows up to % hours in a single booking.',
      v_tier.name, trim(to_char(v_tier.max_hours_per_booking, 'FM999990.99'))
      using errcode = 'P0001';
  end if;

  if v_hours * 60 < v_room.min_minutes then
    raise exception '% takes bookings of at least % minutes.', v_room.name, v_room.min_minutes
      using errcode = 'P0001';
  end if;

  -- Opening hours, read in the club's own timezone.
  v_local_start := (v_start at time zone v_tz)::time;
  v_local_end   := (v_end   at time zone v_tz)::time;
  if (v_start at time zone v_tz)::date <> (v_end at time zone v_tz)::date
     and v_local_end <> '00:00'::time then
    raise exception 'A booking has to start and end on the same day.' using errcode = 'P0001';
  end if;
  if v_local_start < v_room.opens_at
     or (v_local_end > v_room.closes_at and v_local_end <> '00:00'::time) then
    raise exception '% is open % to %.',
      v_room.name, to_char(v_room.opens_at, 'HH12:MIam'), to_char(v_room.closes_at, 'HH12:MIam')
      using errcode = 'P0001';
  end if;

  -- Slots must line up with the room's grid.
  if (extract(epoch from (v_start - date_trunc('day', v_start at time zone v_tz) at time zone v_tz))::bigint
      % (v_room.slot_minutes * 60)) <> 0
     or (extract(epoch from (v_end - v_start))::bigint % (v_room.slot_minutes * 60)) <> 0 then
    raise exception '% books in %-minute slots.', v_room.name, v_room.slot_minutes
      using errcode = 'P0001';
  end if;

  -- Concurrent upcoming bookings.
  select count(*) into v_active
  from public.bookings b
  where b.user_id = new.user_id
    and b.status = 'confirmed'
    and upper(b.during) > now()
    and b.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);
  if v_active >= v_tier.max_active_bookings then
    raise exception 'You already have % upcoming bookings, the limit on the % tier. Cancel one first.',
      v_active, v_tier.name using errcode = 'P0001';
  end if;

  -- Monthly hour allowance.
  if v_tier.max_hours_per_month is not null then
    v_month_start := date_trunc('month', v_start at time zone v_tz) at time zone v_tz;
    v_month_end   := (date_trunc('month', v_start at time zone v_tz) + interval '1 month') at time zone v_tz;
    select coalesce(sum(extract(epoch from (upper(b.during) - lower(b.during))) / 3600.0), 0)
      into v_used_hours
    from public.bookings b
    where b.user_id = new.user_id
      and b.status = 'confirmed'
      and b.during && tstzrange(v_month_start, v_month_end, '[)')
      and b.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);
    if v_used_hours + v_hours > v_tier.max_hours_per_month then
      raise exception 'That would use % of your % hours this month (% already booked).',
        trim(to_char(v_used_hours + v_hours, 'FM999990.99')),
        trim(to_char(v_tier.max_hours_per_month, 'FM999990.99')),
        trim(to_char(v_used_hours, 'FM999990.99'))
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists bookings_enforce_rules on public.bookings;
create trigger bookings_enforce_rules
  before insert or update on public.bookings
  for each row execute function public.enforce_booking_rules();

-- A member may only cancel; they may not edit a booking's time or move it.
create or replace function public.guard_booking_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then
    return new;
  end if;
  if new.room_id <> old.room_id or new.during <> old.during or new.user_id <> old.user_id then
    raise exception 'Cancel the booking and make a new one to change its time.' using errcode = 'P0001';
  end if;
  if old.status = 'cancelled' and new.status = 'confirmed' then
    raise exception 'A cancelled booking cannot be reinstated.' using errcode = 'P0001';
  end if;
  if new.status = 'cancelled' and old.status = 'confirmed' then
    new.cancelled_at := now();
    new.cancelled_by := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists bookings_guard_update on public.bookings;
create trigger bookings_guard_update
  before update on public.bookings
  for each row execute function public.guard_booking_update();

-- When an admin blacks out a window, anything already booked inside it is
-- cancelled rather than silently double-held.
create or replace function public.blackout_clears_bookings()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.bookings b
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = auth.uid()
   where b.status = 'confirmed'
     and b.during && new.during
     and (new.room_id is null or b.room_id = new.room_id);
  return new;
end $$;

drop trigger if exists blackouts_clear_bookings on public.blackouts;
create trigger blackouts_clear_bookings
  after insert on public.blackouts
  for each row execute function public.blackout_clears_bookings();

-- ---------------------------------------------------------------------------
-- Availability: who booked what stays private, but everyone can see "busy"
-- ---------------------------------------------------------------------------
create or replace function public.availability(p_from timestamptz, p_to timestamptz)
returns table (
  room_id    uuid,
  starts_at  timestamptz,
  ends_at    timestamptz,
  kind       text,      -- 'mine' | 'busy' | 'blocked'
  label      text,
  booking_id uuid
)
language sql stable security definer set search_path = public as $$
  select b.room_id,
         lower(b.during),
         upper(b.during),
         case when b.user_id = auth.uid() then 'mine' else 'busy' end,
         case
           when b.user_id = auth.uid() then coalesce(nullif(b.title, ''), 'Your booking')
           when public.is_admin() then coalesce(p.full_name, p.email)
           else 'Booked'
         end,
         case when b.user_id = auth.uid() or public.is_admin() then b.id else null end
  from public.bookings b
  join public.profiles p on p.id = b.user_id
  where b.status = 'confirmed'
    and b.during && tstzrange(p_from, p_to, '[)')
  union all
  select coalesce(bl.room_id, r.id),
         lower(bl.during),
         upper(bl.during),
         'blocked',
         bl.reason,
         null
  from public.blackouts bl
  cross join lateral (
    select id from public.rooms where bl.room_id is null
    union all select bl.room_id where bl.room_id is not null
  ) r
  where bl.during && tstzrange(p_from, p_to, '[)')
$$;

-- What the signed-in member is allowed to do right now — drives the UI copy
-- so the rules are visible before someone hits a wall.
create or replace function public.my_allowance()
returns table (
  tier                  text,
  tier_name             text,
  can_book              boolean,
  max_hours_per_booking numeric,
  max_advance_days      integer,
  max_active_bookings   integer,
  active_bookings       integer,
  max_hours_per_month   numeric,
  hours_used_this_month numeric,
  is_admin              boolean,
  timezone              text
)
language sql stable security definer set search_path = public as $$
  select t.slug,
         t.name,
         t.can_book,
         t.max_hours_per_booking,
         t.max_advance_days,
         t.max_active_bookings,
         (select count(*)::int from public.bookings b
           where b.user_id = p.id and b.status = 'confirmed' and upper(b.during) > now()),
         t.max_hours_per_month,
         (select coalesce(sum(extract(epoch from (upper(b.during) - lower(b.during))) / 3600.0), 0)
            from public.bookings b
           where b.user_id = p.id
             and b.status = 'confirmed'
             and b.during && tstzrange(
                   date_trunc('month', now() at time zone public.club_tz()) at time zone public.club_tz(),
                   (date_trunc('month', now() at time zone public.club_tz()) + interval '1 month') at time zone public.club_tz(),
                   '[)')),
         p.is_admin,
         public.club_tz()
  from public.profiles p
  join public.membership_tiers t on t.slug = p.tier
  where p.id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.settings         enable row level security;
alter table public.membership_tiers enable row level security;
alter table public.profiles         enable row level security;
alter table public.rooms            enable row level security;
alter table public.blackouts        enable row level security;
alter table public.bookings         enable row level security;

drop policy if exists settings_read       on public.settings;
drop policy if exists settings_admin      on public.settings;
drop policy if exists tiers_read          on public.membership_tiers;
drop policy if exists tiers_admin         on public.membership_tiers;
drop policy if exists profiles_self_read  on public.profiles;
drop policy if exists profiles_self_write on public.profiles;
drop policy if exists profiles_admin      on public.profiles;
drop policy if exists rooms_read          on public.rooms;
drop policy if exists rooms_admin         on public.rooms;
drop policy if exists blackouts_read      on public.blackouts;
drop policy if exists blackouts_admin     on public.blackouts;
drop policy if exists bookings_self_read  on public.bookings;
drop policy if exists bookings_insert     on public.bookings;
drop policy if exists bookings_update     on public.bookings;
drop policy if exists bookings_admin      on public.bookings;

create policy settings_read  on public.settings for select to authenticated using (true);
create policy settings_admin on public.settings for all    to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy tiers_read  on public.membership_tiers for select to authenticated using (true);
create policy tiers_admin on public.membership_tiers for all    to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy profiles_self_read  on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_self_write on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin      on public.profiles for all    to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy rooms_read  on public.rooms for select to authenticated using (true);
create policy rooms_admin on public.rooms for all    to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy blackouts_read  on public.blackouts for select to authenticated using (true);
create policy blackouts_admin on public.blackouts for all    to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Members see only their own bookings as rows; everything else reaches the UI
-- through availability(), which hides identities.
create policy bookings_self_read on public.bookings for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy bookings_insert    on public.bookings for insert to authenticated
  with check (user_id = auth.uid() or public.is_admin());
create policy bookings_update    on public.bookings for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());
create policy bookings_admin     on public.bookings for all    to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant execute on function public.availability(timestamptz, timestamptz) to authenticated;
grant execute on function public.my_allowance() to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin views
-- ---------------------------------------------------------------------------
create or replace view public.bookings_detailed
with (security_invoker = true) as
  select b.id,
         b.room_id,
         r.name  as room_name,
         r.color as room_color,
         b.user_id,
         p.email as member_email,
         p.full_name as member_name,
         p.tier  as member_tier,
         lower(b.during) as starts_at,
         upper(b.during) as ends_at,
         b.title,
         b.status,
         b.created_at,
         b.cancelled_at,
         b.confirmation_sent_at,
         b.reminder_sent_at
  from public.bookings b
  join public.rooms r    on r.id = b.room_id
  join public.profiles p on p.id = b.user_id;

grant select on public.bookings_detailed to authenticated;

-- ---------------------------------------------------------------------------
-- ONE MANUAL STEP: make yourself an admin.
-- Sign in to the app once so your profile row exists, then run:
--
--   update public.profiles set is_admin = true, tier = 'founder'
--    where email = 'you@yourdomain.com';
-- ---------------------------------------------------------------------------
