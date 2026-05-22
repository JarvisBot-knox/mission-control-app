# Mission Control App Factory

Telegram-driven app factory for Trevor's OpenClaw/Jarvis system.

The core loop is:

```text
Telegram request
  -> OpenClaw build-site skill
  -> Supabase job, approval, event, resource, and artifact records
  -> GitHub private repo under JarvisBot-knox
  -> Vercel preview and production deploys
  -> final URL returned through Telegram and visible in Mission Control
```

Mission Control is the supervisory surface. It shows state, approvals, command requests, resources, proof, telemetry, and failures. It does not directly run shell commands or bypass OpenClaw as the execution authority.

## Apps

- `apps/mission-control`: private Next.js dashboard and command center for the App Factory workflow.

Generated customer/app outputs are created as separate GitHub repositories and Vercel projects. They do not live inside this repo.

## Primary Commands

```bash
pnpm app-factory:test
pnpm lint
pnpm typecheck
pnpm --filter mission-control build
```

Create a dry-run static job plan:

```bash
node scripts/app-factory-job.mjs create-static-job \
  --title "Test Site" \
  --goal "Pipeline smoke test" \
  --template premium_static_app \
  --dry-run
```

Dry-run the live static build orchestrator:

```bash
node scripts/app-factory-static-build.mjs build \
  --dry-run \
  --repo-name test-site-001 \
  --job-id fake-id
```

Process pending Mission Control command requests:

```bash
node scripts/app-factory-job.mjs process-commands --limit 10
```

Cancel stale pending command requests:

```bash
node scripts/app-factory-job.mjs clean-stale-commands --older-than-hours 24
```

## Environment

Local and production secrets must stay out of git.

Required for live Supabase writes:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Required for live app creation/deploy:

- `GITHUB_TOKEN`
- `VERCEL_TOKEN`
- `VERCEL_TEAM_ID` when deploying under a Vercel team

Mission Control browser code must never receive the Supabase service-role key.

## Structure

```text
apps/mission-control/      Private command center
docs/                      Architecture, workflow, handoff, operations
openclaw/                  Skill and heartbeat instructions to copy to OpenClaw
scripts/                   App Factory CLIs and integration helpers
supabase/migrations/       System-of-record schema
templates/                 Approved generated-app templates
```

## Source Of Truth

Start with [docs/HANDOFF.md](docs/HANDOFF.md), then read:

- [docs/APP_FACTORY_WORKFLOW.md](docs/APP_FACTORY_WORKFLOW.md)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/OPENCLAW_APP_FACTORY_COMMANDS.md](docs/OPENCLAW_APP_FACTORY_COMMANDS.md)
- [openclaw/skills/build-site/SKILL.md](openclaw/skills/build-site/SKILL.md)

## Safety Rules

- Do not commit credentials, tokens, Basic Auth values, service-role keys, or private deployment secrets.
- Keep templates stable unless the work explicitly targets templates.
- Keep OpenClaw as the execution authority; Mission Control creates structured command requests.
- Use migrations for database changes.
- Prefer deleting stale surface area over adding a second path for the same concept.
