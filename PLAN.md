# $YAP plan

Deadline: 2026-11-14 23:59 UTC. Tracks: memecoins + social. Testnet only.

## Phase 1: contract (`contracts/yap`)
- [x] Cargo workspace (root Cargo.toml, release profile), crate `contracts/yap`.
- [x] Config + init + validation; genesis mint/split; FT + storage + metadata; no admin methods.
- [x] Epoch reports: scorer bonds, m-of-n identical report hash → proposed.
- [x] Challenge via ft_transfer_call → Sputnik `add_proposal` (FunctionCall to `resolve_challenge`); resolve (DAO only); expire.
- [x] finalize: EMA target, loud/quiet/dead, streak/best_streak, mint/burn, split yapper/staker/dao.
- [x] Merkle claim (yappers + arenas) with shared test vectors; burn_unclaimed.
- [x] Staking sYAP with reward-per-share accumulator, unbonding.
- [x] Arenas: open via ft_transfer_call (accepted tokens), tier gate in leaves, per-epoch pools, close/refund.
- [x] NEP-297 events for every state change.
- [x] Unit tests for R-1..R-7; sandbox test with the real Sputnik wasm (full flow incl. DAO-funded arena and challenge).
- [x] `cargo near build non-reproducible-wasm` OK; wasm size noted.

## Phase 2: indexer + scoring (`indexer/`, `scoring/`)
- [x] pnpm workspace root (package.json, pnpm-workspace.yaml), TS strict ESM.
- [x] FastData KV reader (testnet + mainnet read-only), paginated, social-kv/1 validity rules.
- [x] Canonical epoch dataset + data_hash.
- [x] Scoring: PageRank smart followers, engagement weights, post/yap score, caps, sybil damping, mindshare, tiers, arenas. Integer math.
- [x] merkle.ts + `scoring/test-vectors.json` (leaf/node/proof vectors the Rust side also checks).
- [x] verify.ts; docs/SCORING.md with a worked example.
- [x] Tests (vitest) incl. like-ring, spam, self-like, new-account cases; run on real mainnet near.social data read-only and print the top 20.

## Phase 3: agents + testnet live
- [x] labeler (NEAR AI TEE, attestation saved; --mock SIMULATED), label cache, cost print.
- [x] Deploy: sub-accounts, Sputnik DAO (council = yap-hq + council-1 + council-2), token contract with testnet config (epoch 600 s), lock keys (delete full-access keys of token account) and print proof.
- [x] crowd seeder (24 bot personas incl. spam bots + like-ring) writing real testnet near.social data.
- [x] scorer service: index → label → score → publish → 2-of-3 submit → finalize → claims; runs epochs live.
- [ ] One challenge handled by a DAO vote on testnet; one DAO-funded arena paid out.
- [ ] docs/TESTNET.md with real tx hashes.

## Phase 4: sim
- [x] 60-epoch scenarios using real scoring code; web/public/sim.json; sim/RESULTS.md.

## Phase 5: web
- [x] All pages in SPEC.md (Mindshare, Leaderboard, Profile, Arenas, Earn, Token, Feed/Compose, Verify, Governance, Sim), original brand, testnet live + mainnet read-only.

## Phase 6: README + polish
- [x] README (story, how it works, NEAR features used, what is simulated, limits), demo script.

