# Security Operations

## Rules

- Never commit `.env`, `.env.local`, `.env.supabase`, Supabase `.temp`, or Vercel `.vercel` metadata.
- Never expose the OpenClaw gateway publicly.
- Mission Control uses privileged Supabase access only from server-side code.
- Public apps use only browser-safe Supabase keys and RLS-limited public tables.
- Telegram must never print or reveal secrets.
- Telegram must not become a raw shell.
- Production deploys, schema changes, and public/private visibility changes require explicit confirmation.

## Current Key Placement

- Supabase service role key: local `.env.supabase`, Mission Control Vercel encrypted env.
- Supabase publishable/anon key: status demo Vercel env; safe for browser use with RLS.
- Supabase DB password and access token: local `.env.supabase` only.
- GitHub and Vercel auth: local CLIs/keychain.

## Rotation Guidance

Rotate secrets if they are exposed outside trusted local setup, accidentally committed, posted to a shared channel, or visible to untrusted operators.

Before wider production use, rotate:

- Supabase access token
- Supabase DB password
- Supabase service role key if exposed beyond trusted setup
- Mission Control password

