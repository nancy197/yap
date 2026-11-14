> **v4 note:** the token mechanic changed to Proof of Yap (blocks, jackpot, rising difficulty, no burns). RULES.md R-3 and
> `contracts/yap/API.md` are current; the loud/quiet/streak/burn fields below describe the original build plan.

# $YAP technical spec

Hackathon: NEAR HACKATHON 2026, deadline 2026-11-14 23:59 UTC. Tracks: Memecoins With Mechanics
(`memecoins`) + Social Money (`social`). Everything runs on NEAR **testnet**. Mainnet is
read-only: the app may READ mainnet near.social data and show it, but never sign mainnet
transactions.

## Layout (pnpm workspace + cargo workspace)
```
contracts/yap/          Rust NEP-141 token + mechanics (near-sdk =5.30.1, Rust 1.95 pinned)
contracts/tests/fixtures/sputnikdao2.wasm   Sputnik DAO v2 release wasm
indexer/                TS: read FastData KV `social` → canonical epoch dataset (JSON)
scoring/                TS: dataset + labels → scores, smart followers, mindshare, tiers, merkle
agents/                 TS: labeler (NEAR AI Cloud TEE), scorer service, crowd seeder (testnet bots)
sim/                    TS: 60-epoch economy sim, scenarios → web/public/sim.json
web/                    Vite + React 19 app (Kaito-style features, original brand)
scripts/                deploy/init/lock-keys/DAO setup scripts (testnet)
docs/                   TESTNET.md (real tx log), SCORING.md, ARCH.md
```

## Contract `contracts/yap`
- **Stack:** near-sdk 5.30.1 with features `legacy`; near-contract-standards for FT and storage
  management. Built with `cargo near build non-reproducible-wasm`.
- **Init:** `new(config: Config, metadata)`.
  - `Config` holds every parameter in RULES.md: `epoch_secs`, `genesis_ts`, `base_emission`,
    `initial_attention_target`, `ema_bps`, `loud_bps`, `max_ratio_bps`, `streak_cap`,
    `streak_step_bps`, `quiet_burn_bps`, `dead_burn_bps`, `report_deadline_epochs`, `yapper_bps`,
    `staker_bps`, `dao_bps`, `claim_epochs`, `scorers`, `scorer_quorum`, `scorer_bond`,
    `challenge_secs`, `challenge_bond`, `unbond_epochs`, `dao`, `accepted_arena_tokens`,
    `initial_supply`, `genesis_split`.
  - Validate all of them. There are no setters.
- **Views:**
  - `get_config`, `get_state` (streak, best_streak, attention_target, minted_total,
    burned_total, reserve, current_epoch).
  - `get_epoch(e)`, `get_epochs(from, limit)`.
  - `get_arena(id)`, `get_arenas(from, limit)`.
  - `get_stake(account)`, `get_scorer(account)`, `is_claimed(e, account)`, `get_challenge(e)`.
- **Calls:**
  - `scorer_bond_deposit` (via ft_transfer_call msg `{"scorer_bond":{}}`).
  - `submit_report(e, report: EpochReport)`.
  - `challenge(e, reason_uri)` (via ft_transfer_call msg `{"challenge":{epoch, reason_uri}}`).
  - `resolve_challenge(e, upheld)`, DAO only.
  - `finalize(e)`, `crank_dead_epoch(e)`.
  - `claim(e, amount, score, tier, proof)`, `claim_arena(arena_id, e, amount, proof)`.
  - Staking: `stake` (msg), `unstake(amount)`, `withdraw()`, `claim_staker_rewards()`.
  - Arenas: `open_arena` (msg), `close_arena(id)`.
  - `burn_unclaimed(e)`.
