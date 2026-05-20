# Data Model

## v0.1 Foundation Tables

```text
apps
deployments
system_snapshots
cron_jobs
cron_runs
watched_files
file_snapshots
events
alerts
audit_log
public_status_items
```

## App Factory Workflow Tables

The App Factory adds a workflow system of record around the existing app and deployment tables:

```text
build_jobs
job_step_events
job_approvals
command_requests
app_resources
proof_artifacts
repair_attempts
learning_proposals
usage_observations
```

## Relationship Summary

- `build_jobs` is the central record for a Telegram-originated app build request.
- `job_step_events` is the append-only timeline for job stages, milestones, failures, and OpenClaw progress.
- `job_approvals` records build, deploy, risk, and learning approvals.
- `command_requests` records Mission Control control-surface actions that must be acknowledged and executed by OpenClaw.
- `app_resources` links jobs/apps to GitHub, Vercel, Supabase, auth, and secret metadata resources.
- `proof_artifacts` stores metadata for screenshots, demo captures, summaries, and check reports.
- `repair_attempts` records surgical fix attempts and enforces the operating limit through workflow logic.
- `learning_proposals` stores proposed memory/playbook updates pending Trevor approval.
- `usage_observations` stores observed local token/session/model data and estimated burn-rate inputs. `external_key` is the collector idempotency key for a single observed session message so repeated collector runs update the same observation instead of duplicating usage.

Raw secrets do not belong in this data model. Store only secret names, provider placement, environment, status, and timestamps.

## Modeling Rule

Keep the model tree-shaped and inspectable:

```text
build_jobs
  -> job_step_events
  -> job_approvals
  -> command_requests
  -> app_resources
  -> proof_artifacts
  -> repair_attempts
  -> learning_proposals
  -> usage_observations
```

Before adding a new table or workflow concept, confirm it cannot cleanly attach to an existing branch. Prefer a narrow extension over a parallel subsystem.
