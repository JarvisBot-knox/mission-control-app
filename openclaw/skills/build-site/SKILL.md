---
name: build-site
description: Build and deploy a new website or app from a Telegram message
user-invocable: true
command-dispatch: tool
parameters:
  - name: title
    type: string
    required: true
    description: Name of the site or app to build
  - name: description
    type: string
    required: true
    description: What the site is for and what it should contain
  - name: template
    type: string
    required: false
    default: premium_static_app
    description: Template to use — premium_static_app, operator_dashboard, or supabase_crud_app
---

# Build Site Skill

When Trevor sends a build request via Telegram, this skill creates a new App Factory job, records it in Supabase, and begins the build pipeline.

## What This Skill Does

1. Calls `app-factory-job.mjs create-static-job` with the title, description, and template
2. Returns the job ID and a compact build proposal to Telegram for approval
3. After approval, calls `app-factory-static-build.mjs` to execute generate → GitHub → Vercel
4. Reports preview URL back to Telegram when ready
5. Requests deploy approval before going to production

## CLI Entry Point

```bash
node /path/to/mission-control-app/scripts/app-factory-job.mjs create-static-job \
  --title "{{title}}" \
  --description "{{description}}" \
  --template "{{template}}"
```

## Approval Behavior

Always present a compact build proposal to Trevor before executing. Format:
- Job: {{title}}
- Template: {{template}}
- Description: {{description}}
- Reply APPROVE to build or CANCEL to abort.

## Error Behavior

If any step fails, report the failure to Telegram immediately with the job ID and failed step. Do not silently swallow errors.
