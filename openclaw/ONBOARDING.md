# Mission Control — OpenClaw Onboarding

This document tells OpenClaw everything it needs to know about the mission-control-app-factory system.

## What This System Does

Trevor messages Telegram with a site build request. OpenClaw creates a job, gets approval, generates the site from a template, pushes it to a private GitHub repo under JarvisBot-knox, deploys it to Vercel, and returns the live URL. Mission Control dashboard shows the full trail.

## Prerequisites (One-Time Setup)

Before the pipeline can run, verify these are configured in the Vercel dashboard:

1. **Vercel GitHub Integration** — Go to Vercel dashboard → Settings → Git → connect JarvisBot-knox GitHub account. Without this, project creation via API returns 403.
2. **GITHUB_TOKEN** — Personal access token for JarvisBot-knox with `repo` scope. Set in `.env.supabase`.
3. **VERCEL_TOKEN** — API token from Vercel dashboard → Settings → Tokens. Set in `.env.supabase`.
4. **Supabase migration applied** — Run `pnpm supabase:push` to apply all migrations including hygiene.

## Repo Location

Local: `/Users/knoxbot/mission-control-app-factory`
GitHub: `https://github.com/JarvisBot-knox/mission-control-app`

## Key Scripts (what OpenClaw calls)

| Script | What it does |
|---|---|
| `scripts/app-factory-job.mjs create-static-job` | Create a new build job in Supabase |
| `scripts/app-factory-job.mjs process-commands` | Process pending command requests from Mission Control |
| `scripts/app-factory-job.mjs clean-stale-commands --older-than-hours 24` | Expire stale pending commands |
| `scripts/app-factory-static-build.mjs build --job-id {id}` | Run full pipeline: generate → GitHub → Vercel |
| `scripts/collect-openclaw.mjs` | Snapshot OpenClaw state to Supabase |

## Skill

The `build-site` skill lives at `~/.openclaw/skills/build-site/SKILL.md`. It handles Telegram-triggered builds. When Trevor sends a build request, this skill runs.

## Approval Flow

1. Trevor sends build request via Telegram
2. OpenClaw creates job, sends compact proposal back to Telegram
3. Trevor replies APPROVE
4. OpenClaw runs `app-factory-static-build.mjs build`
5. Preview URL sent to Telegram
6. Trevor approves deploy
7. Production URL sent to Telegram

## Environment Variables Required

Located in `/Users/knoxbot/mission-control-app-factory/.env.supabase`:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GITHUB_TOKEN`
- `VERCEL_TOKEN`
- `VERCEL_TEAM_ID` (optional)

## HEARTBEAT Schedule

See `openclaw/HEARTBEAT_INSTRUCTIONS.md` for the full schedule. Key cadence:
- Every 30 min: pull latest repo, run collector, process commands
- Daily 3am: clean stale commands

## Mission Control Dashboard

Live at: `https://mission-control-coral-rho.vercel.app`
Auth: Basic Auth — credentials in Vercel project settings

## Templates

Located in `templates/` in the repo:
- `premium_static_app` — landing pages, portfolios, lightweight sites
- `operator_dashboard` — internal dashboards, status pages

## If Something Breaks

1. Check Mission Control dashboard for job status
2. Run `node scripts/app-factory-job.mjs process-commands` manually
3. Check Supabase `build_jobs` table for job status
4. For stale commands: `node scripts/app-factory-job.mjs clean-stale-commands --dry-run --older-than-hours 24`
