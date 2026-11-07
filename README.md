# $YAP: yap-to-earn that nobody can switch off

**Tracks:** Memecoins With Mechanics · Social Money · NEAR HACKATHON 2026 · live on NEAR testnet

On **15 Jan 2026** X banned apps that reward posting. The next day Kaito shut down Yaps, the product behind
about 70% of its token's utility. One API decision ended a whole category.

**$YAP rebuilds the Kaito Yaps feature set on near.social**, where every post, like, repost, reply and follow
is a NEAR transaction (FastData KV writes to the account `social`). The data is public chain data. Nobody can
revoke an API key.

- **The meme does something.** Supply follows the community's attention:
  - Loud epochs mint more and grow a streak (the "high score" is on chain).
  - Quiet epochs burn 3% of the Reserve.
  - Silence burns 10%.
  - Unclaimed rewards burn after 14 epochs.
  - Every parameter is fixed at launch, and the contract has **no full-access key**.
- **Communities run it with their own treasury.** A stock **Sputnik DAO v2** (works in **Trezu**):
  - funds topic **Arenas** by proposal;
  - receives 10% of every mint;
  - is the **court of appeal** for scoring disputes. The token contract itself files the proposal.
- **Reputation becomes DAO membership (the Trusted circle).**
  - Gold+ yappers are added to the DAO's `trusted` role by an immutable steward contract.
  - The steward checks their Merkle leaf against a finalized epoch, so there is no council vote and no admin.
  - Trusted members can send small, capped treasury grants: 300 YAP each, 1,500 per season.
  - Membership expires each season unless it is re-earned.
- **Reputation-gated access:**
  - Tiers (Bronze → Inner Circle) come from on-chain score history.
  - Arenas can require a tier.
  - Every point traces back to a near.social post.

## What runs today (testnet, real transactions)

| Piece | Where |
| --- | --- |
| $YAP token (NEP-141 + mechanics, locked) | `token.yap-hq.testnet` |
| Community DAO (Sputnik v2; council of 3, 2 to pass) | `dao.yap-hq.testnet` |
| Steward (reputation → DAO `trusted` role, capped grants; locked) | `steward.yap-hq.testnet` |
| Scorers (bonded, 2-of-3 identical report hash) | `scorer-1..3.yap-hq.testnet` |
| Independent watchdog (recomputes every report, challenges mismatches) | `watchdog.yap-hq.testnet` |
| AI quality labeler | `Qwen/Qwen3.8-27B` in a verified TEE on NEAR AI Cloud (Intel TDX + NVIDIA attestation, nonce-bound) |
| Simulated community (clearly labelled) | `y01..y24.yap-hq.testnet` |

The simulated community has 15 honest personas writing with an AI model, 4 spam bots, and a 5-account like-ring.

Testnet epochs are 10 minutes; mainnet would use 1 day. Every transaction is listed in [docs/TESTNET.md](docs/TESTNET.md),
and the app's $YAP page shows them live.

## The mechanic

```
near.social writes ──► epoch dataset ──► AI quality labels (TEE) ──► deterministic score ──► report on chain
   (FastData KV)        (data_hash)       (labels_hash, attestation)   (integer math, open)   2-of-3 scorers
                                                                                                    │
                       challenge window (anyone bonds YAP) ◄────────────────────────────────────────┘
                              │ challenged → token opens Sputnik DAO proposal → council rules
                              ▼
   finalize: attention vs moving target ──► LOUD: mint ≤3× base + streak bonus (+5%/epoch, cap +50%)
                                         ──► QUIET: streak = 0, burn 3% of Reserve
                                         ──► DEAD (no report): burn 10% of Reserve
   split: 80% yappers (Merkle claim) · 10% sYAP stakers · 10% DAO · unclaimed after 14 epochs burns
```

Full rules: [RULES.md](RULES.md). Scoring formulas with a worked example: [docs/SCORING.md](docs/SCORING.md).

### Yap score

1. **Smart followers.** PageRank over the near.social follow graph, with teleport weighted by stake. The top 20% are "smart".
2. **Quality.** Each post gets a label `q ∈ {0 spam, 1 low, 2 normal, 3 insightful}` from the TEE-attested model.
   - The model runs at temperature 0 with a fixed prompt whose hash is in the report.
   - Labels are the only non-deterministic input, and their hash is on chain.
3. **Engagement.**
   - Likes, reposts, replies and quotes are weighted by the engager's rank, smart status and stake.
   - Self-engagement and same-epoch new accounts are ignored.
   - At most 3 actions per engager→author pair count.
