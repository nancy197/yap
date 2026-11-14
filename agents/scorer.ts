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
import { EPOCH_DIR, ROOT, HQ, TOKEN, Y, tgas, call, view, signer, recordTx, sleep, loadEnv } from './common.ts';
import { SCORERS } from './deploy.ts';
import { PERSONAS } from './seed.ts';

const PUBLIC = resolve(ROOT, 'web/public/epochs', EPOCH_DIR);
const BASE_URI = process.env.YAP_PUBLIC_BASE ?? `https://raw.githubusercontent.com/nancy197/yap/main/web/public/epochs/${EPOCH_DIR}`;
const mock = process.argv.includes('--mock');
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

type Cfg = { epoch_secs: number; genesis_ts: number; base_emission: string; max_ratio_bps: number; jackpot_bps: number; vault_release_bps: number; yapper_bps: number; challenge_secs: number; claim_epochs: number };
type St = { attention_target: string; current_epoch: number; block_number: number; block_start_epoch: number; block_progress: string; block_threshold: string; jackpot_pot: string; vault: string };
const cfg = await view<Cfg>(TOKEN, 'get_config');
const bounds = (e: number) => ({ fromMs: (cfg.genesis_ts + e * cfg.epoch_secs) * 1000, toMs: (cfg.genesis_ts + (e + 1) * cfg.epoch_secs) * 1000 });
const curEpoch = () => Math.floor((Date.now() / 1000 - cfg.genesis_ts) / cfg.epoch_secs);
const cfg_deadline = () => (cfg as any).report_deadline_epochs as number;
/** The contract refuses a report once the current epoch passes `e + report_deadline_epochs`, so this is the
 *  wall-clock instant after which epoch `e` can only go Dead. Every expensive step is budgeted against it. */
const submitDeadlineMs = (e: number) => bounds(e + cfg_deadline()).toMs;
/** Time kept back from labelling for the full FastData read, scoring and the on-chain submits. */
const SUBMIT_RESERVE_MS = 90_000;

/** Same integer math as the contract's `finalize`, so leaf amounts sum to exactly the pool it will set:
 *  `tick` is this tick's yapper share; `jackpot` is the block payout if this tick's attention completes the block. */
export function predictPools(attention: bigint, st: St): { tick: bigint; jackpot: bigint } {
  if (attention === 0n) return { tick: 0n, jackpot: 0n };
  const base = BigInt(cfg.base_emission);
  const raw = (base * attention) / BigInt(st.attention_target);
  const cap = (base * BigInt(cfg.max_ratio_bps)) / 10_000n;
  const emission = raw < cap ? raw : cap;
  const toJackpot = (emission * BigInt(cfg.jackpot_bps)) / 10_000n;
  const tick = ((emission - toJackpot) * BigInt(cfg.yapper_bps)) / 10_000n;
  const completes = BigInt(st.block_progress) + attention >= BigInt(st.block_threshold);
  const release = (BigInt(st.vault) * BigInt(cfg.vault_release_bps)) / 10_000n;
  return { tick, jackpot: completes ? BigInt(st.jackpot_pot) + toJackpot + release : 0n };
}

/** Per-account Yap scores of the block's earlier ticks, from the files we already published. */
async function earlierInBlock(start: number, e: number): Promise<Record<string, string>[]> {
  const out: Record<string, string>[] = [];
  for (let k = start; k < e; k++) {
    const f = resolve(PUBLIC, String(k), 'scores.json');
    if (!existsSync(f)) continue;
    const s = JSON.parse(await readFile(f, 'utf8'));
    out.push(Object.fromEntries((s.result.yappers as { account: string; score: string }[]).filter((y) => BigInt(y.score) > 0n).map((y) => [y.account, y.score])));
  }
  return out;
}

