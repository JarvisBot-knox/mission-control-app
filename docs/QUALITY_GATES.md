# Quality Gates

Quality gates define what OpenClaw must check before presenting preview proof or asking for production deploy approval. They apply to generated apps and to template-driven changes.

The gates are evidence requirements. Passing a gate records what was checked; it does not remove the need for Trevor approval when the workflow requires approval.

## Gate Levels

### Build Approval Gate

Before implementation begins, OpenClaw must show a compact Telegram proposal:

- app name
- goal
- selected template or custom path
- pages/features
- data needs
- access mode
- proposed stack
- external resources needed
- risks and permissions
- expected proof package

Trevor approves or rejects the build. Mission Control mirrors the approval state.

### Preview Gate

Before deploy approval, OpenClaw must produce:

- preview URL
- build summary
- checks run
- visual proof
- resource summary
- known risks or limitations
- repair attempts, if any
- production target and access mode

The preview gate can be blocked if a required check fails.

### Production Deploy Gate

Before production deployment, OpenClaw must verify:

- preview source is the intended source
- production environment variables and access mode are understood
- no unexpected public data exposure exists
- repo and Vercel target are correct
- risky changes have explicit approval
- rollback or recovery notes are available

Vercel preview promotion can build with production environment variables, so deploy approval means "approved source and target verified," not byte-identical preview promotion.

## Standard Checks

Run the strongest available checks for the selected template:

- install dependencies when needed
- build
- typecheck
- lint
- unit tests if present
- smoke test key routes
- verify generated links and primary actions
- verify responsive layout at mobile and desktop widths
- check browser console for critical errors when browser verification is available
- check that no raw secrets are committed or rendered

If a repo lacks a check, record it as unavailable rather than pretending it passed.

## Visual Proof Requirements

For visual apps:

- capture desktop proof
- capture mobile proof
- include the preview URL
- include what changed
- include any known visual compromise

For dashboards:

- capture the home screen
- capture at least one drill-down or core workflow
- show empty/error states if they are the key risk

For CRUD apps:

- capture list/detail/edit or the approved equivalent
- show access state where relevant

## Security And Access Gates

Always verify:

- no service-role keys in browser code
- no raw platform secrets in Mission Control tables
- no secrets committed to Git
- Basic Auth values are stored only in approved places
- public access is intentional
- public writes are explicitly approved
- RLS exists for Supabase public/browser access
- auth/user data is approved before implementation

Risky actions require explicit approval before execution:

- infrastructure creation/deletion
- Supabase project creation
- secret/env changes
- public/private visibility changes
- public writes
- auth/user accounts
- production deployment
- custom domains
- paid APIs
- cron/background jobs
- email/SMS
- payments
- scraping or external side effects

## Repair Gate

OpenClaw should use surgical repair attempts:

- identify the failed stage
- state a root-cause hypothesis
- propose the smallest reasonable fix
- dry-run or test when possible
- record outcome
- stop after five attempts per stage

OpenClaw must pause for approval if the fix changes approved scope, removes approved functionality, adds risk, creates cost, changes public data exposure, or requires broader overhaul.

## Learning Gate

Reusable fixes should become learning proposals, not automatic memory writes.

A learning proposal must include:

- failure summary
- root cause
- fix that worked
- when to reuse it
- proposed memory target
- proposed doc target
- affected cron/job/docs references

Trevor approves, edits, or rejects the learning. Approved detailed learnings should target `docs/TROUBLESHOOTING_PLAYBOOK.md` or another explicit reference doc; compact durable rules may target OpenClaw memory only when appropriate.

## Minimum Evidence By Template

| Template | Required evidence |
| --- | --- |
| `premium_static_app` | build/check result, preview URL, desktop/mobile proof, secret scan posture, deploy target |
| `operator_dashboard` | build/check result, data-source summary, home proof, drill-down proof, server/client secret boundary |
| `supabase_crud_app` | migration/RLS summary, CRUD proof, auth/access proof, build/check result, preview URL, deploy target |

## Recording Results

Record quality evidence in the workflow tree:

- compact summary in `build_jobs`
- step-by-step checks in `job_step_events`
- preview/deploy evidence in `proof_artifacts`
- external links in `app_resources`
- failed checks and fixes in `repair_attempts`
- reusable fixes in `learning_proposals`

Do not create disconnected quality logs unless the existing workflow tree cannot represent the evidence.
