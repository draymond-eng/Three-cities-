-- ============================================================
-- Klepcake — Supabase schema (safe to run multiple times)
-- Run in your Supabase project: SQL Editor → paste → Run.
-- ============================================================

create extension if not exists pgcrypto;

-- The household holds the whole app state as JSON, plus a join code.
create table if not exists households (
  id          uuid primary key default gen_random_uuid(),
  name        text,
  join_code   text unique not null,
  data        jsonb not null default '{}',
  updated_at  timestamptz not null default now()
);

-- Who belongs to a household (you + Alexandria).
create table if not exists household_members (
  household_id uuid not null references households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text,
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- ---------- Row Level Security ----------
alter table households        enable row level security;
alter table household_members enable row level security;

drop policy if exists "read own household" on households;
create policy "read own household" on households for select
  using (id in (select household_id from household_members where user_id = auth.uid()));

drop policy if exists "update own household" on households;
create policy "update own household" on households for update
  using (id in (select household_id from household_members where user_id = auth.uid()));

drop policy if exists "read own memberships" on household_members;
create policy "read own memberships" on household_members for select
  using (user_id = auth.uid());

-- ---------- Helpers (atomic create / join, safe under RLS) ----------
create or replace function create_household(p_name text)
returns households language plpgsql security definer set search_path = public as $$
declare h households;
begin
  insert into households(name, join_code)
    values (coalesce(nullif(p_name,''),'Our Family'),
            upper(substring(replace(gen_random_uuid()::text,'-','') for 6)))
    returning * into h;
  insert into household_members(household_id, user_id) values (h.id, auth.uid());
  return h;
end $$;

create or replace function join_household(p_code text)
returns households language plpgsql security definer set search_path = public as $$
declare h households;
begin
  select * into h from households where join_code = upper(p_code);
  if h.id is null then raise exception 'No household with that code'; end if;
  insert into household_members(household_id, user_id) values (h.id, auth.uid())
    on conflict do nothing;
  return h;
end $$;

grant execute on function create_household(text) to authenticated;
grant execute on function join_household(text)  to authenticated;

-- ---------- Keep updated_at fresh + enable live sync ----------
create or replace function bump_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists households_updated on households;
create trigger households_updated before update on households
  for each row execute function bump_updated_at();

-- Live push to both phones when the household changes (ignore if already added).
do $$ begin
  alter publication supabase_realtime add table households;
exception when duplicate_object then null;
end $$;
