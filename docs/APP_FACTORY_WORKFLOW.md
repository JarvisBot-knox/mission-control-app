# App Factory Workflow

Mission Control App Factory is a governed OpenClaw workflow. Trevor starts build jobs in Telegram, OpenClaw/Jarvis executes the approved work, and Mission Control records and displays the full operating trail.

Mission Control is a command center and control surface. It must not become a raw shell or independent executor.

The backend foundation should stay organized enough that an outside engineer can inspect the repo and understand the system quickly. New capabilities should attach to the existing workflow tree instead of creating duplicate or disconnected systems.

## Foundation Rules

- Keep one clear source of truth for workflow state.
- Prefer extending the existing job, approval, resource, event, and audit model before adding a new parallel structure.
- Name tables, docs, scripts, and UI concepts with the same domain language.
- Keep additions connected to the App Factory workflow tree: request -> approval -> execution -> resource/proof -> deploy -> learning.
- Document new branches of the system where they attach and what owns them.
- Avoid broad rewrites when a surgical addition preserves the existing foundation.

## Authority Model

| Surface | Role |
| --- | --- |
| Telegram | Primary job intake, milestone updates, build approval, deploy approval, final URL delivery |
| OpenClaw/Jarvis | Execution authority, workflow state writer, external platform operator |
| Mission Control | Dashboard, audit view, approval/control surface, app registry, telemetry view |
| Supabase | System of record for jobs, approvals, resources, deployments, events, telemetry, and audit |
| GitHub/Vercel/Supabase app projects | External resources created or managed by approved OpenClaw actions |

Mission Control buttons create command requests for OpenClaw. They do not directly approve, deploy, cancel, retry, or mutate a job into a later state. OpenClaw acknowledges or rejects the command request, performs approved work, and records resulting state.

## Job Lifecycle

```text
requested
clarifying
awaiting_build_approval
build_approved
building
preview_ready
awaiting_deploy_approval
deploy_approved
deploying
live
blocked
failed
canceled
archived
```

The dashboard should present one compact status, but detailed history belongs in append-only step events.

## Approval Gates

Required approval types:

- `build`: approves implementation work after the compact job proposal is shown.
- `deploy`: approves production promotion/deploy after preview URL, visual proof, checks, risks, repo link, and target are shown.
- `risk`: approves risky, billable, irreversible, public-data, auth, cron, email/SMS, payment, scraping, or external-side-effect actions.
- `learning`: approves writing reusable learnings into OpenClaw memory and long-term troubleshooting docs.

Approval records must preserve:

- requested action
- risk category
- requested channel, usually Telegram or Mission Control
- requester/decider labels
- decision status
- decision timestamp
- summary of what was approved or rejected

## Risk Categories

The workflow should pause for explicit approval before:

- creating, deleting, or changing infrastructure
- creating Supabase projects
- changing secrets or environment variables
- making data public
- enabling public writes
- enabling auth or user accounts
- deploying production
- adding custom domains
- using paid APIs
- adding cron/background jobs
- sending email/SMS
- adding payments
- scraping or creating external side effects
- changing approved product scope to recover from a failure

## Telegram Summary Shape

Telegram stays compact:

- app name
- goal
- pages/features
- data needs
- access mode
- proposed stack
- risks/permissions
- estimated steps

Detailed logs, steps, repair attempts, artifacts, and audit records belong in Mission Control.

## External Resources

Generated app resources are tracked separately from the controlling Mission Control repo:

- private GitHub repo under `JarvisBot-knox`
- Vercel project
- Vercel preview deployment
- Vercel production deployment
- optional per-app Supabase project
- Basic Auth secret metadata
- visual proof artifacts

Raw secrets are never stored in Mission Control tables. Store only metadata such as provider, secret name, environment, placement, status, and timestamps.

External side effects must be claim-first:

- record an `app_resources` claim with status `creating` before creating a GitHub repo, Vercel project, deployment, Supabase project, domain, or other external resource
- include an idempotency key in metadata and `external_id` when the provider ID is not known yet
- mark the claim `created` with the provider ID and URL after success
- mark the claim `record_failed` with the failure stage and sanitized error if the provider call fails
- require explicit approval before deleting or mutating live external resources during cleanup

## Preview And Production

The deploy approval is tied to a reviewed preview and evidence package:

- preview URL
- screenshot or demo proof
- build summary
- checks run
- known risks/issues
- repo link
- deployment target

Vercel preview promotion can create a production build from the same source with production environment variables. The workflow must verify source and environment assumptions before marking production live, rather than promising byte-identical preview promotion.

## Repair Attempts

OpenClaw may attempt up to five surgical repair attempts per failure stage. Each attempt should record:

- failure stage
- root-cause hypothesis
- attempted fix summary
- check or dry-run result
- outcome
- whether a risky/scope-changing action is required

OpenClaw must pause if recovery requires removing approved functionality, adding risky capabilities, changing public data exposure, or creating cost.

Repair work should be narrow and traceable. A fix should state what failed, why the selected change is the smallest reasonable correction, and which branch of the workflow it affects. Broad overhauls require a new approval path.

## Learning Proposals

Reusable fixes should become curated learning proposals, not automatic memory writes.

A proposal should include:

- what failed
- root cause
- fix that worked
- when to apply it again
- proposed storage target
- affected cron/job/docs references

Trevor approves, edits, or rejects the proposal. Approved learnings should follow OpenClaw's memory model: compact durable operating rules in `MEMORY.md`, detailed playbooks in repo docs or reference docs, and history in daily memory.

## Usage And Telemetry

Mission Control should show observed local usage and estimated burn-rate signals:

- OpenClaw gateway status
- active/default model
- session and job usage
- input/output/cache token observations
- cron contribution where available
- estimated cost-equivalent values when assumptions are known

Usage estimates must be labeled as observed or estimated. OAuth model usage does not imply exact provider billing.
