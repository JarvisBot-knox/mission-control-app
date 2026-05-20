# Security Operations

## Rules

- Never commit `.env`, `.env.local`, `.env.supabase`, Supabase `.temp`, or Vercel `.vercel` metadata.
- Never expose the OpenClaw gateway publicly.
- Mission Control uses privileged Supabase access only from server-side code.
- Public apps use only browser-safe Supabase keys and RLS-limited public tables.
- Telegram must never print platform secrets, API keys, service-role keys, database passwords, or client-sensitive credentials.
- Low-risk owner-only Basic Auth preview credentials may be sent in Telegram for the MVP flow when Trevor explicitly approves that path.
- Telegram must not become a raw shell.
- Production deploys, schema changes, and public/private visibility changes require explicit confirmation.
- Mission Control command buttons must route requests to OpenClaw and wait for acknowledgement before showing them as completed.
- App Factory risky actions require explicit approval: infrastructure creation/deletion, Supabase project creation, secret/env changes, public data exposure, public writes, auth/user data, production deploys, custom domains, paid APIs, cron/background jobs, email/SMS, payments, scraping, or external side effects.
- App Factory repair loops must stay surgical and pause before changing approved scope or adding risk.
- Backend additions should preserve the clean workflow tree. Do not add duplicate stores, duplicate approval paths, or disconnected resource tracking without documenting why the existing structure cannot hold the new branch.
- Reusable learnings must be proposed and approved before writing to OpenClaw memory or troubleshooting docs.
- Template selection and generated-app evidence must follow `docs/TEMPLATE_CATALOG.md` and `docs/QUALITY_GATES.md`.
- Approved detailed repair learnings should target `docs/TROUBLESHOOTING_PLAYBOOK.md` or another explicit reference doc instead of noisy durable memory.
- Static generated-app execution must follow `docs/STATIC_APP_VERTICAL_SLICE.md`; real GitHub/Vercel side effects stay gated until build approval, deploy approval, source verification, and production environment verification are recorded.

## Current Key Placement

- Supabase service role key: local `.env.supabase`, Mission Control Vercel encrypted env.
- Supabase publishable/anon key: status demo Vercel env; safe for browser use with RLS.
- Supabase DB password and access token: local `.env.supabase` only.
- GitHub and Vercel auth: local CLIs/keychain.
- Generated app Basic Auth values: Telegram for low-risk owner-only preview flow, then Vercel encrypted env or approved local secret storage.
- Mission Control App Factory records: secret metadata only, never raw values.

## Rotation Guidance

Rotate secrets if they are exposed outside trusted local setup, accidentally committed, posted to a shared channel, or visible to untrusted operators.

Before wider production use, rotate:

- Supabase access token
- Supabase DB password
- Supabase service role key if exposed beyond trusted setup
- Mission Control password
