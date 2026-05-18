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

supabase db push

if [[ -f supabase/seed.sql ]]; then
  echo "Seed file exists at supabase/seed.sql."
  echo "Apply it in Supabase SQL Editor or via psql after confirming target database."
fi
