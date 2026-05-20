# Static App Vertical Slice

This slice proves the first generated-app path without enabling uncontrolled external side effects. It defines how a Telegram-approved static app moves from private repo plan, to preview proof, to deploy approval, to final Vercel URL.

The current implementation supports dry-run planning and workflow evidence. Real GitHub/Vercel execution remains gated until the execution commands are explicitly approved and wired.

## Flow

1. Trevor requests an app in Telegram.
2. OpenClaw structures the request with `app-factory-job create-static-job`.
3. Trevor approves the build.
4. OpenClaw plans or creates a private generated-app repo under `JarvisBot-knox`.
5. OpenClaw applies the selected template.
6. OpenClaw runs checks and records milestones.
7. OpenClaw deploys or plans a Vercel preview.
8. OpenClaw records preview URL and visual proof.
9. OpenClaw asks for production deploy approval.
10. After deploy approval, OpenClaw verifies preview source and production environment assumptions.
11. OpenClaw records the production URL and marks the job live.

## Current Command

```bash
pnpm app-factory:static -- plan \
  --job-id "<build_job_id>" \
  --title "Demo Static App" \
  --preview-url "https://demo-preview.vercel.app" \
  --production-url "https://demo.vercel.app" \
  --build-approved \
  --deploy-approved \
  --source-verified \
  --environment-verified \
  --dry-run
```

The command returns planned writes for:

- selected template resource
- private GitHub repo resource
- build/check milestones
- Vercel project resource
- preview deployment resource
- deployment/check artifacts
- desktop/mobile visual proof artifacts
- pending deploy approval package
- production verification artifact
- final production deployment resource
- live job status patch

## Approval Gates

The dry-run planner refuses to proceed unless:

- `--build-approved` is present before planning the build path.
- `--deploy-approved` is present before planning production finalization.
- `--source-verified` is present before planning production finalization.
- `--environment-verified` is present before planning production finalization.

This protects against claiming a live URL before the reviewed preview and production target have been checked.

## Repo Rules

- Generated app repos default to private under `JarvisBot-knox`.
- MVP commits directly to `main`.
- Template selection must come from `docs/TEMPLATE_CATALOG.md`.
- Repo resource metadata belongs in `app_resources`.
- Raw secrets must not be written to repo metadata, artifacts, or Mission Control records.

## Preview Rules

Preview evidence must include:

- preview URL
- Vercel project/deployment resource metadata
- build/check summary
- desktop visual proof
- mobile visual proof
- known risks or limitations

The job should not move to `live` from preview. It should move to `preview_ready` and request deploy approval.

## Production Rules

Before final URL recording:

- deploy approval must exist
- reviewed preview source must be verified
- production environment assumptions must be verified
- target Vercel project must be verified
- public/private access mode must match the approved scope

Vercel production can rebuild from the same source with production environment variables. The workflow records verification of source and environment instead of promising byte-identical preview promotion.

## Failure Rules

Failures should become workflow evidence:

- GitHub errors -> `job_step_events` failed repo stage and repair attempt if fixable
- template application errors -> failed build stage
- check errors -> failed check artifact plus repair attempt
- preview deploy errors -> failed deploy stage
- visual proof errors -> blocked preview proof stage
- production verification mismatch -> blocked deploy stage

Do not advance compact job status after a failed external step.

## Security Rules

- Do not create public repos by default.
- Do not store Basic Auth password values in workflow records.
- Do not store Vercel/GitHub/Supabase tokens in metadata.
- Do not expose service-role keys to generated apps.
- Do not deploy production without explicit deploy approval.
- Do not add Supabase project provisioning in this static slice.

## Current Limitation

`scripts/app-factory-static-build.mjs` intentionally requires `--dry-run`. Real repo creation, template writing, Vercel preview deployment, proof capture, and production promotion will be implemented behind this contract after the dry-run evidence path is stable.
