create extension if not exists pgcrypto;

create type app_visibility as enum ('private', 'public');
create type app_status as enum ('draft', 'active', 'paused', 'archived');
create type deployment_status as enum ('queued', 'building', 'ready', 'failed', 'canceled');
create type alert_severity as enum ('info', 'warning', 'critical');

create table apps (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  app_type text not null,
  visibility app_visibility not null default 'private',
  status app_status not null default 'draft',
  repo_path text,
  vercel_project_id text,
  production_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table deployments (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  provider text not null default 'vercel',
  environment text not null,
  commit_sha text,
  deployment_url text,
  status deployment_status not null default 'queued',
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table system_snapshots (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'openclaw',
  gateway_status text,
  gateway_url text,
  gateway_version text,
  cli_version text,
  model text,
  sessions_active integer,
  raw_summary jsonb not null default '{}'::jsonb,
  collected_at timestamptz not null default now()
);

create table cron_jobs (
  id uuid primary key default gen_random_uuid(),
  openclaw_id text not null unique,
  name text not null,
  schedule text not null,
  timezone text not null default 'America/Denver',
  next_run_text text,
  last_run_text text,
  status text,
  target text,
  model text,
  collected_at timestamptz not null default now()
);

create table cron_runs (
  id uuid primary key default gen_random_uuid(),
  cron_job_id uuid references cron_jobs(id) on delete set null,
  openclaw_id text,
  name text not null,
  status text not null,
  started_at timestamptz,
  completed_at timestamptz,
  summary text,
  created_at timestamptz not null default now()
);

create table watched_files (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  path text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table file_snapshots (
  id uuid primary key default gen_random_uuid(),
  watched_file_id uuid not null references watched_files(id) on delete cascade,
  byte_size integer not null,
  sha256 text not null,
  content text,
  modified_at timestamptz,
  collected_at timestamptz not null default now()
);

create table events (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  event_type text not null,
  severity alert_severity not null default 'info',
  title text not null,
  detail text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table alerts (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  severity alert_severity not null,
  title text not null,
  detail text,
  status text not null default 'open',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_label text,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public_status_items (
  id uuid primary key default gen_random_uuid(),
  app_id uuid references apps(id) on delete cascade,
  item_type text not null,
  title text not null,
  body text,
  sort_order integer not null default 0,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table apps enable row level security;
alter table deployments enable row level security;
alter table system_snapshots enable row level security;
alter table cron_jobs enable row level security;
alter table cron_runs enable row level security;
alter table watched_files enable row level security;
alter table file_snapshots enable row level security;
alter table events enable row level security;
alter table alerts enable row level security;
alter table audit_log enable row level security;
alter table public_status_items enable row level security;

create policy "public apps are readable"
on apps for select
to anon, authenticated
using (visibility = 'public' and status = 'active');

create policy "public status items are readable"
on public_status_items for select
to anon, authenticated
using (
  is_public = true
  and exists (
    select 1
    from apps
    where apps.id = public_status_items.app_id
      and apps.visibility = 'public'
      and apps.status = 'active'
  )
);

create index deployments_app_id_started_at_idx on deployments(app_id, started_at desc);
create index system_snapshots_collected_at_idx on system_snapshots(collected_at desc);
create index cron_jobs_openclaw_id_idx on cron_jobs(openclaw_id);
create index cron_runs_created_at_idx on cron_runs(created_at desc);
create index file_snapshots_watched_file_collected_idx on file_snapshots(watched_file_id, collected_at desc);
create index events_created_at_idx on events(created_at desc);
create index alerts_status_created_at_idx on alerts(status, created_at desc);
create index public_status_items_public_sort_idx on public_status_items(is_public, sort_order);
