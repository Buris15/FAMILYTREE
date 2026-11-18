-- V19.1 Family Research Workspace
-- Run once in Supabase SQL Editor after the V19 schema / contribution migration.
-- Official record and timeline writes are administrator-only. Public/family reads
-- are deliberately limited by visibility and publication status. File storage stays private.

create table if not exists public.family_research_records (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 180),
  record_type text not null default 'other',
  person_ids text[] not null default '{}',
  repository text,
  collection_title text,
  reference_code text,
  record_date text,
  place text,
  description text not null default '',
  source_url text,
  evidence_status text not null default 'partially_verified'
    check (evidence_status in ('verified', 'partially_verified', 'unverified', 'disputed')),
  visibility text not null default 'private'
    check (visibility in ('private', 'family', 'public')),
  is_published boolean not null default false,
  storage_path text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

create table if not exists public.family_timeline_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 180),
  event_type text not null default 'historical_milestone',
  event_date text not null default 'Date not established',
  sort_date date,
  date_precision text not null default 'undated'
    check (date_precision in ('exact', 'year', 'approximate', 'undated')),
  person_ids text[] not null default '{}',
  location text,
  description text not null default '',
  evidence_status text not null default 'partially_verified'
    check (evidence_status in ('verified', 'partially_verified', 'unverified', 'disputed')),
  source_record_id uuid references public.family_research_records(id) on delete set null,
  source_label text,
  source_url text,
  visibility text not null default 'private'
    check (visibility in ('private', 'family', 'public')),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

create table if not exists public.family_research_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 180),
  person_id text,
  research_question text,
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'blocked', 'complete')),
  source_hint text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

create index if not exists family_research_records_created_idx
  on public.family_research_records (created_at desc);
create index if not exists family_research_records_people_idx
  on public.family_research_records using gin (person_ids);
create index if not exists family_timeline_events_sort_idx
  on public.family_timeline_events (sort_date asc nulls first, created_at asc);
create index if not exists family_timeline_events_people_idx
  on public.family_timeline_events using gin (person_ids);
create index if not exists family_research_tasks_created_idx
  on public.family_research_tasks (created_at desc);

alter table public.family_research_records enable row level security;
alter table public.family_timeline_events enable row level security;
alter table public.family_research_tasks enable row level security;

-- Research records: admins can see all; invited contributors can see family-visible
-- entries; anonymous visitors can see only explicitly published public records.
drop policy if exists "Read visible family research records" on public.family_research_records;
create policy "Read visible family research records"
on public.family_research_records for select to anon, authenticated
using (
  public.is_family_admin()
  or (visibility = 'public' and is_published = true)
  or (visibility = 'family' and public.is_family_contributor())
);

drop policy if exists "Only admins insert family research records" on public.family_research_records;
create policy "Only admins insert family research records"
on public.family_research_records for insert to authenticated
with check (public.is_family_admin() and (created_by is null or created_by = auth.uid()));

drop policy if exists "Only admins update family research records" on public.family_research_records;
create policy "Only admins update family research records"
on public.family_research_records for update to authenticated
using (public.is_family_admin())
with check (public.is_family_admin());

drop policy if exists "Only admins delete family research records" on public.family_research_records;
create policy "Only admins delete family research records"
on public.family_research_records for delete to authenticated
using (public.is_family_admin());

-- Timeline events follow the same visibility rules as research records.
drop policy if exists "Read visible family timeline events" on public.family_timeline_events;
create policy "Read visible family timeline events"
on public.family_timeline_events for select to anon, authenticated
using (
  public.is_family_admin()
  or (visibility = 'public' and is_published = true)
  or (visibility = 'family' and public.is_family_contributor())
);

drop policy if exists "Only admins insert family timeline events" on public.family_timeline_events;
create policy "Only admins insert family timeline events"
on public.family_timeline_events for insert to authenticated
with check (public.is_family_admin() and (created_by is null or created_by = auth.uid()));

drop policy if exists "Only admins update family timeline events" on public.family_timeline_events;
create policy "Only admins update family timeline events"
on public.family_timeline_events for update to authenticated
using (public.is_family_admin())
with check (public.is_family_admin());

drop policy if exists "Only admins delete family timeline events" on public.family_timeline_events;
create policy "Only admins delete family timeline events"
on public.family_timeline_events for delete to authenticated
using (public.is_family_admin());

-- Research tasks are private administrator work items.
drop policy if exists "Only admins read family research tasks" on public.family_research_tasks;
create policy "Only admins read family research tasks"
on public.family_research_tasks for select to authenticated
using (public.is_family_admin());

drop policy if exists "Only admins insert family research tasks" on public.family_research_tasks;
create policy "Only admins insert family research tasks"
on public.family_research_tasks for insert to authenticated
with check (public.is_family_admin() and (created_by is null or created_by = auth.uid()));

drop policy if exists "Only admins update family research tasks" on public.family_research_tasks;
create policy "Only admins update family research tasks"
on public.family_research_tasks for update to authenticated
using (public.is_family_admin())
with check (public.is_family_admin());

drop policy if exists "Only admins delete family research tasks" on public.family_research_tasks;
create policy "Only admins delete family research tasks"
on public.family_research_tasks for delete to authenticated
using (public.is_family_admin());

revoke all on public.family_research_records from anon, authenticated;
revoke all on public.family_timeline_events from anon, authenticated;
revoke all on public.family_research_tasks from anon, authenticated;
grant select on public.family_research_records to anon, authenticated;
grant select on public.family_timeline_events to anon, authenticated;
grant select, insert, update, delete on public.family_research_records to authenticated;
grant select, insert, update, delete on public.family_timeline_events to authenticated;
grant select, insert, update, delete on public.family_research_tasks to authenticated;

-- Uploaded research files are stored privately. Signed URLs can be created only
-- when the requesting role can read the corresponding research record.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'family-research-files',
  'family-research-files',
  false,
  26214400,
  array[
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = 26214400,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Only admins upload family research files" on storage.objects;
create policy "Only admins upload family research files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'family-research-files'
  and public.is_family_admin()
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Read files for visible family research records" on storage.objects;
create policy "Read files for visible family research records"
on storage.objects for select to anon, authenticated
using (
  bucket_id = 'family-research-files'
  and (
    public.is_family_admin()
    or exists (
      select 1
      from public.family_research_records r
      where r.storage_path = storage.objects.name
        and (
          (r.visibility = 'public' and r.is_published = true)
          or (r.visibility = 'family' and public.is_family_contributor())
        )
    )
  )
);

drop policy if exists "Only admins delete family research files" on storage.objects;
create policy "Only admins delete family research files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'family-research-files'
  and public.is_family_admin()
);
