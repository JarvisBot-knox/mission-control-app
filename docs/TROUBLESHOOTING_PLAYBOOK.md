# Troubleshooting Playbook

This playbook is the long-term reference target for approved App Factory learnings. OpenClaw should not write to it automatically. A learning proposal must be approved before adding or changing playbook guidance.

Use this document for reusable fixes, diagnostic patterns, and operating procedures. Keep raw history in daily/session memory, not here.

## Learning Entry Format

Approved entries should use this shape:

```text
## Problem: short name

Symptoms:
- What was observed

Root cause:
- What actually caused it

Fix:
- Smallest fix that worked

Verification:
- Check or dry run that proved it

Reuse when:
- Conditions where OpenClaw should apply this again

Do not use when:
- Conditions where this fix would be risky or wrong

Related:
- Job, doc, cron, template, or migration references
```

## General Debugging Rules

- Reproduce or identify the failed stage before editing.
- Prefer the smallest surgical fix that addresses the root cause.
- Do not rewrite broad areas to fix a narrow failure unless Trevor approves the larger scope.
- Dry-run or test before live deploy when possible.
- Record failed attempts honestly.
- Stop after five attempts per failure stage and ask for direction.
- Pause before changes that alter approved scope, create cost, expose data, add auth, add public writes, or change infrastructure.

## App Factory Workflow Failures

### Build job state looks wrong

Check:

- `build_jobs.status`
- latest `job_step_events`
- pending `job_approvals`
- pending `command_requests`
- related `repair_attempts`

Likely causes:

- OpenClaw wrote a step event but did not update compact job status.
- Mission Control created a command request that OpenClaw has not acknowledged.
- A repair attempt changed state without appending enough context.

Fix guidance:

- Do not manually mark approval/deploy actions complete from Mission Control.
- Add or repair the missing OpenClaw state transition through the executor path.
- Keep the timeline append-only where possible.

### Mission Control action appears stuck

Check:

- `command_requests.status`
- `acknowledgement`
- `error_message`
- OpenClaw command router logs/session notes

Likely causes:

- OpenClaw has not polled or processed the request.
- Command type is unsupported.
- Target ID or target type does not match an existing job/approval/learning proposal.

Fix guidance:

- Keep the request visible as pending/rejected/failed.
- Add command-router support rather than mutating the target record directly.
- If the command is invalid, reject it with a reason and propose the corrected command.

## Generated App Build Failures

### Dependency install fails

Check:

- package manager
- lockfile presence
- Node version
- private registry assumptions
- network availability

Fix guidance:

- Prefer matching the template's package manager.
- Avoid changing framework versions unless the template is incompatible.
- Record dependency changes in the build summary.

### Typecheck or build fails

Check:

- exact error file and line
- whether failure is app code, generated data, env config, or framework config
- whether the failing feature is in approved scope

Fix guidance:

- Patch the narrow failing module.
- Do not remove approved UI or flows to pass the build without approval.
- Re-run the same failed check before moving on.

### Preview works but production deploy fails

Check:

- production env vars
- Vercel project target
- build command and output settings
- production-only integrations
- source commit used for production

Fix guidance:

- Treat preview and production as related but not identical.
- Verify production environment assumptions before asking for deploy approval again.
- Record production-specific failure details in `repair_attempts`.

## Supabase And Data Failures

### Browser cannot read expected data

Check:

- anon/publishable key placement
- RLS policies
- public read policies
- table grants
- query filters

Fix guidance:

- Do not use service-role keys in browser code.
- Fix RLS/policies to match the approved access model.
- Keep private Mission Control reads server-side.

### CRUD writes fail

Check:

- auth state
- RLS insert/update/delete policies
- required columns and defaults
- migration drift
- API error response

Fix guidance:

- Add the narrow missing policy or schema default.
- Avoid disabling RLS to make writes pass.
- Verify unauthorized writes still fail when public/browser writes are involved.

## Visual/UI Failures

### Layout is visually unacceptable

Check:

- text overlap
- mobile width
- primary visual hierarchy
- contrast
- excessive one-note palette
- performance cost of animation or particles

Fix guidance:

- Use a local `.html` or preview sandbox for rapid visual tuning when the UI is the uncertain part.
- Keep the production app stable while tuning experimental visuals separately.
- Apply approved visual settings back into the real app only after the prototype direction is clear.

### Animation or particles lag

Check:

- particle count
- canvas shadow blur/glow
- layout overlays
- device pixel ratio
- repeated React re-renders

Fix guidance:

- Reduce particle count first.
- Disable expensive glow while tuning layout.
- Use canvas for high-volume particles rather than thousands of DOM nodes.
- Add controls in a sandbox before hardcoding final values.

## Learning Proposal Routing

Use `MEMORY.md` only for compact durable operating rules.

Use this playbook for:

- repeatable debugging steps
- template-specific failure patterns
- repair strategies
- verification checklists

Use daily/session memory for:

- raw history
- one-off failures
- temporary context
- long logs

Every approved learning should preserve the distinction between durable rule, reusable playbook, and historical note.
