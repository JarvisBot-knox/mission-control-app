# OpenClaw App Factory Commands

This is the first narrow command contract for Telegram-driven static app builds. OpenClaw can call the helper from an approved Telegram flow without exposing a raw shell to Telegram.

The helper records workflow state in Supabase. It does not create GitHub repos, run Vercel deployments, or provision Supabase projects. Those external execution steps begin in the later static vertical slice.

## Principles

- Telegram remains the primary job intake and milestone channel.
- Mission Control mirrors state and can create command requests, but OpenClaw executes.
- Commands are allowlisted. Unsupported command names are rejected.
- Payloads are structured. Raw shell strings are not accepted.
- Raw secrets are rejected from metadata and payload fields.
- Static-app jobs are the only active creation path in this contract.
- Supabase-backed app requests can be represented later, but provisioning must pause until the explicit data-backed approval gate exists.

## CLI

```bash
node scripts/app-factory-job.mjs <command> [flags]
```

Use `--dry-run` to print the planned writes without touching Supabase.

Without `--dry-run`, the helper requires:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Commands

### create-static-job

Creates a structured static-app build job, initial timeline event, and pending build approval.

```bash
node scripts/app-factory-job.mjs create-static-job \
  --title "Status Landing Page" \
  --goal "Create a polished static landing page for the new service" \
  --features "hero,pricing,contact" \
  --template premium_static_app \
  --access-mode public \
  --dry-run
```

Allowed templates:

- `premium_static_app`
- `operator_dashboard`

The resulting job starts as `awaiting_build_approval`.

### record-approval

Records Trevor's approval or rejection and moves compact job status to the next approved or blocked state.

```bash
node scripts/app-factory-job.mjs record-approval \
  --job-id "<build_job_id>" \
  --approval-id "<job_approval_id>" \
  --type build \
  --decision approved
```

Allowed decisions:

- `approved`
- `rejected`
- `canceled`
- `expired`

Build approval moves the job to `build_approved`. Deploy approval moves the job to `deploy_approved`. Rejections move the job to `blocked`.

### record-milestone

Records a timeline event and optionally updates compact job status.

```bash
node scripts/app-factory-job.mjs record-milestone \
  --job-id "<build_job_id>" \
  --sequence 3 \
  --stage build \
  --status completed \
  --title "Checks passed" \
  --detail "Build and typecheck completed." \
  --job-status preview_ready
```

Use milestones for Telegram-ready progress updates while Mission Control keeps the detailed timeline.

### record-resource

Records external resource metadata without storing secret values.

```bash
node scripts/app-factory-job.mjs record-resource \
  --job-id "<build_job_id>" \
  --type vercel_preview_deployment \
  --provider vercel \
  --name "Preview deployment" \
  --url "https://example.vercel.app" \
  --environment preview
```

Allowed resource types:

- `github_repo`
- `vercel_project`
- `vercel_preview_deployment`
- `vercel_production_deployment`
- `auth_basic`
- `secret_metadata`
- `template_repo`

### record-artifact

Records proof metadata.

```bash
node scripts/app-factory-job.mjs record-artifact \
  --job-id "<build_job_id>" \
  --type screenshot \
  --title "Desktop preview" \
  --url "https://artifact.example/screenshot.png" \
  --summary "Desktop proof captured after preview deploy."
```

Allowed artifact types:

- `screenshot`
- `demo_video`
- `build_summary`
- `check_report`
- `deployment_log`

### record-final-url

Records the final production URL, marks the job `live`, and appends a deploy timeline event.

```bash
node scripts/app-factory-job.mjs record-final-url \
  --job-id "<build_job_id>" \
  --url "https://example.vercel.app"
```

This command should only be used after deploy approval and production verification.

### poll-commands

Reads pending Mission Control command requests for OpenClaw to acknowledge or reject.

```bash
node scripts/app-factory-job.mjs poll-commands --limit 10
```

### ack-command

Updates a Mission Control command request after OpenClaw receives or resolves it.

```bash
node scripts/app-factory-job.mjs ack-command \
  --command-id "<command_request_id>" \
  --status acknowledged \
  --message "OpenClaw accepted this request."
```

Allowed statuses:

- `acknowledged`
- `rejected`
- `completed`
- `failed`
- `canceled`

## Telegram Output Shape

Every command returns JSON with a compact `telegram` field when applicable. Telegram should send that compact field, not the full database payload.

Mission Control should use the persisted tables for detailed state:

- `build_jobs`
- `job_step_events`
- `job_approvals`
- `app_resources`
- `proof_artifacts`
- `command_requests`

## Security Notes

- Do not pass raw secrets in `--metadata`.
- Store only secret names or placement metadata in `app_resources.secret_names`.
- Do not use this helper as a generic command runner.
- Do not skip approval gates by directly recording final URLs or live status.
- For MVP, Basic Auth preview credentials may be sent to Trevor in Telegram only for low-risk owner-only preview access and then stored in approved secret placement.