- **Challenge → DAO:** a cross-contract call to the DAO's `add_proposal` with
  `kind: FunctionCall { receiver_id: <yap>, actions: [{ method_name: "resolve_challenge", args: base64({epoch, upheld: true}), deposit: "0", gas: "50000000000000" }] }`.
  - The contract attaches the DAO's `proposal_bond`; read it via the `get_policy` view at
    challenge time, or take it from config.
  - The proposal id is stored on the challenge.
  - If the DAO rejects or removes the proposal (or it expires), anyone can call
    `expire_challenge(e)` after `challenge_secs * 4`. That reads the proposal status from the DAO
    and settles the challenge as rejected.
- **Merkle:**
  - `leaf = sha256(0x00 ‖ borsh(epoch:u32, account:String, amount:U128, score:u64, tier:u8))`.
    Arena leaf: `sha256(0x01 ‖ borsh(arena_id:u32, epoch:u32, account, amount))`.
  - Nodes are `sha256(0x02 ‖ min(a,b) ‖ max(a,b))`, i.e. sorted pairs.
  - The TS implementation must match byte for byte, with a shared test vector file:
    `scoring/test-vectors.json`, used by both Rust and TS tests.
- **Safety:**
  - Use checked math everywhere. The emission sum of all leaves must be ≤ the epoch's yapper
    allocation; claims fail past the allocation.
  - FT transfers to claimers handle failure with callbacks that restore state.
  - Events use NEP-297 `{"standard":"yap","version":"1.0.0","event":...}`.
- **Tests:**
  - Unit tests for every rule in RULES.md R-1..R-7: loud/quiet/dead epochs, streak cap, EMA,
    challenge upheld/rejected, unclaimed burn, staking accumulator, arena payout/refund, tier gate.
  - A near-workspaces sandbox test with the real Sputnik DAO wasm covers the full flow: init →
    submit report by 2 of 3 scorers → challenge → DAO council votes → resolve → resubmit →
    finalize → claim → arena funded by a DAO proposal → arena claim.

## Indexer (`indexer/`)
- Source: FastData KV HTTP API. Testnet: `https://kv.test.fastnear.com`; mainnet:
  `https://kv.main.fastnear.com`. Account `social`. Check the API docs at
  https://docs.fastnear.com/fastdata/kv; the near.social standard is
  https://api2.near.social/standard.md.
  - Use the `/v0/history/...` or `/v0/all/...` endpoints, or the bulk listing by key prefix, to get
    every write with `block_height`, `block_timestamp`, `predecessor_id` and key.
  - Paginate with `page_token`.
- Apply the near.social social-kv/1 validity rules: post validity, edges active iff object,
  last-write-wins, created time.
- Output: `data/epochs/<network>/<e>.json`, the canonical dataset with sorted keys and stable
  ordering. Its sha256 is `data_hash`.
- Also a `--network mainnet --read-only` mode so the UI can show real near.social mainnet
  leaderboards. Label these "mainnet (read-only, unrewarded)".

## Scoring (`scoring/`)
- A pure function: `score(dataset, labels, stakes, params) → { yappers[], arenas{}, mindshare[], attention }`.
  - Use integer math (×1e6) so it is deterministic across machines.
  - Use fixed-iteration PageRank with integers or a fixed rounding step.
- Write `docs/SCORING.md` explaining each formula with a worked example.
- `merkle.ts` gives roots and proofs (matching the Rust implementation).
- `verify.ts`: given an epoch URI, recompute everything and compare to the on-chain report. The
  web "Verify" page uses this in the browser.

## Agents (`agents/`)
- **labeler:**
  - Uses NEAR AI Cloud (OpenAI-compatible, https://cloud-api.near.ai/v1, key `NEARAI_API_KEY` in
    `.env`, never print it).
  - Model `Qwen/Qwen3.8-27B`, temperature 0, JSON output `{key, q, reason}` per post, in batches.
  - Attestation verification: Intel TDX via
    @phala/dcap-qvl, NVIDIA NRAS, nonce binding.
  - Save the attestation report and its hash with the labels.
  - Cache labels by post key, so a post is never re-labelled.
  - `--mock`: a deterministic heuristic labeler, marked SIMULATED.
