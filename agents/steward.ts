// Reputation -> DAO membership on testnet.
//   pnpm steward deploy                 deploy + init steward.yap-hq.testnet, council adds `steward` + `trusted` roles
//                                       to the DAO policy (ChangePolicy, 2 of 3), then the steward's keys are deleted
//   pnpm steward keeper                 permissionless crank: after each finalized epoch, promote every Gold+ yapper
//                                       (Merkle proof from the published scores) and demote expired members
//   pnpm steward grant <from> <to> <YAP> <memo>   a trusted member sends a capped grant from the treasury
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, HQ, TOKEN, DAO, Y, tgas, call, view, signer, subAccount, recordTx, txHash, provider, sleep, loadEnv } from './common.ts';
import { COUNCIL } from './deploy.ts';

export const STEWARD = `steward2.${HQ}`;
const ROLE = 'trusted';
const PUBLIC = resolve(ROOT, 'web/public/epochs/testnet');
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function hasCode(id: string) {
  const a: any = await provider.viewAccount({ accountId: id, finality: 'final' } as never);
  return a.code_hash !== '11111111111111111111111111111111';
}

async function deploy() {
  const st = await subAccount(STEWARD.split('.')[0]!, 2600);
  if (!(await hasCode(STEWARD))) {
    const r: any = await st.deployContract(new Uint8Array(await readFile(resolve(ROOT, 'target/near/steward/steward.wasm'))));
    await recordTx('deploy steward', txHash(r), STEWARD);
  }
  const tc: any = await view(TOKEN, 'get_config');
  try {
    await view(STEWARD, 'get_config');
  } catch {
    const config = { yap: TOKEN, dao: DAO, role: ROLE, min_tier: 3, season_epochs: 6, genesis_ts: tc.genesis_ts, epoch_secs: tc.epoch_secs, grant_cap: (300n * Y).toString(), period_budget: (1500n * Y).toString(), proposal_bond: tc.dao_proposal_bond };
    await recordTx('init steward', await call(await signer(HQ), STEWARD, 'new', { config }, 0n, tgas(50)), STEWARD);
  }
  // Council changes the DAO policy: + steward role (files/approves member + transfer proposals), + trusted role.
  const policy: any = await view(DAO, 'get_policy');
  const stRole = policy.roles.find((r: any) => r.name === 'steward');
  if (!stRole || !stRole.kind.Group.includes(STEWARD)) {
    policy.roles = policy.roles.filter((r: any) => r.name !== 'steward' && r.name !== ROLE);
    policy.roles.push(
      { name: 'steward', kind: { Group: [STEWARD] }, permissions: ['add_member_to_role:AddProposal', 'add_member_to_role:VoteApprove', 'remove_member_from_role:AddProposal', 'remove_member_from_role:VoteApprove', 'transfer:AddProposal', 'transfer:VoteApprove'], vote_policy: {} },
      { name: ROLE, kind: { Group: [] }, permissions: ['vote:AddProposal', 'vote:VoteApprove', 'vote:VoteReject'], vote_policy: {} },
    );
    const kind = { ChangePolicy: { policy } };
    const h = await call(await signer(HQ), DAO, 'add_proposal', { proposal: { description: 'Add the YAP steward: Gold+ yappers join a `trusted` role automatically (proof-checked against finalized YAP epochs) and can send capped treasury grants (300 YAP each, 1,500 per season). Anything bigger stays a council vote.', kind } }, BigInt(tc.dao_proposal_bond), tgas(100));
    await recordTx('dao add_proposal (ChangePolicy: add steward + trusted roles)', h, HQ);
    const id = (await view<number>(DAO, 'get_last_proposal_id')) - 1;
    const p: any = await view(DAO, 'get_proposal', { id });
    for (const m of COUNCIL.slice(0, 2)) {
      const now: any = await view(DAO, 'get_proposal', { id });
      if (now.status !== 'InProgress' || now.votes?.[m]) continue;
      await recordTx(`dao VoteApprove proposal ${id}`, await call(await signer(m), DAO, 'act_proposal', { id, action: 'VoteApprove', proposal: p.kind }, 0n, tgas(200)), m);
    }
    log('policy proposal', id, (await view<any>(DAO, 'get_proposal', { id })).status);
  }
  // Lock: no admin, no upgrade.
  const keys: any = await provider.viewAccessKeyList({ accountId: STEWARD, finality: 'final' } as never);
  for (const k of keys.keys ?? []) if (k.access_key.permission === 'FullAccess') await recordTx('delete full-access key (lock steward)', txHash(await st.deleteKey(k.public_key)), STEWARD);
  const after: any = await provider.viewAccessKeyList({ accountId: STEWARD, finality: 'final' } as never);
  log(`lock proof: ${STEWARD} has ${after.keys?.length ?? 0} access keys`);
}

