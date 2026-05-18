# Architecture

## Ownership

| Domain | Source of Truth | Displayed In |
| --- | --- | --- |
| OpenClaw health | Local OpenClaw commands | Mission Control |
| Cron definitions | OpenClaw internal cron | Mission Control |
| Watched markdown files | Local files | Mission Control |
| App registry | Supabase | Mission Control |
| Deployments | Vercel | Mission Control |
| Public app data | Supabase | Vercel apps |

## Data Flow

```text
Mac mini collector -> Supabase -> Mission Control
Supabase public rows -> Vercel status demo -> public users
```

No public traffic should reach the OpenClaw gateway.

