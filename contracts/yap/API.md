# YAP contract API

All `U128` amounts are JSON decimal strings. Epoch IDs and arena IDs are integers. Timestamps in `Config.genesis_ts` are Unix seconds. Roots and hashes are lowercase 32-byte hex strings. Tier values are `0` None, `1` Bronze, `2` Silver, `3` Gold, `4` Inner Circle.

## Init and views

| Method | Arguments | Result |
| --- | --- | --- |
| `new` | `config: Config`, `metadata?: FungibleTokenMetadata` | Initializes fixed rules and genesis balances. |
| `get_config` | none | Fixed `Config`. |
| `get_state` | none | Streak, best streak, target, mint/burn totals, reserve, current epoch, reward per share. |
| `get_epoch`, `get_epochs` | `e`; or `from, limit` | Epoch record(s). |
| `get_arena`, `get_arenas` | `id`; or `from, limit` | Arena record(s). |
| `get_stake`, `get_scorer` | `account` | Stake or scorer bond. |
| `get_challenge`, `is_claimed` | `e`; or `e, account` | Challenge or claim state. |
| `ft_metadata`, `ft_total_supply`, `ft_balance_of`, `storage_balance_of`, `storage_balance_bounds` | Standard NEP-141/145/148 arguments | Standard token views. |

`Config` contains all parameters in `SPEC.md` plus `dao_proposal_bond`, the yoctoNEAR bond attached when the contract opens a Sputnik proposal. `genesis_split` has `reserve_bps`, `dao_bps`, and `deployer_bps` summing to 10,000.

## Calls

| Method | Arguments | Purpose |
| --- | --- | --- |
| `storage_deposit`, `storage_withdraw`, `storage_unregister` | Standard NEP-145 arguments | Register or unregister FT accounts. |
| `ft_transfer`, `ft_transfer_call` | Standard NEP-141 arguments | Transfer YAP; `ft_transfer_call` routes the JSON messages below. |
| `submit_report` | `e: u32, report: EpochReport` | Bonded scorer votes for a Borsh-hashed report. |
| `finalize` | `e: u32` | Finalize after challenge window. |
| `crank_dead_epoch` | `e: u32` | Mark an epoch dead after the report deadline. |
| `resolve_challenge` | `e: u32, upheld: bool` | DAO-only challenge settlement. |
| `expire_challenge` | `e: u32` | Check rejected, removed, or expired DAO proposal after 4 challenge windows. |
| `claim` | `e, amount: U128, score: u64, tier: u8, proof: string[]` | Claim YAP from the epoch root. |
| `burn_unclaimed` | `e: u32` | Burn remaining yapper allocation after the claim window. |
| `unstake`, `withdraw`, `claim_staker_rewards` | `amount: U128`; none; none | Unbond, withdraw, claim stake rewards. |
| `claim_arena` | `arena_id, e, amount: U128, proof: string[], yapper_amount: U128, score: u64, tier: u8, yapper_proof: string[]` | Claim an arena payout, proving both arena allocation and the tier gate against the epoch yapper root. |
| `close_arena` | `id: u32` | Refund unspent budget after all arena claim windows. |

`EpochReport` has `attention: U128`, `yappers_root`, `arenas: [{arena_id, root}]`, `labels_hash`, optional `prompt_hash` and `attestation_hash`, `data_hash`, and `uri`.

## FT transfer messages

Send these as the `msg` string in `ft_transfer_call` to the YAP contract. The token contract calling `ft_on_transfer` is the asset being deposited.

```json
{"stake":{}}
{"scorer_bond":{}}
{"challenge":{"epoch":0,"reason_uri":"https://example.test/evidence"}}
{"open_arena":{"topic":"#rhea","per_epoch":"50","epochs":7,"min_tier":2,"title":"Rhea"}}
```

The first three messages require YAP. `open_arena` accepts YAP or a contract ID in `accepted_arena_tokens`, and the transfer amount must equal `per_epoch × epochs`.

Merkle encoding and shared vectors are in [`tests/vectors.json`](tests/vectors.json). A yapper leaf is `sha256(0x00 || Borsh(e:u32, account:String, amount:u128, score:u64, tier:u8))`; an arena leaf uses `0x01 || Borsh(arena_id:u32, e:u32, account:String, amount:u128)`. Internal nodes use sorted hashes with prefix `0x02`.
