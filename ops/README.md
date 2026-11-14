# Running the $YAP testnet economy on a dedicated host

The $YAP mechanics live in the contract, but the ticks only settle if someone runs the off-chain agents: the
three scorers read near.social, label the posts, report on chain and finalize; the watchdog recomputes every
report; the steward keeper promotes Gold+ yappers; @yapbot answers mentions; and the demo crowd keeps the
simulated testnet community posting. This folder runs all of them under a supervisor that restarts anything
that dies.

Do this on a machine that stays on. A laptop that sleeps stops the economy: a tick whose report misses its
deadline (3 ticks, 30 minutes) can only be closed as Dead by the permissionless crank.

> **Run these agents on exactly one host at a time.** Two hosts would double-post as the same demo personas and
> race each other's claims. Stop the old host (`bash ops/stop.sh`) before starting the new one.

## 1. What the host needs

| | |
| --- | --- |
| OS | macOS or Linux (`run.sh` is bash; `caffeinate` is used only if present) |
| Node | 23.x (`node -v`) |
| pnpm | 10.x (`npm i -g pnpm@10`) |
| git | any |
| Network | outbound HTTPS to `test.rpc.fastnear.com`, `kv.test.fastnear.com`, `api.near.ai` |

Rust and `cargo near` are **not** needed here: nothing in this folder builds or deploys a contract.

## 2. Clone and install

```bash
git clone https://github.com/nancy197/yap.git
cd yap
pnpm install
```

## 3. Put the secrets in place

None of these is in git, and the agents cannot sign anything without them:

| Where | What it is |
| --- | --- |
| `.keys.json` | the keys of the agent and demo accounts (`scorer-1..3`, `watchdog`, `yapbot`, the steward, `y01..y34`) |
| `.env` | `NEARAI_API_KEY` for the TEE labeler. Without it labels fall back to the deterministic heuristic, which still settles ticks but is marked `simulated` in the published data |
| `~/.near-credentials/testnet/yap*.json` | `yap-hq.testnet`, which re-bonds a slashed scorer, and the faucet accounts `fund.ts` tops up from |
| `data/funder.txt` | which faucet account to keep using, so a working one is not replaced |

On the host that already has them:

```bash
bash ops/secrets.sh pack                       # writes ~/yap-secrets.tgz
scp ~/yap-secrets.tgz <user>@<host>:~/
```

On this host, from the repository root:

```bash
bash ops/secrets.sh unpack ~/yap-secrets.tgz   # then delete the archive on both hosts
```

## 4. Start it

```bash
nohup bash ops/run.sh > data/run.log 2>&1 &
```

Environment variables, all optional:

| Variable | Default | What it does |
| --- | --- | --- |
| `YAP_TOKEN_PREFIX` | `token4` | which deployment to serve (`token4` is the live Proof of Yap one) |
| `YAP_PUBLIC_BASE` | `https://yap-near.vercel.app/epochs/$YAP_TOKEN_PREFIX` | the base URI written into each on-chain report, so it must match where the data is actually published |
| `CROWD` | `1` | `0` runs the chain agents only, with no simulated posting |
| `PUBLISH` | `0` | `1` also refreshes the public site every 20 minutes (see below) |

## 5. Check that it is working

```bash
tail -f data/scorer.log
```

Within a few minutes of each 10-minute tick you should see, in order: the dataset line
(`epoch N: ... posts, ... likes`), the labels line, two `submit_report` transactions, then `finalized N`.

The chain is the real check. This should keep rising, and no tick should sit unsettled:

```bash
node -e '
const rpc=async(m,a={})=>{const r=await fetch("https://test.rpc.fastnear.com",{method:"POST",
headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"query",
params:{request_type:"call_function",finality:"final",account_id:"token4.yap-hq.testnet",method_name:m,
args_base64:Buffer.from(JSON.stringify(a)).toString("base64")}})}).then(r=>r.json());
return JSON.parse(Buffer.from((await r).result.result).toString())};
const s=await rpc("get_state");console.log("tick",s.current_epoch,"block",s.block_number,
"progress",s.block_progress+"/"+s.block_threshold);
for(let e=s.current_epoch-4;e<s.current_epoch;e++)console.log(" tick",e,(await rpc("get_epoch",{e}))?.status??"none");'
```

The same state is on the [$YAP page](https://yap-near.vercel.app/#/token), read live from the chain.

Logs, all under `data/`: `scorer.log`, `watchdog.log`, `yapbot.log`, `steward.log`, `crowd.log`, `fund.log`,
`publish.log`, and `run.log` for the supervisor itself.

## 6. Keeping the host awake

`run.sh` holds a `caffeinate` lock while it runs, which stops idle sleep. On a Mac also set
**System Settings → Displays → Advanced → Prevent automatic sleeping on power adapter**, and for a Mac mini
**Energy → Start up automatically after a power failure**.

## 7. Funding

Every 20 minutes `agents/fund.ts` tops the agent accounts back up to their target balances, pulling from a
faucet account it creates (falling back to `yap-hq.testnet`). A contract whose free balance runs out fails
every state write, which stops the economy, so leave this running. It keeps its faucet account id in
`data/funder.txt` and the key in `~/.near-credentials/testnet/`.

## 8. Publishing the site (only on the host that owns it)

Each on-chain report carries a URI pointing at the published dataset and labels for that tick, which is what
the Verify page re-runs. Those files are written locally by the scorer, so one host has to push them:

```bash
bash ops/publish.sh            # once
PUBLISH=1 nohup bash ops/run.sh > data/run.log 2>&1 &   # or every 20 minutes
```

For a non-interactive deploy, add `VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` to `.env`. Without
them `publish.sh` still rebuilds `web/dist` and tells you it skipped the deploy.

## 9. Stopping

```bash
bash ops/stop.sh
```
