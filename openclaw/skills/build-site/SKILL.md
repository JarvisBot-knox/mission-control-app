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
    description: "Template to use: premium_static_app or operator_dashboard"
---

# Build Site

Triggered when Trevor sends a site build request via Telegram.

## Steps

1. Call `app-factory-job.mjs create-static-job` with title, description, template
2. Send compact build proposal to Telegram for approval:
   - Job: {title}
   - Template: {template}
   - Description: {description}
   - Reply APPROVE to build or CANCEL to abort
3. On APPROVE: call `app-factory-static-build.mjs` to run the full pipeline
4. Report preview URL to Telegram when ready
5. Request deploy approval before production
6. Report final live URL to Telegram on success

## CLI Entry Point

```bash
node /Users/knoxbot/mission-control-app-factory/scripts/app-factory-job.mjs create-static-job \
  --title "{{title}}" \
  --description "{{description}}" \
  --template "{{template}}"
```

## Error Handling

On any failure: message Telegram with job ID and the step that failed. Never silently drop errors.
