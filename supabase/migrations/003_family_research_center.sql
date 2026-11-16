-- V17 Family Research Center + Interactive Timeline
-- Run once on an existing V16 Supabase project after migration 002.
-- The bucket is PRIVATE. File links are short-lived signed URLs, never public object URLs.

create table if not exists public.family_research_records (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 180),
  record_type text not null check (record_type in (
    'birth','baptism','marriage','death','census','photograph','letter','newspaper',
    'government','church','military','school','land','other'
  )),
  person_ids text[] not null default '{}'::text[],
  repository text,
  collection_title text,
  reference_code text,
  record_date text,
  place text,
  description text not null check (char_length(description) between 1 and 4000),
  source_url text,
  evidence_status text not null default 'partially_verified'
    check (evidence_status in ('verified','partially_verified','unverified','disputed')),
  visibility text not null default 'private'
    check (visibility in ('private','family','public')),
  is_published boolean not null default false,
  storage_path text,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint family_research_public_requires_public_visibility check (is_published = false or visibility = 'public')
);

create index if not exists family_research_records_created_idx on public.family_research_records (created_at desc);
create index if not exists family_research_records_person_ids_idx on public.family_research_records using gin (person_ids);
create index if not exists family_research_records_visibility_idx on public.family_research_records (visibility, is_published, evidence_status);

create table if not exists public.family_timeline_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 180),
  event_type text not null default 'historical_milestone'
    check (event_type in ('birth','baptism','marriage','death','residence','education','public_service','family_memory','historical_milestone','research_gap','other')),
  event_date text not null default 'Date not established',
  sort_date date,
  date_precision text not null default 'undated'
    check (date_precision in ('exact','year','approximate','undated')),
  person_ids text[] not null default '{}'::text[],
  location text,
  description text not null check (char_length(description) between 1 and 3000),
  evidence_status text not null default 'partially_verified'
    check (evidence_status in ('verified','partially_verified','unverified','disputed')),
  source_record_id uuid references public.family_research_records(id) on delete set null,
  source_label text,
  source_url text,
  visibility text not null default 'private'
    check (visibility in ('private','family','public')),
  is_published boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint family_timeline_public_requires_public_visibility check (is_published = false or visibility = 'public')
);

create index if not exists family_timeline_events_sort_idx on public.family_timeline_events (sort_date, created_at);
create index if not exists family_timeline_events_person_ids_idx on public.family_timeline_events using gin (person_ids);
create index if not exists family_timeline_events_visibility_idx on public.family_timeline_events (visibility, is_published, evidence_status);

create table if not exists public.family_research_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 180),
  person_id text,
  research_question text,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'open' check (status in ('open','in_progress','blocked','complete')),
  source_hint text,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists family_research_tasks_status_idx on public.family_research_tasks (status, priority, created_at desc);

alter table public.family_research_records enable row level security;
alter table public.family_timeline_events enable row level security;
alter table public.family_research_tasks enable row level security;

-- Public visitors can see only deliberately published public metadata.
-- Invited contributors can see family-shared and public metadata; administrators can see all.
drop policy if exists "Read visible family research records" on public.family_research_records;
create policy "Read visible family research records"
on public.family_research_records for select to anon, authenticated
using (
  public.is_family_admin()
  or (visibility = 'public' and is_published = true)
  or (visibility = 'family' and public.is_family_contributor())
);

drop policy if exists "Only administrators add family research records" on public.family_research_records;
create policy "Only administrators add family research records"
on public.family_research_records for insert to authenticated
with check (public.is_family_admin() and created_by = auth.uid());

drop policy if exists "Only administrators update family research records" on public.family_research_records;
create policy "Only administrators update family research records"
on public.family_research_records for update to authenticated
using (public.is_family_admin()) with check (public.is_family_admin());

drop policy if exists "Only administrators delete family research records" on public.family_research_records;
create policy "Only administrators delete family research records"
on public.family_research_records for delete to authenticated
using (public.is_family_admin());

drop policy if exists "Read visible family timeline events" on public.family_timeline_events;
create policy "Read visible family timeline events"
on public.family_timeline_events for select to anon, authenticated
using (
  public.is_family_admin()
  or (visibility = 'public' and is_published = true)
  or (visibility = 'family' and public.is_family_contributor())
);

drop policy if exists "Only administrators add family timeline events" on public.family_timeline_events;
create policy "Only administrators add family timeline events"
on public.family_timeline_events for insert to authenticated
with check (public.is_family_admin() and created_by = auth.uid());

drop policy if exists "Only administrators update family timeline events" on public.family_timeline_events;
create policy "Only administrators update family timeline events"
on public.family_timeline_events for update to authenticated
using (public.is_family_admin()) with check (public.is_family_admin());

drop policy if exists "Only administrators delete family timeline events" on public.family_timeline_events;
create policy "Only administrators delete family timeline events"
on public.family_timeline_events for delete to authenticated
using (public.is_family_admin());

-- Research questions are a private administrator work queue; they are never public.
drop policy if exists "Only administrators read family research tasks" on public.family_research_tasks;
create policy "Only administrators read family research tasks"
on public.family_research_tasks for select to authenticated
using (public.is_family_admin());
drop policy if exists "Only administrators add family research tasks" on public.family_research_tasks;
create policy "Only administrators add family research tasks"
on public.family_research_tasks for insert to authenticated
with check (public.is_family_admin() and created_by = auth.uid());
drop policy if exists "Only administrators update family research tasks" on public.family_research_tasks;
create policy "Only administrators update family research tasks"
on public.family_research_tasks for update to authenticated
using (public.is_family_admin()) with check (public.is_family_admin());
drop policy if exists "Only administrators delete family research tasks" on public.family_research_tasks;
create policy "Only administrators delete family research tasks"
on public.family_research_tasks for delete to authenticated
using (public.is_family_admin());

revoke all on public.family_research_records from anon, authenticated;
revoke all on public.family_timeline_events from anon, authenticated;
revoke all on public.family_research_tasks from anon, authenticated;
grant select on public.family_research_records to anon, authenticated;
grant insert, update, delete on public.family_research_records to authenticated;
grant select on public.family_timeline_events to anon, authenticated;
grant insert, update, delete on public.family_timeline_events to authenticated;
grant select, insert, update, delete on public.family_research_tasks to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'family-research-files',
  'family-research-files',
  false,
  26214400,
  array[
    'application/pdf','image/jpeg','image/png','image/webp','text/plain',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = 26214400,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Administrators upload family research files" on storage.objects;
create policy "Administrators upload family research files"
on storage.objects for insert to authenticated
with check (bucket_id = 'family-research-files' and public.is_family_admin());

drop policy if exists "Read family research files by record visibility" on storage.objects;
create policy "Read family research files by record visibility"
on storage.objects for select to anon, authenticated
using (
  bucket_id = 'family-research-files'
  and (
    public.is_family_admin()
    or exists (
      select 1 from public.family_research_records r
      where r.storage_path = name
        and r.visibility = 'public'
        and r.is_published = true
    )
    or (
      public.is_family_contributor()
      and exists (
        select 1 from public.family_research_records r
        where r.storage_path = name and r.visibility = 'family'
      )
    )
  )
);

drop policy if exists "Administrators delete family research files" on storage.objects;
create policy "Administrators delete family research files"
on storage.objects for delete to authenticated
using (bucket_id = 'family-research-files' and public.is_family_admin());

-- V17 complete. Existing genealogy seed data and family-tree tables are unchanged.
