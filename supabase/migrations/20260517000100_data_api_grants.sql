grant usage on schema public to anon, authenticated, service_role;

grant select on apps to anon, authenticated;
grant select on public_status_items to anon, authenticated;

grant select, insert, update, delete on
  apps,
  deployments,
  system_snapshots,
  cron_jobs,
  cron_runs,
  watched_files,
  file_snapshots,
  events,
  alerts,
  audit_log,
  public_status_items
to service_role;

