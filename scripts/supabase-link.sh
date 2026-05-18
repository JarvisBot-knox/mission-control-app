#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v supabase >/dev/null 2>&1; then
  echo "supabase CLI is not installed. Install it first, then rerun this script." >&2
  exit 1
fi

if [[ -f .env.supabase ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.supabase
  set +a
fi

: "${SUPABASE_PROJECT_REF:?Set SUPABASE_PROJECT_REF in .env.supabase}"
: "${SUPABASE_DB_PASSWORD:?Set SUPABASE_DB_PASSWORD in .env.supabase}"

supabase link --project-ref "$SUPABASE_PROJECT_REF" --password "$SUPABASE_DB_PASSWORD"
