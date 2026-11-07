// Deploys $YAP on NEAR testnet: sub-accounts, the community Sputnik DAO (real v2 wasm), the token with the
// testnet config, scorer bonds, then deletes every full-access key of the token account (no admin, no upgrade).
// Idempotent: each step checks chain state first. Usage: pnpm deploy [--genesis-in-min N]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { testnet as params } from '../sim/params.ts';
import { HQ, TOKEN, DAO, ROOT, N, Y, near, tgas, call, view, signer, subAccount, recordTx, txHash, balance, exists, provider } from './common.ts';

export const SCORERS = [1, 2, 3].map((i) => `scorer-${i}.${HQ}`);
export const COUNCIL = [HQ, `council-1.${HQ}`, `council-2.${HQ}`];
const DEPLOY_FILE = resolve(ROOT, 'deploy', 'testnet.json');
const PROPOSAL_BOND = 100n * 10n ** 21n; // 0.1 NEAR
const SCORER_BOND = 1_000n * Y;
const CHALLENGE_BOND = 500n * Y;
const WRAP = 'wrap.testnet';

async function state(): Promise<Record<string, any>> {
  return existsSync(DEPLOY_FILE) ? JSON.parse(await readFile(DEPLOY_FILE, 'utf8')) : {};
}
async function save(s: Record<string, any>) {
  await mkdir(resolve(ROOT, 'deploy'), { recursive: true });
  await writeFile(DEPLOY_FILE, JSON.stringify(s, null, 2) + '\n');
}
async function hasCode(id: string): Promise<boolean> {
  const a: any = await provider.viewAccount({ accountId: id, finality: 'final' } as never);
  return a.code_hash !== '11111111111111111111111111111111';
}

/** Sputnik v2 policy: 3 council members, 2 of 3 to pass, 1-hour proposals, 0.1 NEAR bond; anyone may add proposals. */
function daoPolicy() {
  const vote = { weight_kind: 'RoleWeight', quorum: '0', threshold: [1, 2] };
  return {
    roles: [
      { name: 'all', kind: 'Everyone', permissions: ['*:AddProposal'], vote_policy: {} },
      { name: 'council', kind: { Group: COUNCIL }, permissions: ['*:*'], vote_policy: {} },
    ],
    default_vote_policy: vote,
    proposal_bond: PROPOSAL_BOND.toString(),
    proposal_period: (3600n * 10n ** 9n).toString(),
    bounty_bond: PROPOSAL_BOND.toString(),
    bounty_forgiveness_period: (86400n * 10n ** 9n).toString(),
  };
}

export function tokenConfig(genesisTs: number) {
  const { epoch_secs, genesis_split, ...rest } = params;
  return {
    ...rest,
    epoch_secs,
    genesis_ts: genesisTs,
    genesis_split,
    scorers: SCORERS,
    scorer_quorum: 2,
    scorer_bond: SCORER_BOND.toString(),
    challenge_secs: 300,
    challenge_bond: CHALLENGE_BOND.toString(),
    dao: DAO,
    dao_proposal_bond: PROPOSAL_BOND.toString(),
    accepted_arena_tokens: [WRAP],
  };
}

