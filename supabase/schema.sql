-- Linux Lab database schema.
--
-- Paste this whole file into the Supabase SQL Editor and press Run.
-- Safe to run more than once.

create extension if not exists pgcrypto;

/* ------------------------------------------------------------------ users --- */

create table if not exists public.users (
  id            uuid primary key default gen_random_uuid(),
  phone         text not null unique,
  name          text not null,
  password_hash text not null,
  -- Set this to true from the dashboard when someone forgets their password.
  -- They will be asked to choose a new one the next time they sign in.
  reset_pending boolean not null default false,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

comment on table public.users is
  'Learner accounts. Login is phone + password; password_hash is bcrypt.';
comment on column public.users.reset_pending is
  'Flip to true to let this user set a new password at next sign-in.';

/* --------------------------------------------------------------- progress --- */

create table if not exists public.progress (
  user_id      uuid primary key references public.users(id) on delete cascade,
  state        jsonb not null default '{}'::jsonb,
  tasks_done   integer not null default 0,
  tasks_total  integer not null default 0,
  updated_at   timestamptz not null default now()
);

comment on table public.progress is
  'One row per learner. state holds the whole app snapshot: tasks, quiz answers, reflections, transcript and their virtual filesystem.';

create index if not exists progress_updated_at_idx on public.progress (updated_at desc);

/* ------------------------------------------------------------ leaderboard --- */
-- A friendly view for checking on the class without writing SQL every time.

create or replace view public.class_progress as
select
  u.id,
  u.name,
  u.phone,
  coalesce(p.tasks_done, 0)  as tasks_done,
  coalesce(p.tasks_total, 0) as tasks_total,
  case
    when coalesce(p.tasks_total, 0) = 0 then 0
    else round(100.0 * p.tasks_done / p.tasks_total)
  end as percent,
  u.created_at,
  p.updated_at as last_active
from public.users u
left join public.progress p on p.user_id = u.id
order by tasks_done desc, last_active desc nulls last;

/* -------------------------------------------------------------- security --- */
-- Every read and write goes through our own API using the service role key,
-- which bypasses RLS. Enabling RLS with no policies means that if these keys
-- ever leaked to a browser, the anon key alone could not read anybody's data.

alter table public.users    enable row level security;
alter table public.progress enable row level security;
