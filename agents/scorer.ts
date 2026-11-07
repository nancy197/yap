// Scorer service. For each finished epoch: read near.social testnet data from FastData KV, label posts with the
// TEE-attested AI labeler, score deterministically, publish every input/output file, submit the same report from
// each bonded scorer (2-of-3 quorum), finalize after the challenge window and claim for the demo accounts.
// Every step is idempotent: on restart it reads chain state and continues. Usage:
//   pnpm scorer            loop forever
//   pnpm scorer --once E   process epoch E (report + finalize + claims) and exit
//   pnpm scorer --mock     use SIMULATED heuristic labels instead of NEAR AI
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { history, makeDataset } from '@yap/indexer';
import { score, canonical, sha256Hex, type EpochDataset, type ScoreResult, type Write } from '@yap/scoring';
import { labelDataset, type LabelRun } from './labeler.ts';
import { ROOT, HQ, TOKEN, Y, tgas, call, view, signer, recordTx, sleep, loadEnv } from './common.ts';
import { SCORERS } from './deploy.ts';
import { PERSONAS } from './seed.ts';

const PUBLIC = resolve(ROOT, 'web/public/epochs/testnet');
const BASE_URI = process.env.YAP_PUBLIC_BASE ?? 'https://raw.githubusercontent.com/nancy197/yap/main/web/public/epochs/testnet';
const mock = process.argv.includes('--mock');
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

type Cfg = { epoch_secs: number; genesis_ts: number; base_emission: string; max_ratio_bps: number; loud_bps: number; streak_cap: number; streak_step_bps: number; yapper_bps: number; challenge_secs: number; claim_epochs: number };
type St = { streak: number; attention_target: string; current_epoch: number };
const cfg = await view<Cfg>(TOKEN, 'get_config');
const bounds = (e: number) => ({ fromMs: (cfg.genesis_ts + e * cfg.epoch_secs) * 1000, toMs: (cfg.genesis_ts + (e + 1) * cfg.epoch_secs) * 1000 });

/** Same integer math as the contract's `finalize`, so leaf amounts sum to exactly the yapper pool it will mint. */
export function predictYapperPool(attention: bigint, st: St): bigint {
  if (attention === 0n) return 0n;
  const target = BigInt(st.attention_target);
  const base = (BigInt(cfg.base_emission) * attention) / target;
  const loud = attention * 10_000n >= target * BigInt(cfg.loud_bps);
  let emission = base;
  if (loud) {
    const streak = BigInt(Math.min(st.streak + 1, cfg.streak_cap));
    const limited = base < (BigInt(cfg.base_emission) * BigInt(cfg.max_ratio_bps)) / 10_000n ? base : (BigInt(cfg.base_emission) * BigInt(cfg.max_ratio_bps)) / 10_000n;
    emission = (limited * (10_000n + streak * BigInt(cfg.streak_step_bps))) / 10_000n;
  }
  return (emission * BigInt(cfg.yapper_bps)) / 10_000n;
}

async function allWrites(): Promise<Write[]> {
  const out: Write[] = [];
  for await (const w of history('testnet')) out.push(w);
  return out;
}

/** Trailing per-account scores (for tiers) from the files we already published. */
async function trailing(e: number): Promise<Record<string, string[]>> {
  const t: Record<string, string[]> = {};
  for (let k = Math.max(0, e - 29); k < e; k++) {
    const f = resolve(PUBLIC, String(k), 'scores.json');
    if (!existsSync(f)) continue;
    const s = JSON.parse(await readFile(f, 'utf8'));
    for (const y of s.result.yappers as { account: string; score: string }[]) (t[y.account] ??= []).push(y.score);
  }
  return t;
}

async function stakes(accounts: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const a of accounts) {
    const s: any = await view(TOKEN, 'get_stake', { account: a });
    if (BigInt(s.amount ?? '0') > 0n) out[a] = s.amount;
  }
  return out;
}