- **scorer service** (`pnpm scorer`):
  - Every epoch end + 30 s: index, label, score, publish files to `web/public/epochs/` (and FastFS
    later), submit the report from each of the 3 scorer accounts.
  - Then finalize after the window and claim for the demo accounts.
  - The crank is permissionless.
- **crowd seeder** (`pnpm seed`):
  - About 24 testnet sub-accounts of the deploy account, each with a persona: builders, traders,
    a meme account, 4 spam bots, and a 5-account like-ring.
  - They write real near.social testnet posts, likes, reposts, replies and follows via
    `__fastdata_kv` (gas 1, deposit 0; the receipt fails by design).
  - Posts are generated by a NEAR AI model with persona prompts.
  - Clearly labelled SIMULATED COMMUNITY in the README and UI.
  - Rates are configurable, so we can make loud and quiet epochs on purpose for the demo.
- Keys live in `~/.near-credentials/testnet` or gitignored `.keys.json`; never commit them.

## Sim (`sim/`)
- 60 epochs, seeded. Scenarios:
  - **Steady:** an organic community.
  - **Hype then fade.**
  - **Dead meme:** activity stops at epoch 20.
  - **Spam farm:** 100 bots.
  - **Like-ring:** 10 accounts.
  - **Whale staker.**
- Outputs per scenario: supply over time, reserve, streak, and the share of emission captured by
  attackers, both with and without each defence (PageRank, AI label, caps, stake).
- Writes `web/public/sim.json` and `sim/RESULTS.md`. Uses the real `scoring/` code on synthetic
  datasets.

## Web (`web/`): Kaito feature set, original brand
- **Brand:** name "YAP", our own logo, wordmark and palette. Do NOT use Kaito's name, logo, colours
  or assets in the UI. Mention Kaito only in the README/"Why" text as background.
- **Layout:** dark-first, data-dense dashboard. Left sidebar nav, top bar with network switch
  (testnet live / mainnet read-only), wallet button, and a search for accounts and topics.
- **Pages:**
  1. **Mindshare** (home):
     - A treemap of topics by mindshare.
     - Top gainers and losers, with tabs 24H / 7D / 30D (in epochs on testnet).
     - Trending posts.
  2. **Yapper Leaderboard:**
     - Global and per topic.
     - Columns: rank, account (avatar/name from near.social profile), Yap score, mindshare %, Δ
       rank, smart followers, tier badge.
     - Time tabs.
  3. **Profile `/u/:account`:**
     - A shareable Yap card.
     - Score history chart, tier and claimable YAP.
     - Top posts, with each post's label and score breakdown.
     - Smart followers list and topics.
  4. **Arenas:**
     - List page.
     - Detail page: sponsor (DAO), budget left, per-epoch pool, min tier, leaderboard, payouts.
     - Create flow: a DAO proposal builder that generates the Sputnik FunctionCall proposal
       (testnet), or a direct fund.
  5. **Earn:**
     - Claim epoch rewards and arena rewards (Merkle proofs from the published files).
     - Stake/unstake sYAP.
  6. **Token:**
     - The meme page: current streak, best streak "high score", today's attention vs target meter.
     - Supply over time, plus a mint/burn log (events with tx links to testnet.nearblocks.io).
     - All fixed parameters.
     - Proof that the contract has no full-access keys.
  7. **Feed / Compose:**
     - Read near.social posts (testnet) and post, like, reply and follow from the app via
       `__fastdata_kv`.
     - Wallet: @near-wallet-selector (MyNearWallet + Meteor) on testnet, plus a one-click burner
       account (faucet https://helper.nearprotocol.com/account).
  8. **Verify:** pick an epoch, recompute scores and the Merkle root in the browser, and show
     match/mismatch against the chain. Also show the labeler's TEE attestation summary.
  9. **Governance:** the community DAO (Sputnik), with challenges and arena proposals.
  10. **Sim:** charts from sim.json.
- **Charts:** follow the dataviz rules (palette validated, one axis, legends,
  hover tooltips). Use Recharts or hand-rolled SVG.
- Must build with `pnpm -C web build` and work at 375px width.
