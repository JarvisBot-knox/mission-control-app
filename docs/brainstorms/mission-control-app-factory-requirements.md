---
date: 2026-05-18
topic: mission-control-app-factory
---

# Mission Control App Factory Requirements

## Summary

Mission Control will become the premium Jarvis command center for the whole OpenClaw setup, with an integrated App Factory that turns approved Telegram requests into live Vercel apps. The App Factory starts with Telegram, walks Trevor through explicit build and deploy approvals, uses separate private repos and app infrastructure, and keeps the operational record visible in Mission Control.

---

## Problem Frame

Trevor already has OpenClaw, Telegram, Supabase, GitHub, Vercel, cron jobs, local memory, and early Mission Control foundations connected. The system can collect OpenClaw state and display private/public app data, but the end-to-end app creation loop is not yet formalized as a repeatable, governed workflow.

The current risk is that app creation could become a loose sequence of powerful agent actions: interpreting a chat request, creating repositories, writing code, provisioning databases, setting secrets, deploying publicly, and reporting back. Without a clear control model and system of record, it would be hard to know what was requested, what was approved, what changed, what failed, what was fixed, and which app/deployment is now live.

The broader Mission Control surface also needs to represent OpenClaw itself, not only generated apps. Trevor needs one Jarvis-style home screen that shows operational status across gateway health, cron, model usage, token estimates, burn rate, jobs, deployments, repair loops, and learning proposals.

---

## Actors

- A1. Trevor: Starts build requests, answers clarifying questions, approves build/deploy gates, reviews previews, and accepts or rejects learning proposals.
- A2. OpenClaw/Jarvis: Interprets requests, asks clarifying questions, proposes jobs, executes approved work, reports milestones, performs controlled repair loops, and proposes learnings.
- A3. Mission Control: Provides the premium command-center dashboard, job/app/deployment visibility, approval surfaces, and historical record.
- A4. Generated app user: Visits or uses the generated app after deployment, with access controlled according to the approved app scope.
- A5. External platforms: GitHub, Vercel, Supabase, and model/provider systems that OpenClaw uses to create, deploy, store, and observe apps.

---

## Key Flows

- F1. Telegram build request
  - **Trigger:** Trevor asks OpenClaw in Telegram to build a website or app.
  - **Actors:** A1, A2, A3
  - **Steps:** OpenClaw evaluates whether the request is clear, asks clarifying questions only when needed, drafts a compact structured build job, and presents it in Telegram for build approval while Mission Control mirrors the job.
  - **Outcome:** A build job is either approved, rejected, or waiting on Trevor.
  - **Covered by:** R1, R2, R3, R4, R5, R6, R8, R9

- F2. Approved build to preview
  - **Trigger:** Trevor approves the build job.
  - **Actors:** A1, A2, A3, A5
  - **Steps:** OpenClaw creates a private generated-app repo, selects a premium template base, customizes the app, provisions app-specific infrastructure when approved, runs checks, performs surgical repair attempts if needed, and deploys a public preview.
  - **Outcome:** Trevor receives a preview URL, visual proof, and compact build summary in Telegram; Mission Control stores the full record.
  - **Covered by:** R7, R10, R11, R12, R13, R14, R19, R20, R21

- F3. Preview approval to live URL
  - **Trigger:** A preview is ready for production review.
  - **Actors:** A1, A2, A3, A5
  - **Steps:** OpenClaw sends the preview, visual proof, summary, risks, and deploy target; Trevor approves production; OpenClaw promotes the approved preview to live when possible; OpenClaw returns the final URL in Telegram.
  - **Outcome:** The approved version is live, linked from the job/app records, and visible in Mission Control.
  - **Covered by:** R15, R16, R17, R18

- F4. Failure repair and learning proposal
  - **Trigger:** A build, check, preview, deploy, or provisioning step fails.
  - **Actors:** A1, A2, A3
  - **Steps:** OpenClaw diagnoses the likely cause, applies up to five small repair attempts for the failure stage, reruns checks or dry-runs after each fix, pauses if a risky or scope-changing action is needed, and proposes reusable learnings after a successful resolution.
  - **Outcome:** The job either recovers, pauses for Trevor, or fails with a clear explanation; reusable learning is proposed but not written until approved.
  - **Covered by:** R20, R21, R22, R23

- F5. Mission Control overview
  - **Trigger:** Trevor opens Mission Control.
  - **Actors:** A1, A3
  - **Steps:** Mission Control opens to a Jarvis-style home screen that balances urgent actions, app portfolio status, OpenClaw telemetry, usage estimates, cron status, deployments, repair loops, and learning proposals.
  - **Outcome:** Trevor can see what needs action now and drill into jobs, apps, deployments, approvals, and OpenClaw health.
  - **Covered by:** R24, R25, R26, R27, R28, R29