async function buildReport(e: number, tamper = false) {
  const { fromMs, toMs } = bounds(e);
  const writes = await allWrites();
  const dataset: EpochDataset = makeDataset('testnet', fromMs, toMs, writes, e);
  log(`epoch ${e}: ${dataset.posts.length} posts, ${dataset.likes.length} likes, ${dataset.reposts.length} reposts, ${dataset.follows.length} follows`);
  const labels: LabelRun = await labelDataset(dataset, { mock });
  if (tamper) {
    // DEMO OF COLLUSION: two scorers inflate the like-ring's labels to q=3. The published honest files stay as they
    // are, so anyone re-running Verify sees the on-chain root does not match, and can challenge.
    labels.labels = Object.fromEntries(Object.entries(labels.labels).map(([k, q]) => [k, /^y2[0-4]\./.test(k) ? 3 : q])) as typeof labels.labels;
  }
  log(`labels: ${labels.details.length} (${labels.model}${labels.attestation ? `, TEE attestation ${labels.attestation.verified ? 'verified' : 'FAILED'}` : ''}), $${labels.usage.usd.toFixed(4)}`);
  const accounts = [...new Set([...dataset.posts.map((p) => p.author), ...Object.keys(dataset.firstWrites)])].filter((a) => a.endsWith('.testnet'));
  const st = await stakes(accounts);
  const arenas = ((await view<any[]>(TOKEN, 'get_arenas', { from: 0, limit: 50 })) ?? []).filter((a) => !a.closed && e >= a.start_epoch && e < a.start_epoch + a.epochs).map((a) => ({ id: a.id, topic: a.topic, minTier: a.min_tier, amount: a.per_epoch }));
  const state = await view<St>(TOKEN, 'get_state');
  // First pass gives attention; the pool depends on it, so score again with the exact allocation.
  const trail = await trailing(e);
  const first = score(dataset, labels.labels, st, { yapperAllocation: '0', arenas, trailingScores: trail });
  const pool = predictYapperPool(BigInt(first.attention), state);
  const result: ScoreResult = score(dataset, labels.labels, st, { yapperAllocation: pool.toString(), arenas, trailingScores: trail });
  const labelsHash = sha256Hex(canonical(labels.labels));
  const report = {
    attention: result.attention,
    yappers_root: result.yappersRoot,
    arenas: Object.values(result.arenas).map((a) => ({ arena_id: a.id, root: a.root })),
    labels_hash: labelsHash,
    prompt_hash: labels.promptHash,
    attestation_hash: labels.attestation?.reportHash ?? null,
    data_hash: dataset.dataHash,
    uri: `${BASE_URI}/${e}/`,
  };
  const dir = resolve(PUBLIC, String(e));
  await mkdir(dir, { recursive: true });
  if (tamper) {
    await writeFile(resolve(dir, 'tampered.json'), JSON.stringify({ note: 'Deliberate collusion demo: scorer-1 and scorer-2 submitted this report with the like-ring relabelled q=3.', report, ringAccounts: ['y20', 'y21', 'y22', 'y23', 'y24'].map((x) => `${x}.yap-hq.testnet`) }, null, 1));
    return report;
  }
  await writeFile(resolve(dir, 'dataset.json'), canonical(dataset));
  await writeFile(resolve(dir, 'labels.json'), JSON.stringify({ labels: labels.labels, details: labels.details, model: labels.model, simulated: labels.simulated, promptHash: labels.promptHash, attestation: labels.attestation, usage: labels.usage }, null, 1));
  await writeFile(resolve(dir, 'scores.json'), JSON.stringify({ epoch: e, fromMs, toMs, predictedYapperPool: pool.toString(), stakes: st, arenas, trailing: trail, report, result }, null, 1));
  await updateIndex(e, { attention: result.attention, posts: dataset.posts.length, yappers: result.yappers.length, simulatedLabels: labels.simulated });
  return report;
}

async function updateIndex(e: number, row: Record<string, unknown>) {
  const f = resolve(PUBLIC, 'index.json');
  const idx = existsSync(f) ? JSON.parse(await readFile(f, 'utf8')) : { network: 'testnet', token: TOKEN, epochs: {} };
  idx.epochs[e] = { ...idx.epochs[e], ...row, updatedAt: new Date().toISOString() };
  await writeFile(f, JSON.stringify(idx, null, 1));
}

async function epochRec(e: number): Promise<any | null> {
  return view(TOKEN, 'get_epoch', { e }).catch(() => null);
}

const tamperAt = process.argv.includes('--tamper') ? Number(process.argv[process.argv.indexOf('--tamper') + 1]) : -1;

/** Slashed scorers must re-bond before they can report again (funded by HQ, as in deploy). */
async function ensureBond(id: string) {
  const sc: any = await view(TOKEN, 'get_scorer', { account: id });
  const need = BigInt((await view<any>(TOKEN, 'get_config')).scorer_bond);
  if (BigInt(sc?.bond ?? '0') >= need) return;
  const hq = await signer(HQ);
  await recordTx('re-fund slashed scorer', await call(hq, TOKEN, 'ft_transfer', { receiver_id: id, amount: (need - BigInt(sc?.bond ?? '0')).toString() }, 1n, tgas(30)), id);
  await recordTx('scorer re-bond', await call(await signer(id), TOKEN, 'ft_transfer_call', { receiver_id: TOKEN, amount: (need - BigInt(sc?.bond ?? '0')).toString(), msg: JSON.stringify({ scorer_bond: {} }) }, 1n, tgas(80)), id);
}

async function submit(e: number) {
  const rec = await epochRec(e);
  if (rec && rec.status !== 'Discarded') return log(`epoch ${e} already ${rec.status}`);
  const honest = await buildReport(e);
  const tampered = e === tamperAt && !rec ? await buildReport(e, true) : null;
  for (const [i, id] of SCORERS.entries()) {
    if (await view(TOKEN, 'get_epoch', { e }).then((r: any) => r?.status === 'Proposed').catch(() => false)) {
      // Quorum already reached; a third identical vote would be rejected, so record agreement off-chain only.
      log(`${id}: quorum already reached, skipping`);
      continue;
    }
    const report = tampered && i < 2 ? tampered : honest;
    try {
      await ensureBond(id);
      const h = await call(await signer(id), TOKEN, 'submit_report', { e, report }, 0n, tgas(100));
      await recordTx(`submit_report e${e}${report === tampered ? ' (TAMPERED demo)' : rec ? ' (resubmit)' : ''}`, h, id);
    } catch (err) {
      log(`${id} submit failed: ${String(err).slice(0, 200)}`);
    }
  }
}