async function main() {
  const s = await state();
  const genesisIn = Number(process.argv[process.argv.indexOf('--genesis-in-min') + 1]) || 12;
  console.log(`${HQ} balance before: ${await balance(HQ)} NEAR`);

  // 1. accounts
  await subAccount('token', 4300);
  await subAccount('dao', 5300);
  for (const id of SCORERS) await subAccount(id.split('.')[0], 300);
  for (const id of COUNCIL.slice(1)) await subAccount(id.split('.')[0], 200);

  // 2. community DAO
  const dao = await signer(DAO);
  if (!(await hasCode(DAO))) {
    const wasm = await readFile(resolve(ROOT, 'contracts/tests/fixtures/sputnikdao2.wasm'));
    const r: any = await dao.deployContract(new Uint8Array(wasm));
    await recordTx('deploy sputnik dao', txHash(r), DAO);
    const h = await call(dao, DAO, 'new', { config: { name: 'yap-community', purpose: 'Treasury and court of appeal for $YAP: funds arenas, settles scoring challenges.', metadata: '' }, policy: daoPolicy() }, 0n, tgas(100));
    await recordTx('init dao', h, DAO);
  }

  // 3. token
  const token = await signer(TOKEN);
  if (!(await hasCode(TOKEN))) {
    const wasm = await readFile(resolve(ROOT, 'target/near/yap/yap.wasm'));
    const r: any = await token.deployContract(new Uint8Array(wasm));
    await recordTx('deploy token', txHash(r), TOKEN);
  }
  let cfg: any;
  try {
    cfg = await view(TOKEN, 'get_config');
  } catch {
    const now = Math.floor(Date.now() / 1000);
    const genesis = Math.ceil((now + genesisIn * 60) / 600) * 600;
    const metadata = { spec: 'ft-1.0.0', name: 'YAP', symbol: 'YAP', decimals: 18, icon: null, reference: null, reference_hash: null };
    // `new` is called by HQ so the deployer share goes to HQ, not to the soon-locked token account.
    const hq = await signer(HQ);
    const h = await call(hq, TOKEN, 'new', { config: tokenConfig(genesis), metadata }, 0n, tgas(150));
    await recordTx('init token', h, TOKEN);
    cfg = await view(TOKEN, 'get_config');
    s.genesisTs = genesis;
  }

  // 4. scorer bonds (HQ funds each scorer from the deployer share)
  const hq = await signer(HQ);
  for (const id of SCORERS) {
    const sc: any = await view(TOKEN, 'get_scorer', { account: id });
    if (BigInt(sc?.bond ?? '0') >= SCORER_BOND) continue;
    const reg = await view(TOKEN, 'storage_balance_of', { account_id: id });
    if (!reg) await recordTx('storage_deposit', await call(hq, TOKEN, 'storage_deposit', { account_id: id }, 10n ** 22n, tgas(30)), id);
    await recordTx('fund scorer', await call(hq, TOKEN, 'ft_transfer', { receiver_id: id, amount: SCORER_BOND.toString() }, 1n, tgas(30)), id);
    const scorer = await signer(id);
    await recordTx('scorer_bond', await call(scorer, TOKEN, 'ft_transfer_call', { receiver_id: TOKEN, amount: SCORER_BOND.toString(), msg: JSON.stringify({ scorer_bond: {} }) }, 1n, tgas(80)), id);
  }

  // 5. lock: delete every full-access key of the token account
  const keys: any = await provider.viewAccessKeyList({ accountId: TOKEN, finality: 'final' } as never);
  for (const k of keys.keys ?? []) {
    if (k.access_key.permission !== 'FullAccess') continue;
    const r: any = await token.deleteKey(k.public_key);
    await recordTx('delete full-access key (lock)', txHash(r), TOKEN);
  }
  const after: any = await provider.viewAccessKeyList({ accountId: TOKEN, finality: 'final' } as never);
  const full = (after.keys ?? []).filter((k: any) => k.access_key.permission === 'FullAccess');
  console.log(`lock proof: view_access_key_list(${TOKEN}) -> ${after.keys?.length ?? 0} keys, ${full.length} full-access`);

  Object.assign(s, { network: 'testnet', hq: HQ, token: TOKEN, dao: DAO, scorers: SCORERS, council: COUNCIL, config: cfg, locked: full.length === 0, lockCheckedAt: new Date().toISOString() });
  await save(s);
  for (const id of [HQ, TOKEN, DAO]) console.log(`${id}: ${await balance(id)} NEAR`);
  console.log('state', JSON.stringify(await view(TOKEN, 'get_state')));
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
export { N, near, exists };
