# Mission Control App Factory Handoff

Last updated: 2026-05-22

## Goal

Build Trevor's OpenClaw/Jarvis app factory so Trevor can ask OpenClaw through Telegram to create or update a website, have OpenClaw govern the build workflow, store state in Supabase, deploy through Vercel, and return a working live URL.

## Source Of Truth

- GitHub repo: `https://github.com/JarvisBot-knox/mission-control-app`
- Local repo on this machine: `/Users/knoxbot/mission-control-app-factory`
- Production Mission Control: `https://mission-control-coral-rho.vercel.app`
- Supabase project URL: `https://rqwcrtqnsupcpwmmaxye.supabase.co`

Do not commit secrets. Basic Auth, Supabase service keys, Vercel tokens, and OpenClaw credentials live in local ignored env files and Vercel/Supabase configuration.

## Current Git State

- Default branch: `main` — all work merged, no active feature branches
- Latest merged work:
  - PR #1 `stabilize-app-factory-source-of-truth`
  - PR #2 `feat-openclaw-command-loop`
  - PR #3 hygiene architecture + healthcheck script
  - PR #4 pipeline hardening (GitHub race condition, Vercel result-file, enum fixes)
  - PR #5 Stark/Jarvis Mission Control UI
  - Direct commits: cleanup pass (stale branches, duplicate files, status-demo retirement), template overhaul (dark/light toggle, animated blob hero, browser mockup, sparklines, activity feed, second table)

## What Is Built

**Pipeline (fully built and hardened):**
- Telegram → OpenClaw `build-site` skill → `create-static-job` → Supabase → `app-factory-static-build.mjs` → generate from template → push to GitHub (JarvisBot-knox) → deploy to Vercel → live URL → recorded in Supabase

**Scripts:**
- `scripts/app-factory-job.mjs` — CLI: `create-static-job`, `record-*`, `process-commands`, `clean-stale-commands`
- `scripts/app-factory-generate.mjs` — reads template, replaces `{{VAR}}` tokens, outputs files
- `scripts/app-factory-github.mjs` — creates private JarvisBot-knox repo, pushes files via GitHub API (5-attempt retry for auto_init race)
- `scripts/app-factory-vercel.mjs` — live deploy, polls until READY, writes result to file, records URL to Supabase
- `scripts/app-factory-static-build.mjs` — orchestrates full pipeline
- `scripts/app-factory-healthcheck.mjs` — weekly URL health check, notifies Telegram on degraded
- `scripts/collect-openclaw.mjs` — Mac Mini telemetry → Supabase

**Templates:**
- `templates/premium_static_app/` — bold marketing landing page. Dark/light toggle, animated gradient blob hero, browser mockup frame, 3-feature grid, about section with stats.
- `templates/operator_dashboard/` — internal ops dashboard. Dark/light toggle, 4 stat cards with sparklines, primary + secondary sortable data tables with filter pills, right-side activity feed (8 items), sticky header with live status indicator.

**Mission Control dashboard:**
- Live at `https://mission-control-coral-rho.vercel.app` (Basic Auth)
- Stark/Jarvis UI: 3-column layout (rail, main, drawer), real job status, workflow state machine
- Routes: `/`, `/approvals`, `/apps/[id]`, `/jobs/[id]`, `/learnings`

**OpenClaw integration (copy to Mac Mini):**
- `openclaw/skills/build-site/SKILL.md` → `~/.openclaw/skills/build-site/SKILL.md`
- `openclaw/HEARTBEAT_INSTRUCTIONS.md` — paste entries into `~/.openclaw/HEARTBEAT.md`
- `openclaw/ONBOARDING.md` — full system orientation

**Hygiene:**
- `scripts/app-factory-healthcheck.mjs` — checks recorded live URLs and reports degraded URLs
- `clean-stale-commands` — cancels pending Mission Control command requests older than the configured threshold

## Latest Verified Deployment

Mission Control production deployment was checked on 2026-05-19:

- Deployment id: `dpl_7oTVimRqLfZJCpX2bmBpgC6CPS43`
- Ready URL: `https://mission-control-k7aln1kod-jarvis-projects-tr.vercel.app`
- Aliases:
  - `https://mission-control-coral-rho.vercel.app`
  - `https://mission-control-jarvis-projects-tr.vercel.app`
  - `https://mission-control-jarvisbot-knox-jarvis-projects-tr.vercel.app`
- Live response returned `401` Basic Auth, expected.

## Current UI Track

Stark/Jarvis operating surface is live in `apps/mission-control/app/page.tsx`. HTML proposal and real Next app are in sync. UI conversion is complete.

Design artifact (reference only):

- `apps/mission-control/ui-revamp-proposal.html`

## Completed