4. **Score.** `post = Q[q] × (1 + ln(1 + engagement))`. Yap score = the best 10 posts, halved for accounts with no
   smart followers and no stake.

## Kaito feature → YAP

| Kaito | YAP on NEAR |
| --- | --- |
| Yap points | Yap score per epoch, paid in $YAP by Merkle claim |
| Mindshare (yappers, tokens) | Mindshare treemaps for accounts and topics (#hashtags, $cashtags, @accounts), with time windows and movers |
| Smart followers | Stake-weighted PageRank over the near.social follow graph |
| Yapper leaderboards | Global and per-topic leaderboards, rank change, tier |
| Project leaderboards / campaigns | Arenas, funded by DAO proposal, tier-gated, paid per epoch |
| Staked token boosts | sYAP: engagement weight plus the stakers' share |
| Anti-slop filters | TEE-attested AI labels, hashed on chain |
| Closed scoring | Open code and published data. Recompute any epoch in your browser on the Verify page |

The app ([web/](web/)) has these pages:
- Mindshare, Yapper Leaderboard, Profile (with a downloadable Yap card), Arenas.
- Feed: post, like, repost, reply and follow on near.social from a burner wallet.
- Earn (claims, staking), $YAP (streak, supply, burns, lock proof).
- Verify, Governance, Simulation, How it works.

It also has a **mainnet read-only** mode that ranks real near.social mainnet yappers. That mode is unrewarded and uses
heuristic labels.

The UI is our own brand. Kaito is named only as background.

## Run it

```bash
pnpm install
pnpm -r test                                  # scoring + indexer + sim tests (vitest)
cargo test -p yap -p steward                   # contract unit tests + sandbox tests with the real Sputnik DAO wasm
pnpm sim                                       # 60-epoch economy simulation → web/public/sim.json, sim/RESULTS.md
pnpm -C web dev                                # the app (http://localhost:5180)

# testnet operators (keys in ~/.near-credentials/testnet, never in the repo)
pnpm -C agents deploy                          # sub-accounts, Sputnik DAO, token, scorer bonds, delete full-access keys
pnpm -C agents seed --setup                    # simulated community profiles + follow graph
pnpm -C agents crowd                           # simulated community schedule (loud / quiet epochs)
pnpm -C agents scorer                          # index → label (TEE) → score → publish → report → finalize → claims
pnpm -C agents watchdog                        # independent audit + automatic challenge on mismatch
pnpm -C agents gov arena '#near' 500 6 1       # DAO proposal: fund an arena from the treasury
pnpm -C agents gov vote <id>                   # council votes (2 of 3)
pnpm -C agents steward deploy                  # steward contract + council ChangePolicy (steward + trusted roles) + lock
pnpm -C agents steward keeper                  # promote Gold+ yappers each finalized epoch, demote expired ones
pnpm -C agents steward grant <from> <to> <YAP> <memo>   # a trusted member's capped treasury grant
```

`NEARAI_API_KEY` in `.env` enables the real labeler. Without it, labels fall back to a heuristic, and the run is
marked SIMULATED.

## Simulation (60 epochs, real scorer)

| Attacker | No defences | All defences |
| --- | ---: | ---: |
| Spam farm (100 bots) | 87.0% of emission | 26.9% |
| Like ring (10 accounts) | 52.3% | 19.1% |

In the dead-meme scenario the community goes silent at epoch 20. By epoch 59 its Reserve has shrunk from
600,000 to 8,869 YAP. Details are in [sim/RESULTS.md](sim/RESULTS.md).

## Limits

- **Sybil resistance makes farming expensive, not impossible.** A patient ring of aged accounts that writes decent
  AI text still earns, about 19% in simulation. The DAO challenge and the per-epoch tier gate are the backstop.
- **Labels come from one model.** Their hash is on chain, but a different model would label differently. Each post is
  labelled once, then cached.
- **The 2-of-3 scorers are independent signers, but our testnet scorers run from one service.** Scoring after labels is
  deterministic, so any third party can run `watchdog` and challenge.
- **near.social mainnet is small today** (about 130 accounts). The testnet community is simulated and marked as such
  everywhere.
- **The deploy flow differs from a production launch.** On testnet, the init call is a separate transaction from the
  deploy. A mainnet launch should deploy, init and lock in one batch.

## Built during the hackathon

Everything in this repository was written during NEAR HACKATHON 2026, 7–14 Nov 2026. Reused from our other
project in this hackathon (Quorum), copied rather than imported:
- the NEAR AI attestation checker;
- the Sputnik sandbox test pattern.

License: MIT.
