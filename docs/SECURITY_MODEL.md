# Security Model

## Browser

- Uses only browser-safe Supabase credentials.
- Reads and writes only through RLS policies.
- Never receives the Supabase service-role key.
- Never calls the local OpenClaw gateway.
- Never receives raw generated-app secrets.

## Vercel Server

- Handles privileged operations only in server code.
- Verifies auth and role before every mutation.
- Writes audit records for sensitive operations.
- Mission Control actions create command requests for OpenClaw instead of directly executing builds, deploys, or retries.

## Local Collector

- Runs on the Mac mini.
- Reads allowlisted OpenClaw state and markdown files.
- Writes sanitized snapshots to Supabase.
- Does not upload secrets, raw config, or arbitrary logs.

## App Factory

- Job creation starts in Telegram.
- OpenClaw/Jarvis is the execution authority.
- Mission Control is a dashboard and control surface, not a raw shell.
- Build, deploy, risky, billable, irreversible, public-data, and learning writes require explicit approval records.
- Generated app repos are private by default.
- Data-backed generated apps use separate Supabase projects.
- Mission Control stores only secret metadata, not secret values.
- Preview promotion must verify source and production environment assumptions before marking production live.