---

## Requirements

**Telegram intake and approvals**
- R1. Build job creation must start in Telegram for MVP.
- R2. OpenClaw must ask clarifying questions before drafting a job when the request is too vague to build correctly.
- R3. The Telegram build job proposal must stay compact and include app name, goal, pages/features, data needs, risks/permissions, estimated steps, proposed stack, and proposed access mode.
- R4. The approval model must have two explicit gates: build approval before implementation and production deploy approval after preview review.
- R5. Risky, billable, irreversible, public-data, or externally side-effecting actions must require explicit approval even inside an approved build.
- R6. Telegram progress updates should be milestone-only, with detailed logs and history kept in Mission Control.

**Generated apps and infrastructure**
- R7. Generated apps must use private GitHub repositories under `JarvisBot-knox` by default.
- R8. OpenClaw should auto-generate app names and repository slugs using standard conventions, without blocking Trevor for naming unless a collision or conflict requires it.
- R9. The default generated-app stack should be Next.js on Vercel unless Trevor explicitly asks for a smaller static HTML/CSS/JS workflow.
- R10. Generated apps should use premium curated template bases plus custom build work, not empty-repo freeform generation.
- R11. Static/simple apps are the default first path; Supabase-backed apps are supported when the request clearly needs persistence.
- R12. Supabase-backed apps must use a separate Supabase project per app, with provisioning performed by OpenClaw only after the relevant approval.
- R13. Protected apps should use Basic Auth first, with OpenClaw proposing simple credentials that Trevor can accept or change.
- R14. Mission Control must not store raw secrets; it may store secret metadata while actual values live in approved external or local secret stores.

**Preview, deploy, and quality gates**
- R15. Public Vercel preview URLs are acceptable for MVP unless the app involves sensitive/private/client/user data that requires protection.
- R16. Before production approval, OpenClaw must provide the preview URL, visual proof, build summary, checks, risks, repo link, and deployment target.
- R17. Production approval should promote the reviewed preview to live when possible; if a fresh production build is required, OpenClaw must say so before proceeding.
- R18. Generated app builds should commit directly to `main` for MVP rather than requiring pull requests.
- R19. Generated apps must meet a production-quality small-app bar: polished UI, responsive behavior, maintainable structure, security basics, and successful relevant checks before production approval.

**Repair and learning loop**
- R20. On build/check/deploy failures, OpenClaw may attempt up to five surgical repair attempts per failure stage before pausing for Trevor.
- R21. Repair attempts must stay small and targeted; OpenClaw must pause before changing approved scope, removing expected features, adding risky capabilities, or performing billable/externally visible actions.
- R22. After a reusable fix succeeds, OpenClaw must propose a learning for its memory and the long-term troubleshooting/playbook docs, then wait for Trevor approval before writing it.
- R23. Learning proposals must follow the existing OpenClaw memory/doc structure and keep cron or related operational references accurate when they are updated.

**Mission Control command center**
- R24. Mission Control must be a premium Jarvis-style operator console, not a generic admin dashboard.
- R25. Mission Control must open to a balanced home screen that shows urgent actions, active/blocked jobs, approvals, app portfolio status, recent deployments, OpenClaw health, usage estimates, cron status, repair loops, and learning proposals.
- R26. Mission Control must include drill-down views for job timeline, app registry, deployments, approvals, OpenClaw telemetry, repair history, and learning proposals.
- R27. Mission Control should support approval/reject/cancel/retry controls, but those controls must send commands to OpenClaw rather than bypassing OpenClaw as executor.
- R28. Mission Control must track both high-level job status and detailed step-level execution history.
- R29. Mission Control must show estimated token usage and burn-rate signals using local OpenClaw/session data and public assumptions where exact billing data is unavailable.

**Authority and execution model**
- R30. OpenClaw/Jarvis remains the execution authority for MVP; Mission Control is a dashboard and control surface, not a separate autonomous executor.
- R31. The MVP should run through the main OpenClaw agent while the job model leaves room for future builder, reviewer, deployer, repair, and learning workers.
- R32. The first implementation phase should define the data model and workflow specification before wiring Telegram/OpenClaw execution.
- R33. The backend foundation should stay clean, organized, and inspectable by an outside engineer, with new capabilities attached clearly to the existing workflow tree rather than added as disconnected systems.
- R34. Fixes and additions should be surgical by default; broad overhauls require explicit approval.

---

## Acceptance Examples

