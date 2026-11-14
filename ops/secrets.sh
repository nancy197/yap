#!/usr/bin/env bash
# Moves everything this deployment needs to sign, and nothing else, between hosts:
#   .keys.json                              the agent and demo persona keys
#   .env                                    NEARAI_API_KEY, and VERCEL_* if this host publishes the site
#   ~/.near-credentials/testnet/yap*.json   the HQ account and the faucet accounts fund.ts tops up from
#   data/funder.txt                         which faucet account to keep using
# None of these is in git.
#
#   bash ops/secrets.sh pack                 writes ~/yap-secrets.tgz on the host that has them
#   # copy it across (AirDrop, or scp ~/yap-secrets.tgz user@host:~/), then on the other host:
#   bash ops/secrets.sh unpack ~/yap-secrets.tgz
#
# The archive holds private keys in clear text. Move it directly between your own machines, and delete it
# from both once it is unpacked.
set -eu
OPS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$OPS/.." && pwd)"
CMD="${1:-}"
ARCHIVE="${2:-$HOME/yap-secrets.tgz}"
CRED=".near-credentials/testnet"

case "$CMD" in
  pack)
    cd "$ROOT"
    [ -f .keys.json ] || { echo "no .keys.json here"; exit 1; }
    files=(.keys.json)
    [ -f .env ] && files+=(.env)
    [ -f data/funder.txt ] && files+=(data/funder.txt)
    # Staged under the archive root so unpack can put them back in $HOME.
    rm -rf .secrets-cred && mkdir -p ".secrets-cred/$CRED"
    for f in "$HOME/$CRED"/yap*.json; do
      [ -e "$f" ] && cp "$f" ".secrets-cred/$CRED/"
    done
    tar czf "$ARCHIVE" "${files[@]}" -C .secrets-cred "$CRED"
    rm -rf .secrets-cred
    chmod 600 "$ARCHIVE"
    echo "wrote $ARCHIVE:"
    tar tzf "$ARCHIVE" | sed 's/^/  /'
    echo "copy it across, unpack it there, then delete it from both hosts."
    ;;
  unpack)
    [ -f "$ARCHIVE" ] || { echo "no archive at $ARCHIVE"; exit 1; }
    cd "$ROOT"
    tar xzf "$ARCHIVE"
    # The credential directory comes out of the archive relative to the repository; move it into $HOME.
    if [ -d "$CRED" ]; then
      mkdir -p "$HOME/$CRED"
      cp "$CRED"/*.json "$HOME/$CRED/" 2>/dev/null || true
      chmod 600 "$HOME/$CRED"/*.json 2>/dev/null || true
      rm -rf .near-credentials
    fi
    chmod 600 .keys.json
    [ -f .env ] && chmod 600 .env
    echo "unpacked:"
    ls -1 .keys.json .env data/funder.txt 2>/dev/null | sed 's|^|  '"$ROOT"'/|'
    ls -1 "$HOME/$CRED"/yap*.json 2>/dev/null | sed 's|^|  |'
    echo "now delete $ARCHIVE on both hosts."
    ;;
  *)
    echo "usage: bash ops/secrets.sh pack|unpack [archive]"
    exit 1
    ;;
esac
