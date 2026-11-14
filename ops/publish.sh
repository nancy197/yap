#!/usr/bin/env bash
# Refreshes the public site: the epoch data each on-chain report points at, the transaction log and the
# testnet summary the $YAP page reads. Only needed on the host that owns the published site.
#
#   bash ops/publish.sh
#
# Deploying needs the Vercel CLI and, for a non-interactive run, these in the environment or in .env:
#   VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID
# Without them this still rebuilds everything locally and says what it skipped.
set -u
OPS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$OPS/.." && pwd)"
TSX="$ROOT/node_modules/.bin/tsx"
export YAP_TOKEN_PREFIX="${YAP_TOKEN_PREFIX:-token4}"

# .env may hold the Vercel credentials as well as NEARAI_API_KEY.
if [ -f "$ROOT/.env" ]; then set -a; . "$ROOT/.env"; set +a; fi

echo "=== $(date -u +%FT%TZ) publish $YAP_TOKEN_PREFIX"
(cd "$ROOT/agents" && "$TSX" report.ts) 2>&1 | tail -2
(cd "$ROOT" && pnpm -C web build) 2>&1 | tail -3

if [ -z "${VERCEL_TOKEN:-}" ] || [ -z "${VERCEL_PROJECT_ID:-}" ] || [ -z "${VERCEL_ORG_ID:-}" ]; then
  echo "built web/dist but did not deploy: VERCEL_TOKEN, VERCEL_ORG_ID or VERCEL_PROJECT_ID is not set"
  exit 0
fi
command -v vercel >/dev/null || { echo "built web/dist but the vercel CLI is not installed"; exit 0; }
(cd "$ROOT/web/dist" && vercel deploy --prod --yes --token "$VERCEL_TOKEN" 2>&1 | grep -Ei 'ready|error|http' | tail -2)
