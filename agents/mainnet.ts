// Read-only mainnet board: index real near.social mainnet data, label every post with the TEE-attested model
// (same labeler, prompt and attestation checks as testnet), score it. Unrewarded: nothing is sent on chain.
// Usage: pnpm mainnet [--days 30]
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { history, makeDataset } from '@yap/indexer';
import { score, canonical, sha256Hex, type Write } from '@yap/scoring';
import { labelDataset } from './labeler.ts';
import { ROOT, loadEnv } from './common.ts';

await loadEnv();
const days = Number(process.argv[process.argv.indexOf('--days') + 1]) || 30;
const toMs = Date.now();
const fromMs = toMs - days * 86_400_000;
const writes: Write[] = [];
for await (const w of history('mainnet')) writes.push(w);
const dataset = makeDataset('mainnet', fromMs, toMs, writes);
console.log(`mainnet: ${writes.length} writes scanned, ${dataset.posts.length} posts in the last ${days} days`);
const labels = await labelDataset(dataset);
console.log(`labels: ${labels.details.length} by ${labels.model}, attestation ${labels.attestation?.verified ?? 'cached'}, $${labels.usage.usd.toFixed(4)}`);
const result = score(dataset, labels.labels, {}, { yapperAllocation: '0' });
const out = resolve(ROOT, 'data/mainnet-sample');
await mkdir(out, { recursive: true });
await writeFile(resolve(out, 'dataset.json'), canonical(dataset) + '\n');
await writeFile(resolve(out, 'labels.json'), JSON.stringify({ labels: labels.labels, details: labels.details, model: labels.model, simulated: labels.simulated, promptHash: labels.promptHash, attestation: labels.attestation, usage: labels.usage }, null, 1));
await writeFile(
  resolve(out, 'scores.json'),
  canonical({ network: 'mainnet', networkLabel: 'mainnet (read-only, unrewarded)', readOnly: true, simulatedLabels: labels.simulated, labelModel: labels.model, days, fromMs, toMs, dataHash: dataset.dataHash, labelsHash: sha256Hex(canonical(labels.labels)), attention: result.attention, yappersRoot: result.yappersRoot, result }) + '\n',
);
console.log('top 10:', result.yappers.slice(0, 10).map((y) => `${y.account} ${(Number(y.score) / 1e6).toFixed(2)}`).join(', '));