async function finalize(e: number) {
  const rec = await epochRec(e);
  if (rec?.status !== 'Proposed') return false;
  const ready = Number(BigInt(rec.proposed_at) / 1_000_000n) + cfg.challenge_secs * 1000 + 5000;
  if (Date.now() < ready) return false;
  const challenge = await view(TOKEN, 'get_challenge', { e }).catch(() => null);
  if (challenge && challenge.status !== 'Rejected') return log(`epoch ${e} has an open challenge`), false;
  const h = await call(await signer(SCORERS[0]!), TOKEN, 'finalize', { e }, 0n, tgas(150));
  await recordTx(`finalize e${e}`, h);
  const after = await epochRec(e);
  const st: any = await view(TOKEN, 'get_state');
  const supply = await view<string>(TOKEN, 'ft_total_supply');
  await updateIndex(e, { status: after.status, emission: after.emission, yapperPool: after.yapper_pool, finalizeTx: h, supply, reserve: st.reserve, burnedTotal: st.burned_total, mintedTotal: st.minted_total, streak: st.streak, target: st.attention_target });
  log(`finalized ${e}: emission ${Number(BigInt(after.emission) / 10n ** 15n) / 1000} YAP`);
  return true;
}

/** Demo accounts claim with realistic rates: organic personas usually claim, spam bots often forget. */
async function claims(e: number) {
  const f = resolve(PUBLIC, String(e), 'scores.json');
  if (!existsSync(f)) return;
  const s = JSON.parse(await readFile(f, 'utf8'));
  for (const y of s.result.yappers as any[]) {
    const p = PERSONAS.find((x) => x.id === y.account);
    if (!p || BigInt(y.amount) === 0n) continue;
    const rate = p.kind === 'spam' ? 0.4 : p.kind === 'ring' ? 0.85 : 0.9;
    if ((e * 7919 + y.account.length * 104729) % 100 >= rate * 100) continue; // deterministic per (epoch, account)
    if (await view(TOKEN, 'is_claimed', { e, account: y.account })) continue;
    const acc = await signer(y.account);
    try {
      if (!(await view(TOKEN, 'storage_balance_of', { account_id: y.account }))) await call(acc, TOKEN, 'storage_deposit', { account_id: y.account }, 1_250_000_000_000_000_000_000n, tgas(8));
      const h = await call(acc, TOKEN, 'claim', { e, amount: y.amount, score: Number(y.score), tier: y.tier, proof: y.proof }, 0n, tgas(12));
      await recordTx(`claim e${e}`, h, y.account);
    } catch (err) {
      log(`claim ${y.account} failed: ${String(err).slice(0, 160)}`);
    }
  }
}

const claimRuns = new Set<number>();
async function tick() {
  const now = Date.now();
  const cur = Math.floor((now / 1000 - cfg.genesis_ts) / cfg.epoch_secs);
  // Walk recent epochs oldest first: each needs its predecessor final, because the predicted pool depends on it.
  for (let e = Math.max(0, cur - 3); e < cur; e++) {
    const rec = await epochRec(e);
    if (rec && ['Finalized', 'Dead'].includes(rec.status)) {
      if (rec.status === 'Finalized' && !claimRuns.has(e)) { claimRuns.add(e); await claims(e); }
      continue;
    }
    if (rec?.status === 'Proposed') {
      if (await finalize(e)) { claimRuns.add(e); await claims(e); continue; }
      return;
    }
    if (rec?.status === 'Challenged') return log(`epoch ${e} challenged: waiting for the DAO`);
    if (now < bounds(e).toMs + 30_000) return;
    if (cur > e + cfg_deadline()) {
      try {
        await recordTx(`crank_dead_epoch e${e}`, await call(await signer(SCORERS[0]!), TOKEN, 'crank_dead_epoch', { e }, 0n, tgas(100)));
      } catch (err) { log(`crank failed: ${String(err).slice(0, 160)}`); }
      continue;
    }
    await submit(e);
    return;
  }
}
const cfg_deadline = () => (cfg as any).report_deadline_epochs as number;

await loadEnv();
const once = process.argv.indexOf('--once');
if (once > 0) {
  const e = Number(process.argv[once + 1]);
  await submit(e);
  while (!(await finalize(e))) await sleep(20_000);
  await claims(e);
} else {
  log(`scorer service: token ${TOKEN}, epoch ${cfg.epoch_secs}s, genesis ${new Date(cfg.genesis_ts * 1000).toISOString()}${mock ? ', MOCK labels' : ''}`);
  for (;;) {
    try {
      await tick();
    } catch (err) {
      log(`tick error: ${String(err).slice(0, 300)}`);
    }
    await sleep(20_000);
  }
}
export { Y };
