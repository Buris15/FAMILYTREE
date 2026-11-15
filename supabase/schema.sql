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

-- Family contribution portal migration for existing V14 Supabase projects.
-- Run this file once in Supabase Dashboard > SQL Editor.
-- Adds invite-only contributors, moderated submissions, and private attachments.

create table if not exists public.family_contributors (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create or replace function public.is_family_contributor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.family_contributors c where c.user_id = auth.uid()
  );
$$;

revoke all on function public.is_family_contributor() from public;
grant execute on function public.is_family_contributor() to anon, authenticated;

create table if not exists public.family_contributions (
  id uuid primary key default gen_random_uuid(),
  contributor_id uuid not null references auth.users(id) on delete cascade,
  contributor_name text not null default 'Family contributor',
  submission_type text not null check (submission_type in (
    'missing_relative', 'relationship_correction', 'birth_marriage_death_record',
    'photograph', 'historical_document', 'family_story', 'migration_story',
    'achievement', 'other_research'
  )),
  title text not null check (char_length(title) between 1 and 160),
  person_name text,
  details text not null check (char_length(details) between 1 and 5000),
  event_period text,
  location text,
  source_url text,
  source_note text,
  attachment_path text,
  publish_requested boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  publish_to_site boolean not null default false,
  admin_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  constraint family_contributions_publish_requires_approval check (publish_to_site = false or status = 'approved'),
  constraint family_contributions_publish_requires_request check (publish_to_site = false or publish_requested = true)
);

create index if not exists family_contributions_contributor_created_idx
  on public.family_contributions (contributor_id, created_at desc);
create index if not exists family_contributions_public_idx
  on public.family_contributions (status, publish_to_site, reviewed_at desc);

alter table public.family_contributors enable row level security;
alter table public.family_contributions enable row level security;

-- Contributors can read their own allowlist row; admins can manage the allowlist.
drop policy if exists "Contributors read their own membership" on public.family_contributors;
create policy "Contributors read their own membership"
on public.family_contributors for select to authenticated
using (user_id = auth.uid() or public.is_family_admin());

drop policy if exists "Only admins manage family contributors" on public.family_contributors;
create policy "Only admins manage family contributors"
on public.family_contributors for all to authenticated
using (public.is_family_admin()) with check (public.is_family_admin());

-- The public can see only approved and explicitly published contributions.
-- A contributor can see their own submissions; an admin can see all submissions.
drop policy if exists "Read published or owned family contributions" on public.family_contributions;
create policy "Read published or owned family contributions"
on public.family_contributions for select to anon, authenticated
using (
  (status = 'approved' and publish_to_site = true)
  or contributor_id = auth.uid()
  or public.is_family_admin()
);

drop policy if exists "Invited family contributors submit their own contributions" on public.family_contributions;
create policy "Invited family contributors submit their own contributions"
on public.family_contributions for insert to authenticated
with check (
  contributor_id = auth.uid()
  and (public.is_family_contributor() or public.is_family_admin())
  and status = 'pending'
  and publish_to_site = false
  and reviewed_by is null
);

drop policy if exists "Only admins review family contributions" on public.family_contributions;
create policy "Only admins review family contributions"
on public.family_contributions for update to authenticated
using (public.is_family_admin()) with check (public.is_family_admin());

drop policy if exists "Only admins delete family contributions" on public.family_contributions;
create policy "Only admins delete family contributions"
on public.family_contributions for delete to authenticated
using (public.is_family_admin());

revoke all on public.family_contributors from anon, authenticated;
grant select, insert, update, delete on public.family_contributors to authenticated;
-- The base table is not readable by anonymous visitors. Public display uses a
-- narrowly-scoped view that omits contributor identity, moderation notes, and file paths.
revoke all on public.family_contributions from anon, authenticated;
grant select, insert, update, delete on public.family_contributions to authenticated;

create or replace view public.family_public_contributions
with (security_barrier = true)
as
select
  id, submission_type, title, person_name, details,
  event_period, location, source_url, source_note, created_at, reviewed_at
from public.family_contributions
where status = 'approved' and publish_to_site = true;

revoke all on public.family_public_contributions from public, anon, authenticated;
grant select on public.family_public_contributions to anon, authenticated;

-- Private attachment bucket. Contributors can upload and read only their own folder;
-- administrators can review all attachments. Public URLs are never generated.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'family-contribution-files',
  'family-contribution-files',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = 15728640,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[];

drop policy if exists "Contributors upload to their own folder" on storage.objects;
create policy "Contributors upload to their own folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'family-contribution-files'
  and (
    public.is_family_admin()
    or (public.is_family_contributor() and (storage.foldername(name))[1] = auth.uid()::text)
  )
);

drop policy if exists "Contributors and admins read contribution attachments" on storage.objects;
create policy "Contributors and admins read contribution attachments"
on storage.objects for select to authenticated
using (
  bucket_id = 'family-contribution-files'
  and (
    public.is_family_admin()
    or (public.is_family_contributor() and (storage.foldername(name))[1] = auth.uid()::text)
  )
);

drop policy if exists "Contributors remove own pending attachments" on storage.objects;
create policy "Contributors remove own pending attachments"
on storage.objects for delete to authenticated
using (
  bucket_id = 'family-contribution-files'
  and (
    public.is_family_admin()
    or (public.is_family_contributor() and (storage.foldername(name))[1] = auth.uid()::text)
  )
);

-- No public sign-up is enabled by this migration. Invite users in Authentication > Users,
-- then add their UUID to family_contributors. Existing family_admins remain administrators.
