#!/usr/bin/env bash
# Stops ops/run.sh, all of its loops and every agent it started.
OPS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
pkill -f "ops/run.sh" 2>/dev/null
pkill -f "node_modules/.bin/tsx" 2>/dev/null
pkill -f "tsx/dist/cli.mjs" 2>/dev/null
pkill -f "tsx/dist/loader.mjs" 2>/dev/null
pkill -f "caffeinate -dimsu" 2>/dev/null
rm -f "$OPS/run.pid"
echo stopped
