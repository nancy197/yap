# $YAP: mechanism rules (source of truth)

$YAP is yap-to-earn that nobody can switch off. Posts, likes, reposts, replies and follows are
near.social writes (FastData KV on the account `social`), so they are public chain data. A
deterministic scoring pipeline turns one epoch of that data into Yap scores. The token contract
mints the epoch's emission to yappers by Merkle claim. Supply reacts to how much real attention
the community produced.

Background: on 2026-01-15 X banned apps that reward posting; Kaito shut down Yaps (about 70% of
KAITO's utility) the next day. $YAP rebuilds the Kaito feature set on near.social, where the data
lives on chain and no platform can revoke API access.

Every number below is an init parameter. It is fixed at `new()` and readable via `get_config()`.
There is no owner, no admin key and no upgrade method. After deploy, the deployer deletes the
contract account's full-access keys (a script does this and prints the proof).

## R-1 Token
- NEP-141 + NEP-145 storage + NEP-148 metadata. Symbol `YAP`, 18 decimals.
- At init the contract mints `initial_supply` and splits it by `genesis_split`. Defaults:
  - 60% to the **Reserve**, held by the contract.
  - 25% to the **community DAO**, an existing Sputnik DAO v2 account given at init.
  - 15% to the deployer for liquidity and the launch, e.g. a meme.cooking-style fair launch.
- Burns are real: they reduce `ft_total_supply`. Every mint and burn emits a NEP-297 event
  (`ft_mint`/`ft_burn` per NEP-141 events, plus `yap_*` events below).

## R-2 Epochs and attention
- `epoch_secs` is fixed at init: 86400 on mainnet, 600 on the testnet demo. Epoch `e` covers block
  time `[genesis_ts + e*epoch_secs, genesis_ts + (e+1)*epoch_secs)`.
- The scorers submit an **EpochReport** for `e` after it ends (R-5). It contains:
  - `attention`: the sum of all Yap scores (R-4), scaled ×1e6, u128.
  - `yappers_root`: Merkle root of `(account, yap_amount, score, tier)` leaves.
  - `arenas`: per-arena Merkle roots (R-7).
  - `labels_hash`: sha256 of the AI quality-label file (R-4.3).
  - `data_hash`: sha256 of the canonical epoch dataset.
  - `uri`: where the dataset, labels and full scores are published.
- `attention_target` follows the community. It is an EMA of past `attention` with
  `ema_bps = 2000`, i.e. 20% weight on the new epoch. It is seeded at init with
  `initial_attention_target`.

## R-3 Emission, streak, burn (the meme mechanic)
Let `ratio = attention / attention_target`.
- **Loud epoch** (`ratio >= loud_bps/10000`, default 0.8):
  - `streak += 1` and `best_streak = max(best_streak, streak)`.
  - `emission = base_emission * min(ratio, max_ratio) * (1 + min(streak, streak_cap) * streak_step_bps / 10000)`.
    Defaults: `max_ratio = 3.0`, `streak_cap = 10`, `streak_step_bps = 500` (+5% per loud epoch in a row, up to +50%).
  - The emission is minted fresh, so supply grows when the community is loud.
- **Quiet epoch** (`ratio < loud_bps/10000`):
  - `streak = 0`, `emission = base_emission * ratio` (it shrinks with attention).
  - The contract also **burns** `quiet_burn_bps` (default 300 = 3%) of the Reserve. A meme nobody
    talks about eats its own treasury.
- **Dead epoch** (`attention == 0`, or no report finalized within `report_deadline_epochs`):
  - `emission = 0`, burn `dead_burn_bps` (default 1000) of the Reserve.
  - Anyone can call `crank_dead_epoch(e)` once the deadline has passed.
- Split of each epoch's emission:
  - `yapper_bps` (default 8000) to yappers by Yap score (Merkle claim).
  - `staker_bps` (default 1000) to sYAP stakers, pro rata to stake-epochs (R-6).
  - `dao_bps` (default 1000) to the community DAO.
- **Use it or lose it:** a claim is open for `claim_epochs` (default 14) epochs. After that,
  anyone can call `burn_unclaimed(e)`, which burns what is left.
- The "high score" `best_streak`, the current `streak` and the running totals of minted and
  burned YAP are on chain and shown on the token page.

## R-4 Yap score (deterministic; spec in SCORING.md)
1. **Data.**
   - The epoch dataset is every `social-kv/1` write with block time in the epoch, plus the follow
     graph and stakes as of the epoch end. It is read from FastData KV (testnet:
     `kv.test.fastnear.com`, mainnet: `kv.main.fastnear.com`, account `social`).
   - Validity rules are those of the near.social standard. Same input gives the same output, byte
     for byte.
2. **Smart followers.**
   - PageRank over the follow graph: damping 0.85, 40 iterations, teleport weighted by
     `1 + sqrt(stake)`.
   - "Smart" accounts are the top `smart_pct` (20%) by rank among accounts with at least
     `min_followers` (3).
   - An account's smart followers are its followers that are smart.
3. **Quality labels.**
   - Every top-level post, reply and quote in the epoch gets a label q ∈
     {0 spam/bot/off-topic, 1 low effort, 2 normal, 3 insightful}.
   - The labeler is an AI model running in a verified TEE on NEAR AI Cloud, at temperature 0, with
     a fixed published prompt (prompt sha256 in the report).
   - The label file is published, and the report carries its hash plus the attestation report hash.
   - Labels are the only non-deterministic input. Everything after them can be recomputed by anyone.
4. **Engagement weight** of a like, repost, reply or quote by account `u` on post `p`:
   - `w(u) = rank_norm(u) * (1 + 0.5*is_smart(u)) * (1 + log10(1 + stake(u)))`.
   - Multiplier by type: like 1, repost 2, reply 3 (only if the reply's own q ≥ 2), quote 4 (only if q ≥ 2).
   - Ignored: self engagement and engagement from accounts created (first write) in the same epoch.
   - Rings: the weight of `u`'s engagement on any single author is capped at 3 actions per epoch.
5. **Post score.** `post_score = Q[q] * (1 + ln(1 + Σ w))`, with `Q = [0, 0.25, 1, 2]`.
6. **Yap score.**
   - It is the sum of the author's best `max_posts` (10) post scores in the epoch.
   - Accounts with zero smart followers and no stake get ×0.5 (sybil damping).
7. **Mindshare** of a topic (hashtag, cashtag or @account) is its share of the epoch's total
   post_score among posts that mention it. It is used by the UI and by arenas.
8. **Tier** (reputation, used for access):
   - Computed from the trailing 30-epoch Yap score percentile: Inner Circle (top 1%), Gold (top 10%),
     Silver (top 30%), Bronze (any score > 0), None.
   - The tier is in the yappers leaf, so the contract can check it with a proof.

## R-5 Scorers, challenge, finality (no single trusted party)
- `scorers`:
  - A fixed list of accounts set at init, each with a bond (`scorer_bond`).
  - A report for epoch `e` becomes **proposed** when `scorer_quorum` (e.g. 2 of 3) scorers submit
    the identical report hash.
  - The scoring after labels is deterministic, so honest scorers agree. Only the labeler's label
    file is fixed by its hash.
- **Challenge window** of `challenge_secs` (testnet 300, mainnet 43200):
  - Anyone can `challenge(e, reason_uri)` with `challenge_bond` YAP.
  - The contract then opens a proposal on the **community Sputnik DAO**. It is a FunctionCall
    proposal that calls `resolve_challenge(e, upheld)` on the token, and the DAO council votes on it.
  - Upheld: the report is discarded and the scorers who signed it lose their bond. Half goes to the
    challenger and half is burned. Scorers may resubmit.
  - Rejected: the challenger's bond is burned.
- After the window with no open challenge, anyone calls `finalize(e)`. That applies R-3 (mint or
  burn, streak) and opens claims.
- `resolve_challenge` is callable only by the DAO account (predecessor check).

## R-6 Staking (sYAP)
- `ft_transfer_call` YAP with `{"stake":{}}` to stake. Stake raises the account's engagement weight
  (R-4.4) and earns the staker share (R-3).
- Unstake starts `unbond_epochs` (7) of cooldown. Then `withdraw`.
- The staker share of epoch `e` is split by stake held for the whole epoch, using per-account
  snapshots (an accumulator: reward-per-share).

## R-7 Arenas (Kaito "Creator arena" / project leaderboard; Social track)
- Any account, typically a project's or community's Sputnik DAO, opens an arena:
  - It sends `ft_transfer_call` of any accepted NEP-141 (YAP, wNEAR, USDC) with msg
    `{"open_arena":{topic, per_epoch, epochs, min_tier, title}}`.
  - Example: a DAO FunctionCall proposal that funds an arena for `#rhea` with 50 wNEAR per epoch
    for 7 epochs, Silver and above only.
- Each epoch's report has a Merkle root per active arena. It ranks yappers by Yap score restricted
  to posts that mention the topic, among accounts whose tier ≥ `min_tier`.
- Payout: `per_epoch` split pro rata to the arena score, claimable for `claim_epochs`.
- When the arena ends, anything unspent (epochs with no eligible yappers) can be refunded to the
  opener with `close_arena`.
- Arena state, budget left and per-epoch payouts are public. The opener cannot pull funds early.

## R-8 Launch (reputation-gated fair sale; Kaito Launchpad equivalent)
- **Stretch goal.** A project deposits tokens and opens a sale window.
- Yappers commit NEAR. The cap per account depends on tier, proved by the latest yappers leaf:
  Inner Circle 5×, Gold 3×, Silver 2×, Bronze 1×.
- After the window, everyone gets the same price (a meme.cooking-style batch auction), and
  over-commits are refunded.

## R-10 Trusted circle (reputation becomes DAO membership)
- The `steward` contract (`contracts/steward`) is immutable: no owner, no setters, and its keys are deleted. The
  community DAO grants it a `steward` role through a council `ChangePolicy` vote. That role may file and approve
  `add_member_to_role`, `remove_member_from_role` and `transfer` proposals.
- **promote** (anyone can call):
  - It takes a yapper leaf (`account, e, amount, score, tier, proof`) with `tier >= min_tier`. On testnet,
    `min_tier` is 3 = Gold.
  - The steward reads `get_epoch(e)` from the token. The epoch must be Finalized, the proof must verify against
    `yappers_root`, and `e` must be within `season_epochs` of now.
  - The steward then files `AddMemberToRole(trusted)` and approves it with its own role, so no council vote is needed.
  - Membership expires `season_epochs` after the proof epoch. A newer proof only extends it.
- **demote**: once a season has ended, anyone can trigger `RemoveMemberFromRole` the same way.
- **grant**: an active trusted member can send at most `grant_cap` YAP (300) from the DAO treasury per grant.
  - Grants are also limited to `period_budget` (1,500) per season. The steward files a `Transfer` proposal and approves it.
  - Self-grants are refused.
  - Anything above the caps stays a normal council proposal.
- Every membership change and grant is a Sputnik proposal, visible in Trezu and on the explorer. Every membership
  points to the epoch and Merkle leaf that earned it.

## R-9 Sybil resistance: limits, stated plainly
- Smart-follower PageRank, stake weighting, the per-author caps and the AI spam label make farming
  expensive, not impossible.
- A patient ring of aged accounts that follow each other and post decent AI text can still earn.
- The DAO challenge is the backstop. The README states this, and the sim (`sim/`) measures how much
  a like-ring and a spam farm capture under each defence.
