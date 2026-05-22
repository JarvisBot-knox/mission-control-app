# Build Checklist

Use this before a real Telegram-triggered App Factory build.

1. Repo is clean and on `main`.
2. `pnpm supabase:push` has applied committed migrations.
3. Required live env vars are present locally without exposing values:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GITHUB_TOKEN`
   - `VERCEL_TOKEN`
   - optional `VERCEL_TEAM_ID`
4. Backend hygiene audit is clean or reviewed:
   ```bash
   node scripts/app-factory-hygiene.mjs audit
   ```
5. Stale command cleanup dry-run has been reviewed:
   ```bash
   node scripts/app-factory-job.mjs clean-stale-commands --older-than-hours 24 --dry-run
   ```
6. Static build orchestrator dry-run passes:
   ```bash
   node scripts/app-factory-static-build.mjs build --dry-run --repo-name test-site-001 --job-id fake-id
   ```
7. Validation passes:
   ```bash
   pnpm app-factory:test
   pnpm lint
   pnpm typecheck
   pnpm --filter mission-control build
   ```
8. First real Telegram test uses a disposable app name and template:
   ```text
   /build-site title="Test Site" description="Pipeline test" template=premium_static_app
   ```
9. Confirm the workflow trail in Mission Control:
   - build job created
   - build approval requested
   - preview/resource records created
   - deploy approval requested
   - final production URL recorded
10. Run hygiene audit again after the live test. Treat cleanup as a separate approved task; hygiene is audit-only.
