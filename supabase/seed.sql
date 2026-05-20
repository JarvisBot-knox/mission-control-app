insert into apps (name, slug, app_type, visibility, status, repo_path)
values
  ('OpenClaw Status Demo', 'status-demo', 'status_page', 'public', 'active', 'apps/status-demo'),
  ('Mission Control', 'mission-control', 'mission_control', 'private', 'active', 'apps/mission-control')
on conflict (slug) do update set
  name = excluded.name,
  app_type = excluded.app_type,
  visibility = excluded.visibility,
  status = excluded.status,
  repo_path = excluded.repo_path,
  updated_at = now();

insert into public_status_items (app_id, item_type, title, body, sort_order, is_public)
select id, 'status', 'Pipeline nominal', 'The public demo app is reading this status from Supabase and rendering it through Vercel.', 10, true
from apps
where slug = 'status-demo'
on conflict do nothing;

insert into public_status_items (app_id, item_type, title, body, sort_order, is_public)
select id, 'update', 'Foundation created', 'Mission Control, Supabase schema, local collector, and public demo app scaffolds are in place.', 20, true
from apps
where slug = 'status-demo'
on conflict do nothing;

insert into public_status_items (app_id, item_type, title, body, sort_order, is_public)
select id, 'milestone', 'First live app', 'Deploy this app to Vercel to prove the OpenClaw -> Supabase -> Vercel path.', 30, true
from apps
where slug = 'status-demo'
on conflict do nothing;

insert into build_jobs (
  external_key,
  app_id,
  title,
  slug,
  request_channel,
  requested_by_label,
  status,
  app_goal,
  app_type,
  proposed_stack,
  access_mode,
  data_needs,
  risk_summary,
  compact_summary
)
select
  'seed:mission-control-app-factory-demo',
  id,
  'Mission Control App Factory Demo',
  'mission-control-app-factory-demo',
  'telegram',
  'Trevor',
  'awaiting_build_approval',
  'Demonstrate how a Telegram-originated build job appears in Mission Control before OpenClaw execution.',
  'static_app',
  'Next.js + Vercel',
  'public',
  'none',
  'Demo record only; no external resources are created by seed data.',
  jsonb_build_object(
    'appName', 'Mission Control App Factory Demo',
    'goal', 'Show the App Factory approval workflow in Mission Control.',
    'features', jsonb_build_array('Compact build card', 'Approval gate', 'Job timeline seed'),
    'dataNeeds', 'none',
    'risks', jsonb_build_array('demo-only')
  )
from apps
where slug = 'mission-control'
on conflict (external_key) do update set
  app_id = excluded.app_id,
  title = excluded.title,
  status = excluded.status,
  app_goal = excluded.app_goal,
  compact_summary = excluded.compact_summary,
  updated_at = now();

insert into job_step_events (build_job_id, sequence, stage, status, title, detail, actor_label, channel)
select id, 1, 'request', 'completed', 'Telegram request captured', 'Seed demo job created to exercise Mission Control App Factory workflow views.', 'OpenClaw', 'telegram'
from build_jobs
where external_key = 'seed:mission-control-app-factory-demo'
on conflict (build_job_id, sequence) do nothing;

insert into job_approvals (
  external_key,
  build_job_id,
  approval_type,
  status,
  risk_category,
  requested_action,
  requested_channel,
  requested_by_label,
  summary
)
select
  'seed:mission-control-app-factory-demo:build-approval',
  id,
  'build',
  'pending',
  'none',
  'Approve demo build job',
  'telegram',
  'OpenClaw',
  'Seed approval only; approving it should route through OpenClaw command handling in the real workflow.'
from build_jobs
where external_key = 'seed:mission-control-app-factory-demo'
on conflict (external_key) do update set
  build_job_id = excluded.build_job_id,
  approval_type = excluded.approval_type,
  status = excluded.status,
  requested_action = excluded.requested_action,
  summary = excluded.summary;
