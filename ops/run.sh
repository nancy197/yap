#!/usr/bin/env bash
# Keeps the $YAP testnet economy running: the three scorers, the watchdog, the steward keeper, @yapbot and the
# simulated demo crowd. Everything here is idempotent: each agent reads chain state on start and continues, so
# killing and restarting any of them is safe.
#
#   bash ops/run.sh                                   run in the foreground
#   nohup bash ops/run.sh > data/run.log 2>&1 &       run in the background
#   bash ops/stop.sh                                  stop everything
#
# Needs, in the repository root: .env (NEARAI_API_KEY) and .keys.json (agent keys). See ops/README.md.
set -u

OPS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$OPS/.." && pwd)"
LOGS="$ROOT/data"
TSX="$ROOT/node_modules/.bin/tsx"

export YAP_TOKEN_PREFIX="${YAP_TOKEN_PREFIX:-token4}"
export YAP_PUBLIC_BASE="${YAP_PUBLIC_BASE:-https://yap-near.vercel.app/epochs/$YAP_TOKEN_PREFIX}"
# A fetch with no signal of its own gets a 120 s timeout, so one hung request cannot stall an agent forever.
export NODE_OPTIONS="--import file://$OPS/fetch-timeout.mjs"

EPOCH_SECS="${EPOCH_SECS:-600}"
PUBLISH="${PUBLISH:-0}"      # 1 also refreshes the public site every 20 min (needs vercel, see ops/README.md)
CROWD="${CROWD:-1}"          # 0 runs the chain agents only, with no simulated posting

for f in "$TSX" "$ROOT/.keys.json"; do
  [ -e "$f" ] || { echo "missing $f — read ops/README.md"; exit 1; }
done
[ -e "$ROOT/.env" ] || echo "warning: no .env, so labels fall back to the deterministic heuristic"
mkdir -p "$LOGS"
echo $$ > "$OPS/run.pid"

GENESIS="$(node -e "console.log(require('$ROOT/deploy/testnet.json').genesisTs)" 2>/dev/null || echo 0)"
[ "$GENESIS" -gt 0 ] 2>/dev/null || { echo "cannot read genesisTs from deploy/testnet.json"; exit 1; }
echo "$(date -u +%FT%TZ) run.sh: $YAP_TOKEN_PREFIX, genesis $GENESIS, epoch ${EPOCH_SECS}s, publish=$PUBLISH crowd=$CROWD"

# Keep a Mac awake while this runs (no-op elsewhere). The lid must stay open on a laptop.
command -v caffeinate >/dev/null && caffeinate -dimsu -w $$ &

# Restart an agent whenever it exits, with its own log.
forever() {
  local name=$1; shift
  ( while true; do
      echo "=== $(date -u +%FT%TZ) start $name" >> "$LOGS/$name.log"
      (cd "$ROOT/agents" && "$TSX" "$@") >> "$LOGS/$name.log" 2>&1
      echo "=== $(date -u +%FT%TZ) $name exited ($?), restarting in 20s" >> "$LOGS/$name.log"
      sleep 20
    done ) &
}

forever scorer   scorer.ts
forever watchdog watchdog.ts
forever yapbot   yapbot.ts
forever steward  steward.ts keeper

# Stall guard: the scorer logs at least once per epoch, so a log that has not changed for 15 minutes means it is
# wedged (a hung socket, usually). Killing it lets the loop above start it again.
( while true; do
    sleep 60
    age=$(( $(date +%s) - $(stat -f %m "$LOGS/scorer.log" 2>/dev/null || date +%s) ))
    if [ "$age" -gt 900 ]; then
      echo "=== $(date -u +%FT%TZ) scorer silent ${age}s, killing" >> "$LOGS/scorer.log"
      pkill -f "tsx/dist/cli.mjs scorer.ts"; pkill -f "tsx/dist/loader.mjs scorer.ts"
    fi
  done ) &

# The simulated crowd, once per epoch: the main personas at +60 s, the ten newer ones at +180 s. Every sixth
# epoch is quiet, so the jackpot bar visibly waits instead of only ever filling.
if [ "$CROWD" = "1" ]; then
  ( last=-1
    while true; do
      now=$(date +%s); e=$(( (now - GENESIS) / EPOCH_SECS )); into=$(( (now - GENESIS) % EPOCH_SECS ))
      if [ "$now" -ge "$GENESIS" ] && [ "$e" != "$last" ] && [ "$into" -ge 60 ] && [ "$into" -lt 500 ]; then
        last=$e
        if [ $(( e % 6 )) -eq 2 ]; then mode=--quiet; else mode=--loud; fi
        echo "$(date -u +%FT%TZ) epoch $e $mode" >> "$LOGS/crowd.log"
        (cd "$ROOT/agents" && "$TSX" seed.ts $mode) >> "$LOGS/crowd.log" 2>&1
      fi
      sleep 15
    done ) &
  ( last=-1
    while true; do
      now=$(date +%s); e=$(( (now - GENESIS) / EPOCH_SECS )); into=$(( (now - GENESIS) % EPOCH_SECS ))
      if [ "$now" -ge "$GENESIS" ] && [ "$e" != "$last" ] && [ "$into" -ge 180 ] && [ "$into" -lt 500 ]; then
        last=$e
        echo "$(date -u +%FT%TZ) newcrowd epoch $e" >> "$LOGS/crowd.log"
        (cd "$ROOT/agents" && "$TSX" newcrowd.ts round) >> "$LOGS/crowd.log" 2>&1
      fi
      sleep 20
    done ) &
fi

# Top up the agent accounts every 20 minutes: a contract whose free balance runs out fails every state write.
( while true; do
    sleep 1200
    { echo "=== $(date -u +%FT%TZ) fund"
      (cd "$ROOT/agents" && "$TSX" fund.ts) 2>&1 | tail -8
    } >> "$LOGS/fund.log" 2>&1
    [ "$PUBLISH" = "1" ] && bash "$OPS/publish.sh" >> "$LOGS/publish.log" 2>&1
  done ) &

wait
