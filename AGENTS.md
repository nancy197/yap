# Working rules for coding agents

- Read RULES.md (mechanism, source of truth) and SPEC.md (tech spec) before writing code.
- Work only on the phase you were asked for. Keep PLAN.md updated:
  - Tick finished items.
  - After each meaningful step, append a short dated entry to the "Progress log": what changed,
    what was verified, what is blocked.
  - Do this often. A supervisor reads PLAN.md every few minutes to check you are alive.
- Verify your work by running it (build, tests, scripts). Never claim something works without
  running it. If something cannot be verified, say so in the progress log.
- Never invent numbers, tx hashes, attestation results or benchmark output.
- Never commit secrets. Never deploy to mainnet, sign mainnet transactions or spend real funds.
  Reading mainnet data over HTTP is fine.
- Do not run `git commit`, `git push`, or change git config. The supervisor handles git.
- Prefer latest stable library versions. Read official docs when unsure:
  - docs.near.org
  - github.com/near/near-sdk-rs
  - github.com/near-daos/sputnik-dao-contract
  - docs.fastnear.com/fastdata/kv
  - api2.near.social/standard.md and api2.near.social/api.md
  - docs.near.ai
- Long commands (cargo install, sandbox download, big builds): log them in PLAN.md first so the
  supervisor knows why there is no output.
- If truly blocked (missing credential, network), write `BLOCKED: <reason>` in the progress log,
  then continue with the rest of the phase.
- Code style:
  - Small, readable modules and short comments that explain why.
  - TypeScript strict, ESM.
  - Rust: `cargo fmt` and `cargo clippy` clean.

## Environment (from the supervisor)
- **Repo:** /Users/henrypham/Desktop/near_hackathon/yap.
- **Toolchain:**
  - Rust 1.95 pinned via rust-toolchain.toml; `cargo near` installed.
  - Node 23 and pnpm 10.
  - The Sputnik DAO v2 wasm fixture is at `contracts/tests/fixtures/sputnikdao2.wasm`.
- **Testnet:**
  - Deploy account `yap-hq.testnet` (8 NEAR). The key is in
    `~/.near-credentials/testnet/yap-hq.testnet.json`; never copy keys into the repo.
  - Put everything under sub-accounts of it:
    - `token.yap-hq.testnet`: the contract.
    - `dao.yap-hq.testnet`: Sputnik DAO; deploy the wasm yourself, it needs ~5 NEAR.
    - `scorer-1..3.yap-hq.testnet`.
    - Crowd bots: `y01..y24.yap-hq.testnet`.
  - Budget is tight: give sub-accounts the minimum (bots 0.05 NEAR).
  - The faucet `https://helper.nearprotocol.com/account` (POST `{newAccountId, newAccountPublicKey}`)
    creates new top-level testnet accounts with 10 NEAR, but it is rate-limited. If more NEAR is
    needed, try it and log the result.
- **RPC:** testnet `https://test.rpc.fastnear.com`. `rpc.testnet.near.org` is deprecated and returns 429.
- **near.social:**
  - FastData KV: testnet `https://kv.test.fastnear.com`, mainnet `https://kv.main.fastnear.com`.
  - Mainnet indexer API: `https://api2.near.social`.
  - Testnet has almost no social data, so the crowd seeder creates it.
- **NEAR AI:**
  - `NEARAI_API_KEY` is in `.env` (gitignored, never print it).
  - Models with verified TEE attestation: `Qwen/Qwen3.8-27B`, `Qwen/Qwen3.6-35B-A3B-FP8`,
    `z-ai/glm-5.3-flash`, `deepseek-ai/DeepSeek-V4.1-Flash-1017`.
  - Credit is small (a few USD): cache every call and print token usage.
