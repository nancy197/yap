// Quality labeler: an AI model running in a verified TEE on NEAR AI Cloud gives each post q in 0..3.
// Labels are the only non-deterministic input to scoring, so every run publishes the label file, the prompt hash
// and the TEE attestation report hash. Labels are cached by post key + text hash and never recomputed.
// CLI: pnpm labeler --dataset <file> [--mock] [--out labels.json]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { mockLabels, type EpochDataset, type Labels } from '@yap/scoring';
import { chatJson, fetchAttestation, modelPricing, type AttestationResult } from './providers/nearai.ts';
import { ROOT, loadEnv } from './common.ts';

export const LABEL_MODEL = 'Qwen/Qwen3.8-27B';
const CACHE = resolve(ROOT, 'data/labels-cache');
const BATCH = 8;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
type Detail = { key: string; q: 0 | 1 | 2 | 3; reason: string; cached?: boolean };
export type LabelRun = {
  labels: Labels;
  details: Detail[];
  model: string;
  simulated: boolean;
  promptHash: string;
  attestation: { verified: boolean; reportHash: string; checks: { name: string; passed: boolean }[] } | null;
  usage: { promptTokens: number; completionTokens: number; usd: number; calls: number };
};

export async function promptText() {
  return readFile(resolve(ROOT, 'agents/prompts/label.md'), 'utf8');
}

export async function labelDataset(d: EpochDataset, opts: { mock?: boolean } = {}): Promise<LabelRun> {
  const prompt = await promptText();
  const promptHash = sha(prompt);
  const posts = d.posts; // every post in the dataset may be scored or engaged with, so all need a label
  if (opts.mock || !process.env.NEARAI_API_KEY) {
    const labels = mockLabels(d);
    return { labels, details: Object.entries(labels).map(([key, q]) => ({ key, q, reason: 'SIMULATED heuristic label' })), model: 'mock-heuristic (SIMULATED)', simulated: true, promptHash, attestation: null, usage: { promptTokens: 0, completionTokens: 0, usd: 0, calls: 0 } };
  }
  await mkdir(CACHE, { recursive: true });
  const details: Detail[] = [];
  const todo: typeof posts = [];
  for (const p of posts) {
    const f = resolve(CACHE, `${sha(p.key + '\n' + p.text)}.json`);
    if (existsSync(f)) details.push({ ...(JSON.parse(await readFile(f, 'utf8')) as Detail), cached: true });
    else todo.push(p);
  }
  // Attest the model's TEE once per run, before sending any post to it.
  let att: AttestationResult | null = null;
  if (todo.length) {
    att = await fetchAttestation(LABEL_MODEL);
    if (!att.verified) throw new Error(`attestation failed: ${att.checks.filter((c) => !c.passed).map((c) => c.name).join(', ')}`);
  }
  const usage = { promptTokens: 0, completionTokens: 0, usd: 0, calls: 0 };
  /** Asks the model for labels; keeps every valid one it returns, so retries only cover what is missing. */
  const ask = async (batch: typeof todo): Promise<Map<string, Detail>> => {
    const out = new Map<string, Detail>();
    const user = JSON.stringify({ posts: batch.map((p) => ({ key: p.key, text: p.text.slice(0, 1200), reply: !!p.replyTo, quote: !!p.quote })) });
    let r;
    try {
      r = await chatJson(LABEL_MODEL, prompt, user, 0);
    } catch (e) {
      console.warn(`labeler call failed: ${String(e).slice(0, 160)}`);
      return out;
    }
    usage.promptTokens += r.promptTokens;
    usage.completionTokens += r.completionTokens;
    usage.calls++;
    let arr: Detail[] = [];
    try {
      const j = JSON.parse(r.content.slice(r.content.indexOf('{'), r.content.lastIndexOf('}') + 1));
      arr = Array.isArray(j) ? j : (j.labels ?? []);
    } catch {
      console.warn(`labeler JSON parse failed: ${r.content.slice(0, 160).replace(/\s+/g, ' ')}`);
    }
    for (const p of batch) {
      const hit = arr.find((x) => x?.key === p.key);
      const q = Number(hit?.q);
      if (hit && [0, 1, 2, 3].includes(q)) out.set(p.key, { key: p.key, q: q as Detail['q'], reason: String(hit.reason ?? '').slice(0, 160) });
    }
    return out;
  };
  const save = async (p: (typeof todo)[number], x: Detail) => {
    await writeFile(resolve(CACHE, `${sha(p.key + '\n' + p.text)}.json`), JSON.stringify(x));
    details.push(x);
  };
  const fallback = mockLabels(d);
  const batches: (typeof todo)[] = [];
  for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));
  // Six batches in flight: labelling must finish well inside one epoch.
  const work = async (first: (typeof todo)) => {
    let left = first;
    for (let attempt = 0; attempt < 2 && left.length; attempt++) {
      const got = await ask(left);
      for (const p of left) if (got.has(p.key)) await save(p, got.get(p.key)!);
      left = left.filter((p) => !got.has(p.key));
    }
    // Last resort: one post per call; if even that fails, a clearly marked heuristic label (not cached).
    for (const p of left) {
      const got = await ask([p]);
      if (got.has(p.key)) await save(p, got.get(p.key)!);
      else details.push({ key: p.key, q: fallback[p.key]!, reason: 'FALLBACK heuristic: the TEE labeler returned no valid label for this post' });
    }
  };
  for (let i = 0; i < batches.length; i += 6) await Promise.all(batches.slice(i, i + 6).map(work));
  try {
    const price = (await modelPricing())[LABEL_MODEL];
    if (price) usage.usd = (usage.promptTokens * price.input + usage.completionTokens * price.output) / 1e6;
  } catch {
    /* pricing is informational */
  }
  details.sort((a, b) => (a.key < b.key ? -1 : 1));
  const labels: Labels = Object.fromEntries(details.map((x) => [x.key, x.q]));
  return {
    labels,
    details,
    model: LABEL_MODEL,
    simulated: false,
    promptHash,
    attestation: att ? { verified: att.verified, reportHash: att.reportHash, checks: att.checks.map(({ name, passed }) => ({ name, passed })) } : null,
    usage,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await loadEnv();
  const arg = (n: string) => process.argv[process.argv.indexOf(`--${n}`) + 1];
  const d = JSON.parse(await readFile(resolve(arg('dataset')), 'utf8')) as EpochDataset;
  const run = await labelDataset(d, { mock: process.argv.includes('--mock') });
  const out = process.argv.includes('--out') ? resolve(arg('out')) : null;
  if (out) {
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, JSON.stringify(run, null, 2));
  }
  console.log(JSON.stringify({ posts: run.details.length, model: run.model, attestation: run.attestation?.verified, usage: run.usage, sample: run.details.slice(0, 5) }, null, 2));
}
