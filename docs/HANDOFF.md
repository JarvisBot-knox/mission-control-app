# Mission Control App Factory Handoff

Last updated: 2026-05-20

## Goal

Build Trevor's OpenClaw/Jarvis app factory so Trevor can ask OpenClaw through Telegram to create or update a website, have OpenClaw govern the build workflow, store state in Supabase, deploy through Vercel, and return a working live URL.

## Source Of Truth

- GitHub repo: `https://github.com/JarvisBot-knox/mission-control-app`
- Local repo on this machine: `/Users/knoxbot/mission-control-app-factory`
- Production Mission Control: `https://mission-control-coral-rho.vercel.app`
- Production Status Demo: `https://status-demo-beta.vercel.app`
- Supabase project URL: `https://rqwcrtqnsupcpwmmaxye.supabase.co`

Do not commit secrets. Basic Auth, Supabase service keys, Vercel tokens, and OpenClaw credentials live in local ignored env files and Vercel/Supabase configuration.

## Current Git State

- Default branch: `main`
- Latest merged work:
  - PR #1 `stabilize-app-factory-source-of-truth`
  - PR #2 `feat-openclaw-command-loop`
- Current working branch for UI/handoff work: `feat-mission-control-ui-polish`
- Latest merged `main` commit before this handoff branch: `8f9448d Merge pull request #2 from JarvisBot-knox/feat-openclaw-command-loop`

## What Is Built

- Supabase schema, seed data, collection scripts, and app-factory state helpers are in the repo.
- Mission Control app exists under `apps/mission-control`.
- Status Demo app exists under `apps/status-demo`.
- Mission Control routes:
  - `/`
  - `/approvals`
  - `/apps/[id]`
  - `/jobs/[id]`
  - `/learnings`
- Command request workflow exists:
  - Mission Control creates `command_requests`.
  - `scripts/app-factory-command-loop.mjs` processes approved/rejected build, deploy, retry, cancel, and learning commands.
  - `scripts/app-factory-job.mjs` exposes `process-command` and `process-commands`.
- The command processor validates job state before mutating workflow state.

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

Trevor does not like the current deployed Mission Control UI. The next UI direction is not the existing sci-fi cockpit and not a normal SaaS dashboard.

Current design artifact:

- `apps/mission-control/ui-revamp-proposal.html`

The proposal direction is a Stark/Jarvis-style operating surface:

- `JARVIS >` command prompt.
- Central arc-reactor execution core.
- Risk-ranked reviewer inbox.
- Evidence pack for the current decision.
- Telegram -> OpenClaw -> Supabase -> Vercel state machine.
- Clear distinction between approval request and actual OpenClaw execution.

Claude also created a comparison artifact outside the repo:

- `/Users/knoxbot/Desktop/jarvis-mission-control-v2.html`

If continuing from GitHub on another machine, use the repo proposal first, then optionally compare against the Desktop artifact if it was copied separately.

## Important Pending Work

1. Decide final Mission Control UI direction from the HTML proposal.
2. Convert the chosen HTML concept into the real Next app under `apps/mission-control/app`.
3. Keep the operator workflow real:
   - what needs Trevor
   - why it matters
   - exact command payload
   - expected current state
   - evidence/proof required
   - OpenClaw acknowledgement/result
4. Clean up old pending Supabase command requests before running the mutating processor. A previous poll found stale/conflicting pending commands for job `077e70b3-6d2d-49fd-a032-a948ceafe169`.
5. Choose how command processing runs:
   - manual command,
   - deterministic cron,
   - or controlled OpenClaw job.
6. Only after preview/proof flow is reliable, enable real external app creation/deploy side effects.

## Validation Commands

Use these before deploying or opening a PR:

```bash
pnpm app-factory:test
node --test apps/mission-control/app/actions.test.ts apps/mission-control/lib/mission-control-data.test.ts
pnpm lint
pnpm typecheck
pnpm --filter mission-control build
pnpm --filter status-demo build
pnpm collect:dry-run
```

Recent validation before the UI proposal work passed:

- `pnpm app-factory:test`
- `node --test apps/mission-control/app/actions.test.ts apps/mission-control/lib/mission-control-data.test.ts`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm --filter mission-control build`
- `pnpm --filter status-demo build`
- `pnpm collect:dry-run`

During the UI proposal work, the standalone HTML was the main artifact. The real app UI conversion still needs validation once implemented.

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
- `scripts/app-factory-command-loop.mjs`
- `scripts/app-factory-job.mjs`
- `docs/OPENCLAW_APP_FACTORY_COMMANDS.md`
- `docs/APP_FACTORY_WORKFLOW.md`
- `docs/STATIC_APP_VERTICAL_SLICE.md`
- `docs/QUALITY_GATES.md`
- `supabase/migrations/`

## Restart Prompt For Another Agent

Use this after cloning/pulling on another machine:

```text
Pick up the Mission Control App Factory from docs/HANDOFF.md. Inspect git status, read apps/mission-control/ui-revamp-proposal.html, then continue the Mission Control UI conversion. Do not ask me to paste secrets.
```
