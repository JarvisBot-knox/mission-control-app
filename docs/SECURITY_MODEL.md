# Security Model

## Browser

- Uses only browser-safe Supabase credentials.
- Reads and writes only through RLS policies.
- Never receives the Supabase service-role key.
- Never calls the local OpenClaw gateway.

## Vercel Server

- Handles privileged operations only in server code.
- Verifies auth and role before every mutation.
- Writes audit records for sensitive operations.

## Local Collector

- Runs on the Mac mini.
- Reads allowlisted OpenClaw state and markdown files.
- Writes sanitized snapshots to Supabase.
- Does not upload secrets, raw config, or arbitrary logs.