- AE1. **Covers R1, R2, R3, R4.** Given Trevor asks in Telegram for a vague app, when OpenClaw cannot identify the goal or data needs, OpenClaw asks targeted clarifying questions before posting a compact build job for approval.
- AE2. **Covers R5, R11, R12.** Given an approved app request later requires persistence, when OpenClaw determines a Supabase project is needed, it pauses for explicit approval before provisioning the separate project.
- AE3. **Covers R15, R16, R17.** Given a preview has been deployed, when OpenClaw requests production approval, Telegram includes the preview URL, visual proof, summary, checks, risks, and the intended live target.
- AE4. **Covers R20, R21.** Given a build check fails, when OpenClaw can fix it with a narrow code change, it may try up to five repair attempts; if fixing requires removing a feature or adding a paid service, it pauses for Trevor.
- AE5. **Covers R22, R23.** Given a recurring Vercel deployment issue is resolved, when the fix is reusable, OpenClaw proposes a memory/playbook learning and waits for approval before writing it.
- AE6. **Covers R24, R25, R29.** Given Trevor opens Mission Control, when the home screen loads, it shows both app factory status and broader OpenClaw telemetry including gateway, cron, model, estimated usage, and burn-rate signals.

---

## Success Criteria

- Trevor can request a build in Telegram, approve a compact plan, review a preview with visual proof, approve production, and receive a live Vercel URL without leaving the guided workflow.
- Mission Control gives a clear Jarvis-style operational picture of OpenClaw and the app factory, including urgent approvals, failures, app portfolio, deployments, cron, gateway, model, usage, and learnings.
- Generated apps feel production-quality rather than disposable, with premium template foundations and quality checks before production.
- Risky actions are gated clearly enough that OpenClaw can move quickly without silently creating cost, public exposure, or irreversible changes.
- The backend reads as a connected tree of requests, approvals, execution, resources, proof, deployments, repair, and learning rather than a pile of duplicate systems.
- A downstream planner can design the data model and workflow contract without inventing product behavior, approval rules, scope boundaries, or the authority model.

---

## Scope Boundaries

- Custom domains are out of scope for MVP; generated apps use Vercel URLs.
- Pull-request review for generated apps is out of scope for MVP; direct commits to `main` are acceptable.
- Exact provider billing integration is out of scope for MVP; usage and burn-rate are estimates unless exact usage data is available locally.
- Mission Control job creation is out of scope for MVP; new jobs start in Telegram.
- Mission Control must not become a raw shell or separate autonomous executor.
- Random third-party templates should not be used blindly; template sources must be curated before becoming part of the factory.
- Refusing normal ambitious requests is not a product goal; OpenClaw should scope and gate requests unless they are genuinely unsafe or disallowed.
- Disconnected backend subsystems are out of scope unless the existing workflow tree cannot cleanly support the new capability.

---

## Key Decisions

- Telegram-first job creation: This matches Trevor's natural request flow and keeps app creation conversational.
- Two-step approval: Build and production deploy are separate decisions so publishing is never implied by approving implementation.
- Mission Control as command center: The dashboard covers the whole OpenClaw/Jarvis system, not only generated apps.
- OpenClaw as execution authority: Keeping one execution brain avoids split control paths between Telegram, Mission Control, and backend state.
- Separate app infrastructure: Private repo, Vercel project, and Supabase project per app improve isolation and long-term ownership.
- Premium template base plus custom build: Templates provide reliability and polish while still allowing each app to fit the request.
- Curated learning: OpenClaw proposes memory/docs updates after resolved issues, but Trevor approves before long-term memory changes.
- Tree-shaped backend foundation: Requests, approvals, execution, resources, proof, deployments, repair, and learning should stay connected so outside engineers can understand the system.

---

## Dependencies / Assumptions

- OpenClaw can send and receive the required Telegram messages, approval commands, and milestone updates.
- OpenClaw can create private GitHub repositories under `JarvisBot-knox`.
- Vercel supports preview deployment and, where possible, promotion or aliasing of the approved preview to live.
- Supabase project creation can be automated through an approved mechanism when a data-backed app is requested.
- Visual proof capture can be automated well enough to send a useful screenshot or short demo to Telegram and store the history in Mission Control.
- OpenClaw session/log data is sufficient to produce useful estimated token and burn-rate dashboards, even if exact OAuth billing data is unavailable.
- Existing OpenClaw memory and cron documentation structures are authoritative for where learning updates should land.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R3, R28][Technical] What exact job-state model best represents compact Telegram approvals, detailed Mission Control timelines, and future worker ownership?
- [Affects R12][Needs research] What is the safest supported path for automated Supabase project provisioning and app-specific credential handoff?
- [Affects R17][Needs research] What Vercel promotion/alias flow best guarantees that the reviewed preview is the version that becomes live?
- [Affects R22, R23][Technical] Which OpenClaw memory files and troubleshooting docs should receive approved learnings, and what format should each use?
- [Affects R29][Technical] Which OpenClaw local records expose enough model/session/token information for reliable usage estimates?