## Progress log
P3 2026-11-07: Read AGENTS.md, RULES.md, SPEC.md Agents, PLAN.md, contract API, scoring spec, Phase 2 APIs, and the testnet/attestation helpers. Corrected Phase 3 council plan to use independent council accounts. Starting agents package; verification pending.
P3 2026-11-07: Added agents workspace scaffold, shared testnet signing/transaction helpers, fixed label prompt, and gitignored key/cache/state paths. Installing near-api-js and DCAP dependencies next; dependency fetch may take several minutes. Verification pending.
P1 2026-11-07: Read AGENTS.md, RULES.md, SPEC.md, PLAN.md and the contract/sandbox setup. Starting the Cargo workspace and contract modules; verification pending.
P1 2026-11-07: Added config, Merkle, epoch, challenge, staking, and arena state/transition modules. Starting cargo dependency fetch/check; this may take several minutes.
P1 2026-11-07: Shared Merkle vectors generated and five Rust unit tests pass (genesis/emission/dead, challenge, claims, staking/arena, vectors). Starting the wasm build; it may take several minutes.
P1 2026-11-07: First wasm build exposed missing ABI schema derives; added them to public data types. ABI generation now passes and the wasm compilation is running. Added a real Sputnik DAO sandbox flow; execution pending.
P1 2026-11-07: Wasm build passes at 331407 bytes. Starting near-workspaces sandbox test with real Sputnik DAO challenge vote and DAO-funded arena; sandbox startup may take several minutes.
P1 2026-11-07: Real Sputnik DAO sandbox flow passed. Expanded to nine unit tests and corrected whole-epoch staking snapshots plus dead-epoch EMA. Rerunning format, clippy, wasm build and sandbox against the final source.
P1 2026-11-07: Eleven unit tests pass, including failed external payout restoration and rejected DAO proposal expiry. `cargo fmt --all` and `cargo clippy -p yap --all-targets -- -D warnings` pass. Rebuilding wasm and rerunning the sandbox after these fixes.
P1 2026-11-07: Full suite passed against the rebuilt wasm. Final review found a cooldown edge case for multiple unstakes; changed staking to independent unbond tranches and added a regression test. Repeating final checks for this last change.
P1 2026-11-07: Phase 1 complete. Final `cargo fmt --all`, `cargo clippy -p yap --all-targets -- -D warnings`, wasm build (341906 bytes), and `cargo test -p yap` (12 unit tests plus real Sputnik DAO sandbox test) all passed. Public API documented in contracts/yap/API.md; no blockers.
P1 2026-11-07: Final arithmetic review kept the EMA target positive after dead epochs and removed premature ratio rounding. Superseding the prior build/test count: `cargo fmt --all`, strict clippy, wasm build (341968 bytes), and `cargo test -p yap` (13 unit tests plus real Sputnik DAO sandbox test) pass; no blockers.
P2 2026-11-07: Read AGENTS.md, RULES.md, SPEC.md and PLAN.md. Inspected near.social standard/API and FastData KV OpenAPI; confirmed POST /v0/history/social paginates all predecessors but has no block-time filter, so the reader must scan and filter history. Live mainnet/testnet endpoint probes returned rows. Verification: curl and OpenAPI schema inspection.
P2 2026-11-07: Added pnpm 10.13.1 workspace and strict ESM package scaffolding for indexer/scoring. Verification pending dependency install and build; package install will be the next long command.
P2 2026-11-07: Implemented initial pure scoring modules and FastData history reader/replay; pnpm install and pnpm build passed. Starting a potentially long exhaustive mainnet history scan because the KV API has no time-range filter; output will be checked before using it as a sample.
P2 2026-11-07: Exhaustive mainnet KV history scan completed (3,423 rows); the seven-day window produced a canonical dataset and hash. Ran the scorer with explicitly simulated mock labels and saved output under data/mainnet-sample. Added independent Python-generated Borsh/SHA-256 Merkle vectors. Verification: indexer/scorer CLIs completed; TypeScript build passed.
P2 2026-11-07: Added social-kv replay and scoring documentation, adversarial Vitest cases, and cross-language checks against contracts/yap/tests/vectors.json. Build and 11 tests passed before final refinements. Re-running the mainnet scan now after excluding API cursor position from the canonical dataset and preserving fractional stake precision.
P2 2026-11-07: Review tightened first-valid-write handling, fixed-point stake precision, deterministic integer tie handling, and arena best-post/sybil rules. Cross-language Merkle vectors and adversarial tests passed. Refreshing saved mainnet artifacts after the replay changes; no deployment or signing involved.
P2 2026-11-07: Added recursive reply validation (including cycle rejection) and a reversed-input canonical-hash test. pnpm build and all 12 Vitest tests passed. Refreshing the read-only sample to account for the reply replay fix.
P2 2026-11-07: Phase 2 complete. Final mainnet sample from 1793458204844 to 1794063004844 ms has 3,423 historical rows, 273 in-window writes, 34 posts and 12 positive-score yappers; full top-20-or-fewer list and topics are saved in data/mainnet-sample/scores.json with simulated-label/read-only flags. Final dataset hash is 8bb57795b92e935953f88f25957a30febadb9593ceb2ad7d07c4d0d23b4a6105. Verification: pnpm build, 12 Vitest tests (including Rust Merkle vectors), indexer/scorer CLIs, and local report recomputation all passed. No on-chain report exists for this read-only preview.
P2 2026-11-07: Final acceptance rerun: added reply-backlink first-write handling, then pnpm build and all 13 Vitest tests passed. Re-ran the exhaustive mainnet indexer; dataset hash and row counts were unchanged, so saved scores remain current. The earlier 12-test count is superseded by this 13-test run.
P4 2026-11-07: Read AGENTS.md, RULES.md, SPEC.md Sim section, PLAN.md, docs/SCORING.md, scoring/indexer APIs and contract R-3 arithmetic. Confirmed workspace already lists sim. Added seeded social writes, R-3 port, sim-only defence wrapper, output writer and tests; verification pending. Installing workspace links and running build/tests next.
P4 2026-11-07: pnpm install refreshed the lockfile; pnpm build passed for scoring/indexer/sim and both R-3 Vitest cases passed. Starting the full seeded 60-epoch run; spam-farm replay and scoring may take several minutes. Output verification pending.
P4 2026-11-07: First full run completed and wrote sim.json/RESULTS.md. Inspection found fade activity rounded to zero and a counterfactual PageRank probe omitted zero-score bots; corrected both, concentrated ring engagement for the pair-cap scenario, and made claim allocation match scorer's integer remainder order. Re-running validation and sim; first-run figures are superseded.
P4 2026-11-07: Corrected run completed all six 60-epoch scenarios; output inspection confirmed the fade retains attention and supply reconciles with genesis plus mint minus burn. Aligned published config with 600-second synthetic testnet epochs and added a reproducible-data test. Final pnpm build and all 16 tests passed; regenerating the final output now.
P4 2026-11-07: The output run passed with testnet epoch duration. Final review unified the scenario RNG and claim choices under the published root seed 20261107; regenerating outputs once more so documented seed matches every random input. No contracts/ changes.
P4 2026-11-07: Phase 4 complete. Final pnpm sim generated six 60-epoch series and RESULTS.md from seed 20261107. Final pnpm build and all 16 tests passed; JSON checks confirmed 60 ordered rows per scenario, 600-second config, dead epochs from 20, and supply = genesis + minted − burned within six-decimal display rounding. No contracts/ changes.
P3 2026-11-07: (supervisor, Codex out of credit) Deployed on testnet: token.yap-hq.testnet (all keys deleted), Sputnik DAO dao.yap-hq.testnet (council yap-hq + council-1/2, 2 of 3), scorer bonds. Labeler uses Qwen/Qwen3.8-27B with verified TEE attestation (22 checks). Crowd of 24 personas writes real near.social testnet data. Scorer reported epoch 0 (2/3), watchdog recomputed it: match. Arena #near funded by DAO proposal 0 (approved 2/3). Collusion demo armed for epoch 3 (scorer --tamper 3) with watchdog auto-challenge.
P5 2026-11-07: (supervisor) Web app built: Mindshare, Leaderboard, Profile + Yap card, Arenas (+DAO proposal builder), Feed/compose, Earn, $YAP, Verify (in-browser recompute matches chain for epoch 0), Governance, Sim, How. Screenshots checked at 1440 and 390.
P7 2026-11-07: Trusted circle. contracts/steward (8 unit tests + sandbox test with real Sputnik: promote by proof -> DAO role, capped grant paid from treasury, over-cap/over-budget/non-member refused, demote after season). Testnet: steward.yap-hq.testnet deployed + locked; council approved ChangePolicy (proposal 1); keeper promoted y01, y02 (Gold, epoch 2; proposals 2-3); y01 granted 120 YAP to y15 (proposal 4, Approved by steward). UI: Trusted circle on Governance.
P8 2026-11-07: Mainnet read-only board now uses real TEE labels (83 posts / 30 days, $0.025, attestation verified). @yapbot (yapbot.yap-hq.testnet): scans near.social mentions, builds facts from published epochs + steward, Qwen3.8-27B (attested, 22 checks) writes the reply, posted on chain; first two replies verified grounded. UI: Ask @yapbot on Profile and Feed; crowd personas ask it sometimes.
