# Template Catalog

The App Factory template catalog is the controlled menu OpenClaw uses before building generated apps. Telegram remains the intake path, but OpenClaw should choose or propose a template from this catalog before requesting build approval.

Templates are starting points, not excuses for generic output. Each generated app still needs fit, polish, checks, preview proof, and deploy approval.

## Selection Rules

- Default to `premium_static_app` unless Trevor explicitly asks for live data, accounts, persistence, dashboards, or CRUD workflows.
- Use `operator_dashboard` when the request is primarily about status, telemetry, approvals, workflows, or repeated operational use.
- Use `supabase_crud_app` only when the request needs persistent records, authenticated users, admin editing, public/private data boundaries, or relational data.
- If the ask does not fit a catalog entry, OpenClaw should propose a custom build path and explain why the catalog entry is insufficient.
- Template selection must appear in the compact Telegram build proposal.
- Any template requiring new infrastructure, auth, public writes, cron, paid APIs, email/SMS, payments, scraping, or production deployment needs the normal approval gates.

## Required Template Metadata

Every catalog entry must define:

- `template_id`
- intended use
- default stack
- default access mode
- data needs
- external resources
- environment variables
- quality gates
- preview proof expectations
- known limitations
- customization guidance

When these templates move into external repos, the repo README should preserve the same metadata.

## Catalog Entries

### premium_static_app

**Use for:** polished sites, landing pages, portfolios, lightweight tools, local demos, preview-only pages, and small browser-only utilities.

**Default stack:** Next.js or single-file HTML when Trevor asks for the fastest browser preview.

**Default access mode:** public preview unless Trevor requests private access. Owner-only private preview can use Basic Auth.

**Data needs:** none by default.

**External resources:**

- private GitHub repo under `JarvisBot-knox`
- Vercel project
- preview deployment
- production deployment after approval
- optional Basic Auth secret metadata

**Environment variables:** none by default. Basic Auth previews require username/password env vars in Vercel or approved local secret placement.

**Quality gates:**

- build succeeds
- typecheck/lint runs where available
- secret scan posture is clean
- responsive visual proof is captured
- links and primary interactions work
- production target is verified before deploy approval

**Preview proof expectations:**

- preview URL
- screenshot or short visual proof
- one compact summary of what was built
- known limitations or risks

**Known limitations:**

- no persistent database
- no user accounts unless explicitly added through a later approved scope
- no exact billing telemetry

**Customization guidance:**

- Use this for fast, premium visual output.
- Choose single-file HTML only for tiny experiments, visual proposals, or small modifications where the user explicitly values speed over app structure.
- Promote to `operator_dashboard` or `supabase_crud_app` if the workflow becomes stateful or operational.

### operator_dashboard

**Use for:** command centers, internal dashboards, telemetry views, approval queues, workflow status, operational history, and admin surfaces.

**Default stack:** Next.js App Router with server-side reads and a focused view-model layer.

**Default access mode:** private.

**Data needs:** read-heavy operational data, usually from Supabase or local collector output.

**External resources:**

- private GitHub repo under `JarvisBot-knox`
- Vercel project
- Supabase tables or existing data APIs
- Basic Auth or stronger auth as approved
- optional command-request table when actions route back to an executor

**Environment variables:**

- server-side Supabase URL/key when needed
- Basic Auth credentials when private
- no service-role keys in browser code

**Quality gates:**

- server-side data access only for privileged data
- empty and error states render coherently
- action buttons route command requests instead of direct executor behavior
- build/typecheck pass
- responsive dashboard proof is captured
- sensitive records and secrets are not exposed to the browser

**Preview proof expectations:**

- preview URL behind approved access mode
- home screen screenshot
- at least one drill-down screenshot when drill-down views exist
- list of data sources and any unavailable sources

**Known limitations:**

- dashboards can look correct while data is stale; collectors need separate verification
- action buttons are requests until the executor acknowledges them

**Customization guidance:**

- Keep information dense but readable.
- Use explicit status, timestamps, and source labels.
- Do not turn the dashboard into a raw shell.
- Keep new backend branches attached to request, approval, execution, resource/proof, deployment, or learning.

### supabase_crud_app

**Use for:** apps that create, edit, list, filter, or manage persistent records; apps with user accounts; public/private row boundaries; admin tools; and structured business workflows.

**Default stack:** Next.js App Router plus Supabase.

**Default access mode:** private admin by default; public read/write requires explicit approval.

**Data needs:** relational tables, RLS policies, seed data, optional storage buckets, optional auth.

**External resources:**

- private GitHub repo under `JarvisBot-knox`
- Vercel project
- Supabase project or approved existing project
- migrations
- RLS policies
- preview and production deployments
- secret metadata records

**Environment variables:**

- Supabase URL
- browser-safe anon/publishable key
- server-only service key only if required and never exposed to client bundles
- auth provider secrets when approved

**Quality gates:**

- migrations apply cleanly in the target environment
- RLS policies match the approved access model
- CRUD happy paths verified
- unauthorized access checks are verified where auth/public writes exist
- build/typecheck pass
- responsive visual proof is captured
- secrets are stored only in approved locations

**Preview proof expectations:**

- preview URL
- schema/resource summary
- screenshots of list/detail/edit or equivalent core flows
- RLS/access-mode summary
- risks and rollback notes

**Known limitations:**

- Supabase project creation is a risky/billable/external action and must be explicitly approved.
- Public writes and auth introduce security review requirements.
- Data migrations must remain surgical and traceable.

**Customization guidance:**

- Start with the smallest schema that supports the approved workflow.
- Avoid adding account systems, background jobs, or public writes unless they are in the approved scope.
- Prefer a new per-app Supabase project for generated apps unless Trevor approves sharing an existing project.

## Future Catalog Candidates

These are deferred until the static and Supabase-backed slices are reliable:

- authenticated SaaS starter
- scheduled-report app
- AI workflow app
- payment-enabled app
- email/SMS automation app
- custom-domain production site

Each future entry must include risk gates before it can be used by default.
