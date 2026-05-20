create type build_job_status as enum (
  'requested',
  'clarifying',
  'awaiting_build_approval',
  'build_approved',
  'building',
  'preview_ready',
  'awaiting_deploy_approval',
  'deploy_approved',
  'deploying',
  'live',
  'blocked',
  'failed',
  'canceled',
  'archived'
);

create type approval_type as enum ('build', 'deploy', 'risk', 'learning');
create type approval_status as enum ('pending', 'approved', 'rejected', 'expired', 'canceled');
create type command_request_status as enum ('pending', 'acknowledged', 'rejected', 'completed', 'failed', 'canceled');
create type app_resource_type as enum (
  'github_repo',
  'vercel_project',
  'vercel_preview_deployment',
  'vercel_production_deployment',
  'supabase_project',
  'auth_basic',
  'secret_metadata',
  'template_repo'
);
create type proof_artifact_type as enum ('screenshot', 'demo_video', 'build_summary', 'check_report', 'deployment_log');
create type repair_attempt_status as enum ('planned', 'running', 'succeeded', 'failed', 'blocked', 'abandoned');
create type learning_proposal_status as enum ('proposed', 'approved', 'rejected', 'written', 'canceled');

create table build_jobs (
  id uuid primary key default gen_random_uuid(),
  external_key text unique,
  app_id uuid references apps(id) on delete set null,
  title text not null,
  slug text not null,
  request_channel text not null default 'telegram',
  request_message_ref text,
  requested_by_label text not null default 'Trevor',
  status build_job_status not null default 'requested',
  app_goal text,
  app_type text,
  proposed_stack text,
  access_mode text not null default 'public',
  data_needs text not null default 'none',
  risk_summary text,
  compact_summary jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table job_step_events (
  id uuid primary key default gen_random_uuid(),
  build_job_id uuid not null references build_jobs(id) on delete cascade,
  sequence integer not null,
  stage text not null,
  status text not null,
  title text not null,
  detail text,
  actor_label text,
  channel text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (build_job_id, sequence)
);

create table job_approvals (
  id uuid primary key default gen_random_uuid(),
  external_key text unique,
  build_job_id uuid not null references build_jobs(id) on delete cascade,
  approval_type approval_type not null,
  status approval_status not null default 'pending',
  risk_category text,
  requested_action text not null,
  requested_channel text not null default 'telegram',
  requested_by_label text,
  decided_by_label text,
  summary text,
  decision_note text,
  metadata jsonb not null default '{}'::jsonb,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  expires_at timestamptz
);

create table command_requests (
  id uuid primary key default gen_random_uuid(),
  build_job_id uuid references build_jobs(id) on delete cascade,
  command_type text not null,
  status command_request_status not null default 'pending',
  source_surface text not null default 'mission_control',
  requested_by_label text not null default 'Trevor',
  target_type text,
  target_id text,
  risk_category text,
  payload jsonb not null default '{}'::jsonb,
  acknowledgement text,
  result_summary text,
  error_message text,
  requested_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  completed_at timestamptz
);

create table app_resources (
  id uuid primary key default gen_random_uuid(),
  app_id uuid references apps(id) on delete cascade,
  build_job_id uuid references build_jobs(id) on delete cascade,
  resource_type app_resource_type not null,
  provider text not null,
  name text not null,
  external_id text,
  url text,
  environment text,
  status text not null default 'unknown',
  secret_names text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_resources_has_owner check (app_id is not null or build_job_id is not null)
);

create table proof_artifacts (
  id uuid primary key default gen_random_uuid(),
  build_job_id uuid not null references build_jobs(id) on delete cascade,
  deployment_id uuid references deployments(id) on delete set null,
  artifact_type proof_artifact_type not null,
  title text not null,
  url text,
  storage_path text,
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table repair_attempts (
  id uuid primary key default gen_random_uuid(),
  build_job_id uuid not null references build_jobs(id) on delete cascade,
  stage text not null,
  attempt_number integer not null,
  status repair_attempt_status not null default 'planned',
  failure_summary text,
  root_cause_hypothesis text,
  fix_summary text,
  verification_summary text,
  requires_approval boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint repair_attempt_number_range check (attempt_number between 1 and 5),
  unique (build_job_id, stage, attempt_number)
);

create table learning_proposals (
  id uuid primary key default gen_random_uuid(),
  build_job_id uuid references build_jobs(id) on delete set null,
  repair_attempt_id uuid references repair_attempts(id) on delete set null,
  status learning_proposal_status not null default 'proposed',
  title text not null,
  failure_summary text,
  root_cause text,
  fix_summary text,
  reuse_guidance text,
  proposed_memory_target text,
  proposed_doc_path text,
  proposed_content text,
  approved_by_label text,
  approval_id uuid references job_approvals(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  proposed_at timestamptz not null default now(),
  decided_at timestamptz,
  written_at timestamptz
);

create table usage_observations (
  id uuid primary key default gen_random_uuid(),
  build_job_id uuid references build_jobs(id) on delete set null,
  source text not null default 'openclaw',
  session_id text,
  session_key text,
  run_id text,
  provider text,
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  total_tokens integer not null default 0,
  estimated_cost numeric(12, 6),
  estimate_currency text,
  estimate_note text,
  observed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

alter table build_jobs enable row level security;
alter table job_step_events enable row level security;
alter table job_approvals enable row level security;
alter table command_requests enable row level security;
alter table app_resources enable row level security;
alter table proof_artifacts enable row level security;
alter table repair_attempts enable row level security;
alter table learning_proposals enable row level security;
alter table usage_observations enable row level security;

grant select, insert, update, delete on
  build_jobs,
  job_step_events,
  job_approvals,
  command_requests,
  app_resources,
  proof_artifacts,
  repair_attempts,
  learning_proposals,
  usage_observations
to service_role;

create index build_jobs_status_created_at_idx on build_jobs(status, created_at desc);
create index build_jobs_app_id_idx on build_jobs(app_id);
create index job_step_events_job_sequence_idx on job_step_events(build_job_id, sequence);
create index job_approvals_job_status_idx on job_approvals(build_job_id, status);
create index job_approvals_type_status_idx on job_approvals(approval_type, status);
create index command_requests_status_requested_idx on command_requests(status, requested_at);
create index command_requests_job_id_idx on command_requests(build_job_id);
create index app_resources_app_type_idx on app_resources(app_id, resource_type);
create index app_resources_job_type_idx on app_resources(build_job_id, resource_type);
create index proof_artifacts_job_type_idx on proof_artifacts(build_job_id, artifact_type);
create index repair_attempts_job_stage_idx on repair_attempts(build_job_id, stage);
create index learning_proposals_status_proposed_idx on learning_proposals(status, proposed_at desc);
create index usage_observations_observed_at_idx on usage_observations(observed_at desc);
create index usage_observations_session_id_idx on usage_observations(session_id);
