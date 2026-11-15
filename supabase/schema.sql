-- Lacsamana–Ortega Family Archive: Supabase schema
-- Run this complete file in Supabase Dashboard > SQL Editor.
-- This does NOT modify FamilySearch. It creates the app's own cloud tables.

create extension if not exists pgcrypto;

create table if not exists public.family_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_family_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.family_admins a where a.user_id = auth.uid()
  );
$$;

revoke all on function public.is_family_admin() from public;
grant execute on function public.is_family_admin() to anon, authenticated;

create table if not exists public.family_tree_state (
  id text primary key check (id = 'main'),
  payload jsonb not null default '{"baseData": null, "treeEdits": {"over": {}, "add": []}}'::jsonb,
  is_published boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.family_archive_state (
  id text primary key check (id = 'main'),
  payload jsonb not null default '{"stories": [], "achievements": [], "properties": [], "links": [], "institutions": [], "lifeStories": [], "homeEntries": []}'::jsonb,
  is_published boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.family_admins enable row level security;
alter table public.family_tree_state enable row level security;
alter table public.family_archive_state enable row level security;

-- Admins can see only their own allowlist row. Admin membership is managed in SQL Editor.
drop policy if exists "Admins can read their own allowlist row" on public.family_admins;
create policy "Admins can read their own allowlist row"
on public.family_admins for select to authenticated
using (user_id = auth.uid());

-- The website is public: published tree edits are readable without an account.
drop policy if exists "Anyone can read published family tree state" on public.family_tree_state;
create policy "Anyone can read published family tree state"
on public.family_tree_state for select to anon, authenticated
using (is_published = true or public.is_family_admin());

drop policy if exists "Only family admins can insert tree state" on public.family_tree_state;
create policy "Only family admins can insert tree state"
on public.family_tree_state for insert to authenticated
with check (public.is_family_admin());

drop policy if exists "Only family admins can update tree state" on public.family_tree_state;
create policy "Only family admins can update tree state"
on public.family_tree_state for update to authenticated
using (public.is_family_admin()) with check (public.is_family_admin());

drop policy if exists "Only family admins can delete tree state" on public.family_tree_state;
create policy "Only family admins can delete tree state"
on public.family_tree_state for delete to authenticated
using (public.is_family_admin());

-- Archive notes are private by default; the owner may publish them deliberately.
drop policy if exists "Read published archive or own private archive" on public.family_archive_state;
create policy "Read published archive or own private archive"
on public.family_archive_state for select to anon, authenticated
using (is_published = true or public.is_family_admin());

drop policy if exists "Only family admins can insert archive state" on public.family_archive_state;
create policy "Only family admins can insert archive state"
on public.family_archive_state for insert to authenticated
with check (public.is_family_admin());

drop policy if exists "Only family admins can update archive state" on public.family_archive_state;
create policy "Only family admins can update archive state"
on public.family_archive_state for update to authenticated
using (public.is_family_admin()) with check (public.is_family_admin());

drop policy if exists "Only family admins can delete archive state" on public.family_archive_state;
create policy "Only family admins can delete archive state"
on public.family_archive_state for delete to authenticated
using (public.is_family_admin());

-- Restrict Data API table privileges to the roles that need them.
revoke all on public.family_admins from anon, authenticated;
revoke all on public.family_tree_state from anon, authenticated;
revoke all on public.family_archive_state from anon, authenticated;
grant select on public.family_admins to authenticated;
grant select on public.family_tree_state to anon, authenticated;
grant insert, update, delete on public.family_tree_state to authenticated;
grant select on public.family_archive_state to anon, authenticated;
grant insert, update, delete on public.family_archive_state to authenticated;

-- Create initial rows. The tree state is published; archive notes start private.
insert into public.family_tree_state (id, payload, is_published)
values ('main', '{"baseData": null, "treeEdits": {"over": {}, "add": []}}'::jsonb, true)
on conflict (id) do nothing;

insert into public.family_archive_state (id, payload, is_published)
values ('main', '{"stories": [], "achievements": [], "properties": [], "links": [], "institutions": [], "lifeStories": [], "homeEntries": []}'::jsonb, false)
on conflict (id) do nothing;

-- Load the base genealogy from supabase/seed-family-data.json using `npm run seed`
-- (the seed script uses the service-role key locally; never put it in Vercel or the browser).
-- AFTER creating the first Auth user in Supabase Dashboard > Authentication > Users,
-- copy that user's UUID and run this statement (replace the UUID):
-- insert into public.family_admins (user_id) values ('YOUR-AUTH-USER-UUID');

-- To deliberately make contributed archive notes public after reviewing them:
-- update public.family_archive_state set is_published = true where id = 'main';
-- To make archive notes private again:
-- update public.family_archive_state set is_published = false where id = 'main';