async function keeperTick(done: Set<string>) {
  const cfg: any = await view(STEWARD, 'get_config');
  const cur: number = await view(STEWARD, 'current_epoch');
  const chain: any[] = await view(TOKEN, 'get_epochs', { from: Math.max(0, cur - cfg.season_epochs), limit: cfg.season_epochs + 1 });
  const latest = chain.filter((e) => e.status === 'Finalized').sort((a, b) => b.number - a.number)[0];
  const hq = await signer(HQ);
  if (latest && existsSync(resolve(PUBLIC, String(latest.number), 'scores.json'))) {
    const s = JSON.parse(await readFile(resolve(PUBLIC, String(latest.number), 'scores.json'), 'utf8'));
    for (const y of s.result.yappers.filter((y: any) => y.tier >= cfg.min_tier)) {
      const key = `${latest.number}:${y.account}`;
      if (done.has(key)) continue;
      done.add(key);
      const m: any = await view(STEWARD, 'get_member', { account: y.account });
      if (m && m.proof_epoch >= latest.number) continue;
      try {
        const h = await call(hq, STEWARD, 'promote', { account: y.account, e: latest.number, amount: y.amount, score: Number(y.score), tier: y.tier, proof: y.proof }, 0n, tgas(250));
        await recordTx(`steward promote ${y.account} (tier ${y.tier}, epoch ${latest.number})`, h, y.account);
      } catch (err) {
        log(`promote ${y.account} failed: ${String(err).slice(0, 200)}`);
      }
    }
  }
  for (const [account, m] of (await view<[string, any][]>(STEWARD, 'get_members')) ?? []) {
    if (m.expires_epoch >= cur) continue;
    try {
      await recordTx(`steward demote ${account} (season ended at ${m.expires_epoch})`, await call(hq, STEWARD, 'demote', { account }, 0n, tgas(200)), account);
    } catch (err) {
      log(`demote ${account} failed: ${String(err).slice(0, 160)}`);
    }
  }
}

await loadEnv();
const [cmd, a, b, c, ...rest] = process.argv.slice(2);
if (cmd === 'deploy') await deploy();
else if (cmd === 'keeper') {
  const done = new Set<string>();
  log(`steward keeper for ${STEWARD}`);
  for (;;) {
    try {
      await keeperTick(done);
    } catch (err) {
      log(`keeper error: ${String(err).slice(0, 200)}`);
    }
    await sleep(30_000);
  }
} else if (cmd === 'grant') {
  const amount = (BigInt(c ?? '100') * Y).toString();
  const h = await call(await signer(a!), STEWARD, 'grant', { receiver: b, amount, memo: rest.join(' ') || 'community grant' }, 1_250_000_000_000_000_000_000n, tgas(250));
  await recordTx(`steward grant ${c} YAP ${a} -> ${b}`, h, a);
  log(JSON.stringify((await view<any[]>(STEWARD, 'get_grants', { from: 0, limit: 50 })).at(-1)));
} else console.log('usage: deploy | keeper | grant <from> <to> <YAP> <memo>');
