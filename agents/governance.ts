// Community DAO actions on testnet (real Sputnik DAO v2 at dao.yap-hq.testnet):
//   pnpm gov arena [topic] [perEpoch] [epochs] [minTier]   council proposes funding an arena from the treasury
//   pnpm gov vote <proposalId> [approve|reject]             two council members vote (2 of 3 passes)
//   pnpm gov challenge <epoch> <account> <reason>           an account bonds YAP and challenges an epoch report
//   pnpm gov expire <epoch>                                 settle a challenge whose DAO proposal was rejected
import { HQ, TOKEN, DAO, Y, tgas, call, view, signer, recordTx, loadEnv } from './common.ts';
import { COUNCIL } from './deploy.ts';

const PROPOSAL_BOND = 100n * 10n ** 21n;

async function arena(topic = '#near', per = 500n, epochs = 6, minTier = 1) {
  const amount = (per * Y * BigInt(epochs)).toString();
  const msg = JSON.stringify({ open_arena: { topic, per_epoch: (per * Y).toString(), epochs, min_tier: minTier, title: `${topic.slice(1)} builders arena` } });
  const proposal = {
    description: `Fund a YAP arena for ${topic}: ${per} YAP per epoch for ${epochs} epochs, Bronze+ yappers. Paid from the community treasury.`,
    kind: { FunctionCall: { receiver_id: TOKEN, actions: [{ method_name: 'ft_transfer_call', args: Buffer.from(JSON.stringify({ receiver_id: TOKEN, amount, msg })).toString('base64'), deposit: '1', gas: '150000000000000' }] } },
  };
  const h = await call(await signer(HQ), DAO, 'add_proposal', { proposal }, PROPOSAL_BOND, tgas(100));
  await recordTx(`dao add_proposal (fund arena ${topic})`, h, HQ);
  const id = (await view<number>(DAO, 'get_last_proposal_id')) - 1;
  console.log(`proposal ${id}`);
  return id;
}

async function vote(id: number, action: 'VoteApprove' | 'VoteReject' = 'VoteApprove') {
  const p: any = await view(DAO, 'get_proposal', { id });
  for (const m of COUNCIL.slice(0, 2)) {
    const now: any = await view(DAO, 'get_proposal', { id });
    if (now.status !== 'InProgress') break;
    if (now.votes?.[m]) continue;
    const h = await call(await signer(m), DAO, 'act_proposal', { id, action, proposal: p.kind }, 0n, tgas(250));
    await recordTx(`dao ${action} proposal ${id}`, h, m);
  }
  console.log('status', (await view<any>(DAO, 'get_proposal', { id })).status);
}

async function challenge(e: number, who: string, reason: string) {
  const bond: string = (await view<any>(TOKEN, 'get_config')).challenge_bond;
  const acc = await signer(who);
  if (!(await view(TOKEN, 'storage_balance_of', { account_id: who }))) await call(acc, TOKEN, 'storage_deposit', { account_id: who }, 1_250_000_000_000_000_000_000n, tgas(30));
  if (BigInt(await view<string>(TOKEN, 'ft_balance_of', { account_id: who })) < BigInt(bond)) {
    await recordTx(`fund challenger`, await call(await signer(HQ), TOKEN, 'ft_transfer', { receiver_id: who, amount: bond }, 1n, tgas(30)), who);
  }
  const h = await call(acc, TOKEN, 'ft_transfer_call', { receiver_id: TOKEN, amount: bond, msg: JSON.stringify({ challenge: { epoch: e, reason_uri: reason } }) }, 1n, tgas(250));
  await recordTx(`challenge e${e}`, h, who);
  console.log(JSON.stringify(await view(TOKEN, 'get_challenge', { e })));
}

await loadEnv();
const [cmd, a, b, c, d] = process.argv.slice(2);
if (cmd === 'arena') await arena(a ?? '#near', BigInt(b ?? '500'), Number(c ?? 6), Number(d ?? 1));
else if (cmd === 'vote') await vote(Number(a), b === 'reject' ? 'VoteReject' : 'VoteApprove');
else if (cmd === 'challenge') await challenge(Number(a), b!, c ?? 'https://example.com');
else if (cmd === 'expire') await recordTx(`expire_challenge e${a}`, await call(await signer(HQ), TOKEN, 'expire_challenge', { e: Number(a) }, 0n, tgas(100)));
else console.log('usage: arena | vote <id> [reject] | challenge <e> <account> <reason> | expire <e>');
