# Mission Control App Factory

Private Mission Control plus a repeatable pipeline for OpenClaw-created live apps.

## v0.1 Goal

Prove the smallest complete loop:

```text
OpenClaw local state -> Supabase -> private Mission Control
Supabase public data -> Vercel -> public status demo app
```

## Apps

- `apps/mission-control`: private dashboard for OpenClaw health, cron, watched files, apps, deployments, alerts, and audit visibility.
- `apps/status-demo`: first public Vercel app backed by Supabase public data.

## Foundation Rules

- OpenClaw stays local and private.
- Public users reach Vercel, not the Mac mini.
- Supabase stores app data, snapshots, deployment history, and audit trails.
- Vercel hosts live apps.
- v0.1 is read-only from Mission Control.
- No service-role key in browser code.
- Database changes happen through migrations.

## Structure

```text
apps/
  mission-control/
  status-demo/
supabase/
  migrations/
docs/
scripts/
```

## Current Local Validation

Run the collector without Supabase credentials:

```bash
node scripts/collect-openclaw.mjs --dry-run
```

This should print:

- gateway status/version/model/session summary
- enabled OpenClaw cron jobs from local cron files
- watched markdown file metadata

## Local Dev Servers

Mission Control:

```bash
MISSION_CONTROL_USER=trevor MISSION_CONTROL_PASSWORD=localdev pnpm --filter mission-control dev
```

Open: `http://127.0.0.1:3000`

Development auth:

```text
user: trevor
password: localdev
```

Status demo:

```bash
pnpm --filter status-demo dev
```

Open: `http://127.0.0.1:3001`

## Supabase Terminal Setup

Copy the env template and fill in values from your Supabase project:

```bash
cp .env.supabase.example .env.supabase
```

Required values:

- `SUPABASE_PROJECT_REF`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Then link and push:

```bash
pnpm supabase:link
pnpm supabase:push
```

The migration lives at:

```text
supabase/migrations/20260516000100_foundation_v01.sql
```
