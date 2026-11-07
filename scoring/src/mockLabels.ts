import type { EpochDataset, Labels } from './types.js';
// SIMULATED deterministic labels for tests and read-only previews only.
export function mockLabels(dataset: EpochDataset): Labels {
  const out: Labels = {};
  for (const post of dataset.posts) {
    const text = post.text.trim();
    const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    const unique = new Set(words);
    const distinct = unique.size * 100;
    const count = words.length;
    out[post.key] = !text && !post.quote ? 0 : count < 4 || distinct < count * 30 ? 0 : count < 12 || distinct < count * 55 ? 1 : count < 40 ? 2 : 3;
  }
  return out;
}
