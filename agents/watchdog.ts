// Watchdog: an independent auditor anyone can run. For every proposed epoch it downloads the published dataset +
// labels, recomputes the scores with the open scoring code, and compares the Merkle root and hashes with the report
// on chain. On a mismatch it bonds YAP and challenges, which makes the token contract open a Sputnik DAO proposal.
// Usage: pnpm watchdog [--account watchdog.yap-hq.testnet]
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { score, datasetHash, canonical, sha256Hex } from '@yap/scoring';
import { EPOCH_DIR, ROOT, HQ, TOKEN, tgas, call, view, signer, subAccount, recordTx, sleep, loadEnv } from './common.ts';

const WHO = process.argv.includes('--account') ? process.argv[process.argv.indexOf('--account') + 1]! : `watchdog.${HQ}`;
const PUBLIC = resolve(ROOT, 'web/public/epochs', EPOCH_DIR);
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const checked = new Set<number>();

async function audit(e: number): Promise<string | null> {
  const dir = resolve(PUBLIC, String(e));
  if (!existsSync(resolve(dir, 'scores.json'))) return null; // not published yet
  const [d, l, s] = await Promise.all(['dataset', 'labels', 'scores'].map(async (f) => JSON.parse(await readFile(resolve(dir, `${f}.json`), 'utf8'))));
  const chain: any = await view(TOKEN, 'get_epoch', { e });
  const rep = chain?.report;
  if (!rep) return null;
  const problems: string[] = [];
  if (datasetHash(d) !== rep.data_hash) problems.push('data_hash');
  if (sha256Hex(canonical(l.labels)) !== rep.labels_hash) problems.push('labels_hash');
  // v4 files carry the exact score params; a block's earlier contributions must match those ticks' own published scores.
  const params = s.scoreParams ?? { yapperAllocation: s.predictedYapperPool, arenas: s.arenas ?? [], trailingScores: s.trailing };
  if (params.jackpot) {
    // Rebuild the block's earlier contributions from our own copies of those ticks, exactly as the scorer does.
    const done = chain.status === 'Finalized' && BigInt(chain.jackpot ?? '0') > 0n;
    const start: number = done ? (await view<any>(TOKEN, 'get_block', { number: chain.block })).start_epoch : (await view<any>(TOKEN, 'get_state')).block_start_epoch;
    const own: Record<string, string>[] = [];
    for (let k = start; k < e; k++) {
      const f = resolve(PUBLIC, String(k), 'scores.json');
      if (!existsSync(f)) continue;
      const ys = JSON.parse(await readFile(f, 'utf8')).result.yappers as { account: string; score: string }[];
      own.push(Object.fromEntries(ys.filter((y) => BigInt(y.score) > 0n).map((y) => [y.account, y.score])));
    }
    if (JSON.stringify(own) !== JSON.stringify(params.jackpot.earlier)) problems.push('jackpot contributions');
  }
  const r = score(d, l.labels, s.stakes ?? {}, params);
  if (r.yappersRoot !== rep.yappers_root) problems.push('yappers_root');
  if (r.attention !== rep.attention) problems.push(`attention ${rep.attention} vs ${r.attention}`);
  return problems.length ? problems.join(', ') : '';
}

await loadEnv();
await subAccount(WHO.split('.')[0]!, 300);
log(`watchdog ${WHO} auditing ${TOKEN}`);
for (;;) {
  try {
    const epochs: any[] = await view(TOKEN, 'get_epochs', { from: 0, limit: 200 });
    for (const ep of epochs.filter((x) => x.status === 'Proposed' && !checked.has(x.number))) {
      const res = await audit(ep.number);
      if (res === null) continue;
      checked.add(ep.number);
      if (!res) {
        log(`epoch ${ep.number}: report matches the published data ✓`);
        continue;
      }
      log(`epoch ${ep.number}: MISMATCH (${res}) -> challenging`);
      const bond: string = (await view<any>(TOKEN, 'get_config')).challenge_bond;
      const me = await signer(WHO);
      if (!(await view(TOKEN, 'storage_balance_of', { account_id: WHO }))) await call(me, TOKEN, 'storage_deposit', { account_id: WHO }, 1_250_000_000_000_000_000_000n, tgas(30));
      if (BigInt(await view<string>(TOKEN, 'ft_balance_of', { account_id: WHO })) < BigInt(bond)) await recordTx('fund watchdog bond', await call(await signer(HQ), TOKEN, 'ft_transfer', { receiver_id: WHO, amount: bond }, 1n, tgas(30)), WHO);
      const reason = `${process.env.YAP_PUBLIC_BASE ?? `https://raw.githubusercontent.com/nancy197/yap/main/web/public/epochs/${EPOCH_DIR}`}/${ep.number}/ (recomputed: ${res})`;
      const h = await call(me, TOKEN, 'ft_transfer_call', { receiver_id: TOKEN, amount: bond, msg: JSON.stringify({ challenge: { epoch: ep.number, reason_uri: reason.slice(0, 400) } }) }, 1n, tgas(250));
      await recordTx(`challenge e${ep.number} (watchdog: ${res})`, h, WHO);
      log(JSON.stringify(await view(TOKEN, 'get_challenge', { e: ep.number })));
    }
  } catch (err) {
    log(`error: ${String(err).slice(0, 200)}`);
  }
  await sleep(15_000);
}
