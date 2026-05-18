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