// FastData does not return history in strict time order (late-indexed writes land behind newer ones), so an
// incremental "stop at the first known write" read silently drops data. Do one full read per tick instead and share
// it between prelabelling and the report: a read is reused only if it started after `notBefore`.
let writesCache: { at: number; writes: Write[] } | null = null;
async function allWrites(notBefore: number): Promise<Write[]> {
  if (writesCache && writesCache.at >= notBefore) return writesCache.writes;
  const at = Date.now();
  const out: Write[] = [];
  for await (const w of history('testnet')) out.push(w);
  writesCache = { at, writes: out };
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

async function buildReport(e: number, tamper = false, labelDeadlineMs?: number) {
  const { fromMs, toMs } = bounds(e);
  const writes = await allWrites(toMs + 30_000);
  const dataset: EpochDataset = makeDataset('testnet', fromMs, toMs, writes, e);
  log(`epoch ${e}: ${dataset.posts.length} posts, ${dataset.likes.length} likes, ${dataset.reposts.length} reposts, ${dataset.follows.length} follows`);
  const labels: LabelRun = await labelDataset(dataset, { mock, deadlineMs: labelDeadlineMs });
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
  const pools = predictPools(BigInt(first.attention), state);
  const jackpot = pools.jackpot > 0n ? { block: state.block_number, payout: pools.jackpot.toString(), earlier: await earlierInBlock(state.block_start_epoch, e) } : undefined;
  if (jackpot) log(`epoch ${e} completes block ${state.block_number}: jackpot ${pools.jackpot} split over ${jackpot.earlier.length + 1} ticks`);
  const scoreParams = { yapperAllocation: pools.tick.toString(), arenas, trailingScores: trail, ...(jackpot ? { jackpot } : {}) };
  const result: ScoreResult = score(dataset, labels.labels, st, scoreParams);
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
  await writeFile(resolve(dir, 'scores.json'), JSON.stringify({ epoch: e, fromMs, toMs, predictedYapperPool: (pools.tick + pools.jackpot).toString(), predictedJackpot: pools.jackpot.toString(), scoreParams, stakes: st, arenas, trailing: trail, report, result }, null, 1));
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
  const deadline = submitDeadlineMs(e);
  if (Date.now() >= deadline) return log(`epoch ${e}: report deadline passed, leaving it to the crank`);
  const honest = await buildReport(e, false, deadline - SUBMIT_RESERVE_MS);
  const tampered = e === tamperAt && !rec ? await buildReport(e, true, deadline - SUBMIT_RESERVE_MS) : null;
  for (const [i, id] of SCORERS.entries()) {
    // Reading the data and labelling it takes minutes, so the deadline is checked again here rather than
    // sending transactions the contract will refuse.
    if (Date.now() >= deadline) return log(`epoch ${e}: deadline passed while building the report`);
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
  // Only a challenge that is still open blocks finalization; an Upheld one discarded the earlier report.
  if (challenge && ['Open', 'ProposalPending'].includes(challenge.status)) return log(`epoch ${e} has an open challenge`), false;
  const h = await call(await signer(SCORERS[0]!), TOKEN, 'finalize', { e }, 0n, tgas(150));
  await recordTx(`finalize e${e}`, h);
  const after = await epochRec(e);
  const st: any = await view(TOKEN, 'get_state');
  const supply = await view<string>(TOKEN, 'ft_total_supply');
  await updateIndex(e, { status: after.status, emission: after.emission, yapperPool: after.yapper_pool, finalizeTx: h, supply, vault: st.vault, jackpotPot: st.jackpot_pot, block: after.block, jackpot: after.jackpot, blockNumber: st.block_number, blockProgress: st.block_progress, blockThreshold: st.block_threshold, burnedTotal: st.burned_total, mintedTotal: st.minted_total, target: st.attention_target });
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
const prelabeled = new Set<number>();

/** Past the deadline a report can no longer be accepted, so the permissionless crank closes the epoch. */
async function crankDead(e: number, why = '') {
  try {
    await recordTx(`crank_dead_epoch e${e}${why}`, await call(await signer(SCORERS[0]!), TOKEN, 'crank_dead_epoch', { e }, 0n, tgas(100)));
  } catch (err) {
    log(`crank failed: ${String(err).slice(0, 160)}`);
  }
}

/** Cheap pass: finalize, claim and close every finished epoch, with no data read and no labelling. It runs
 *  first so that the labelling budget below is never spent on an epoch the contract would already refuse. */
async function settle(from: number, cur: number): Promise<Record<number, string | undefined>> {
  const status: Record<number, string | undefined> = {};
  for (let e = from; e < cur; e++) {
    const rec = await epochRec(e);
    status[e] = rec?.status;
    if (rec?.status === 'Finalized') {
      if (!claimRuns.has(e)) { claimRuns.add(e); await claims(e); }
      continue;
    }
    if (rec?.status === 'Dead' || rec?.status === 'Challenged') continue;
    if (rec?.status === 'Proposed') {
      if (await finalize(e)) {
        status[e] = 'Finalized';
        claimRuns.add(e);
        await claims(e);
      } else if (Date.now() >= submitDeadlineMs(e)) {
        await crankDead(e, ' (missed deadline)');
        status[e] = (await epochRec(e))?.status;
      }
      continue;
    }
    if (Date.now() >= submitDeadlineMs(e)) {
      await crankDead(e);
      status[e] = (await epochRec(e))?.status;
    }
  }
  return status;
}

/** Expensive pass: at most one report per loop, for the oldest epoch that can still make its deadline. Each
 *  epoch needs its predecessor settled, because the predicted pool reads the state that settling it leaves. */
async function reportNext(from: number, cur: number, status: Record<number, string | undefined>) {
  for (let e = from; e < cur; e++) {
    const st = status[e];
    if (st === 'Finalized' || st === 'Dead') continue;
    // Proposed and still inside its challenge window, or waiting on the DAO: later epochs have to wait too.
    if (st === 'Proposed') return;
    if (st === 'Challenged') return log(`epoch ${e} challenged: waiting for the DAO`);
    if (Date.now() < bounds(e).toMs + 30_000) return; // the indexer needs a moment past the epoch's end
    if (Date.now() >= submitDeadlineMs(e)) continue; // already closed above, or will be on the next loop
    return await submit(e);
  }
}

async function tick() {
  const cur = curEpoch();
  const from = Math.max(0, cur - 8);
  const status = await settle(from, cur);
  await reportNext(from, cur, status);
  // Last: label the epoch that just ended so its own report is quick. Labels are cached, so this is pure
  // prefetch, and it runs after the work above because it must never delay a report that is due.
  const ended = cur - 1;
  if (ended >= 0 && !prelabeled.has(ended) && Date.now() >= bounds(ended).toMs + 30_000) {
    prelabeled.add(ended);
    try {
      const { fromMs, toMs } = bounds(ended);
      const d = makeDataset('testnet', fromMs, toMs, await allWrites(toMs + 30_000), ended);
      const l = await labelDataset(d, { mock, deadlineMs: submitDeadlineMs(ended) - SUBMIT_RESERVE_MS });
      log(`prelabeled epoch ${ended}: ${l.details.length} posts, $${l.usage.usd.toFixed(4)}`);
    } catch (err) {
      log(`prelabel ${ended} failed: ${String(err).slice(0, 160)}`);
    }
  }
}

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
