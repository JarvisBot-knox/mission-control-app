-- Add expires_at to proof_artifacts for ephemeral preview URLs
alter table proof_artifacts
add column if not exists expires_at timestamptz;

-- Index for expiry queries
create index if not exists proof_artifacts_expires_at_idx on proof_artifacts(expires_at)
where expires_at is not null;

-- Cleanup function — called by OpenClaw daily via HEARTBEAT
create or replace function run_hygiene_cleanup()
returns jsonb
language plpgsql
security definer
as $$
declare
  result jsonb := '{}'::jsonb;
  deleted_count integer;
begin
  -- system_snapshots: keep 14 days
  delete from system_snapshots where collected_at < now() - interval '14 days';
  get diagnostics deleted_count = row_count;
  result := result || jsonb_build_object('system_snapshots_deleted', deleted_count);

  -- usage_observations: keep 90 days
  delete from usage_observations where observed_at < now() - interval '90 days' and build_job_id is null;
  get diagnostics deleted_count = row_count;
  result := result || jsonb_build_object('usage_observations_deleted', deleted_count);

  -- cron_runs: keep 30 days
  delete from cron_runs where created_at < now() - interval '30 days';
  get diagnostics deleted_count = row_count;
  result := result || jsonb_build_object('cron_runs_deleted', deleted_count);

  -- events: keep 14 days
  delete from events where created_at < now() - interval '14 days';
  get diagnostics deleted_count = row_count;
  result := result || jsonb_build_object('events_deleted', deleted_count);

  -- audit_log: keep 90 days
  delete from audit_log where created_at < now() - interval '90 days';
  get diagnostics deleted_count = row_count;
  result := result || jsonb_build_object('audit_log_deleted', deleted_count);

  -- command_requests: delete completed/expired/failed/canceled older than 30 days
  delete from command_requests
  where status in ('completed', 'expired', 'failed', 'canceled')
  and requested_at < now() - interval '30 days';
  get diagnostics deleted_count = row_count;
  result := result || jsonb_build_object('command_requests_deleted', deleted_count);

  -- job_approvals: delete expired older than 30 days
  delete from job_approvals
  where status = 'expired'
  and requested_at < now() - interval '30 days';
  get diagnostics deleted_count = row_count;
  result := result || jsonb_build_object('job_approvals_deleted', deleted_count);

  -- job_step_events: delete events for archived jobs older than 90 days
  delete from job_step_events
  where build_job_id in (
    select id from build_jobs
    where status = 'archived'
    and updated_at < now() - interval '90 days'
  );
  get diagnostics deleted_count = row_count;
  result := result || jsonb_build_object('job_step_events_deleted', deleted_count);

  -- file_snapshots: keep last 5 per watched file
  delete from file_snapshots
  where id in (
    select id from (
      select id,
        row_number() over (partition by watched_file_id order by collected_at desc) as rn
      from file_snapshots
    ) ranked
    where rn > 5
  );
  get diagnostics deleted_count = row_count;
  result := result || jsonb_build_object('file_snapshots_deleted', deleted_count);

  return result;
end;
$$;

-- Grant to service_role so scripts can call it
grant execute on function run_hygiene_cleanup() to service_role;
