# Architecture

## Ownership

| Domain | Source of Truth | Displayed In |
| --- | --- | --- |
| OpenClaw health | Local OpenClaw commands | Mission Control |
| Cron definitions | OpenClaw internal cron | Mission Control |
| Watched markdown files | Local files | Mission Control |
| App registry | Supabase | Mission Control |
| App Factory jobs | Supabase, written by OpenClaw | Telegram, Mission Control |
| App Factory approvals | Trevor via Telegram or Mission Control command request | Telegram, Mission Control |
| App Factory execution | OpenClaw/Jarvis | Telegram, Mission Control |
| Generated app repositories | GitHub private repos under JarvisBot-knox | Mission Control |
| Deployments | Vercel | Mission Control |
| Generated app databases | Per-app Supabase projects | Mission Control |
| Usage estimates | Local OpenClaw session and trajectory records | Mission Control |
| Public app data | Supabase | Vercel apps |

## Data Flow

```text
Mac mini collector -> Supabase -> Mission Control
Supabase public rows -> Vercel status demo -> public users
Telegram request -> OpenClaw -> Supabase job state -> Mission Control
Mission Control command request -> OpenClaw -> Supabase job state
OpenClaw -> GitHub/Vercel/(optional Supabase project) -> Supabase resource records
```

No public traffic should reach the OpenClaw gateway.

## App Factory Control Model

OpenClaw remains the execution authority. Mission Control displays state and can create command requests, but it does not directly execute builds, deploys, retries, or approvals behind OpenClaw's back.

The workflow contract lives in `docs/APP_FACTORY_WORKFLOW.md`.

## Foundation Shape

The backend should read like a tree:

```text
request -> approval -> execution -> resources/proof -> deployment -> learning
```

New backend work should attach to that tree with clear ownership. Avoid duplicate workflow stores, duplicate approval paths, and disconnected resource tracking. If a new capability needs a new branch, document where it attaches and why the existing branch is not enough.