- Pipeline scripts built and hardened (GitHub race condition, Vercel result-file pattern, Supabase enum fix)
- Hygiene architecture: retention policy migration, healthcheck script, clean-stale-commands
- Mission Control UI: Stark/Jarvis shell, real job data, workflow state machine
- Templates overhauled: dark/light toggle, animated blob hero, browser mockup, sparklines, activity feed, second table
- Repo cleanup: stale branches deleted, duplicate files removed, status-demo retired

## Next Steps — Mac Mini Setup (Do In Order)

1. `git pull` in `/Users/knoxbot/mission-control-app-factory`
2. `cp openclaw/skills/build-site/SKILL.md ~/.openclaw/skills/build-site/SKILL.md`
3. Paste HEARTBEAT entries from `openclaw/HEARTBEAT_INSTRUCTIONS.md` into `~/.openclaw/HEARTBEAT.md`
4. Add env vars to `.env.supabase` (or wherever OpenClaw loads them):
   - `GITHUB_TOKEN` — JarvisBot-knox personal access token (repo scope)
   - `VERCEL_TOKEN` — Vercel API token
   - `SUPABASE_URL` — `https://rqwcrtqnsupcpwmmaxye.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` — service role key (never commit)
   - `VERCEL_TEAM_ID` — if deploying under a team (optional)
5. `pnpm supabase:push` — applies committed migrations from `supabase/migrations/`
6. **Clean stale commands** — dry-run first: `node scripts/app-factory-job.mjs clean-stale-commands --older-than-hours 24 --dry-run`. If the output matches expectations, run without `--dry-run`.
7. Dry-run the full pipeline: `node scripts/app-factory-static-build.mjs build --dry-run --repo-name test-site-001 --job-id fake-id`
8. **Decide command processing cadence** — three options:
   - Manual: `node scripts/app-factory-job.mjs process-commands` on demand
   - Deterministic cron: add to HEARTBEAT.md (every 30 min alongside git pull)
   - Controlled OpenClaw job: OpenClaw triggers processing after build-site skill creates the job
9. Fire first real Telegram test: `/build-site title="Test Site" description="Pipeline test" template=premium_static_app`
10. Confirm live URL returns in Telegram and Mission Control shows the job trail

## Gating Decision (After Mac Mini Validated)

Real GitHub repo creation and Vercel deploys are enabled by default in the pipeline. If you want to gate them behind manual approval first, set `dryRun: true` in `app-factory-static-build.mjs` until the proof flow (preview URL → approval → production deploy) is battle-tested end-to-end.

## Validation Commands

Use these before deploying or opening a PR:

```bash
pnpm app-factory:test
node --test apps/mission-control/app/actions.test.ts apps/mission-control/lib/mission-control-data.test.ts
pnpm lint
pnpm typecheck
pnpm --filter mission-control build
pnpm collect:dry-run
```

Note: `pnpm collect:dry-run` requires `/Users/knoxbot/.openclaw/workspace/SOUL.md` — Mac Mini only. All other commands pass on any machine.

Last full validation: 2026-05-22

- `pnpm app-factory:test` — 20/20 pass
- `node --test apps/mission-control/app/actions.test.ts apps/mission-control/lib/mission-control-data.test.ts` — 6/6 pass
- `pnpm lint` — clean
- `pnpm typecheck` — clean
- `pnpm --filter mission-control build` — success (all routes compile)
- `pnpm collect:dry-run` — success on Mac Mini; OpenClaw gateway OK, 11 active sessions

## Key Files

- `apps/mission-control/ui-revamp-proposal.html`
- `apps/mission-control/app/page.tsx`
- `apps/mission-control/app/globals.css`
- `apps/mission-control/app/approvals/page.tsx`
- `apps/mission-control/app/jobs/[id]/page.tsx`
- `apps/mission-control/app/apps/[id]/page.tsx`
- `apps/mission-control/app/learnings/page.tsx`
- `apps/mission-control/lib/mission-control-data.ts`
- `apps/mission-control/app/actions.ts`
- `scripts/app-factory-contract.mjs`
- `scripts/app-factory-job.mjs`
- `docs/OPENCLAW_APP_FACTORY_COMMANDS.md`
- `docs/APP_FACTORY_WORKFLOW.md`
- `docs/STATIC_APP_VERTICAL_SLICE.md`
- `docs/QUALITY_GATES.md`
- `supabase/migrations/`

## Restart Prompt For Another Agent

Use this after cloning/pulling on another machine:

```text
Pick up the Mission Control App Factory from docs/HANDOFF.md. Inspect git status, read README.md and docs/APP_FACTORY_WORKFLOW.md, then continue from the current Next Steps. Do not ask me to paste secrets and do not commit credentials.
```
