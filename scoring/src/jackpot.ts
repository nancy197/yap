// Proof of Yap jackpot: when a block completes, its payout is split by each account's Yap score summed over
// every tick of the block, so early yappers who helped fill the bar share it with whoever pushed it over the line.
import { prorata } from './fixed.js';

/** Sums per-account Yap scores over the ticks of a block (each tick: account -> score, scaled 1e6). */
export function blockContributions(ticks: Record<string, string>[]): Map<string, bigint> {
  const out = new Map<string, bigint>();
  for (const tick of ticks) for (const [account, score] of Object.entries(tick)) {
    const value = BigInt(score);
    if (value < 0n) throw new Error(`negative score for ${account}`);
    if (value > 0n) out.set(account, (out.get(account) ?? 0n) + value);
  }
  return out;
}

/** Splits `payout` pro rata to contributions; amounts sum to `payout` exactly (remainder in account order). */
export function jackpotShares(contributions: Map<string, bigint>, payout: bigint): Map<string, bigint> {
  if (payout < 0n) throw new Error('negative payout');
  const items = [...contributions].filter(([, score]) => score > 0n).map(([key, score]) => ({ key, score }));
  return prorata(items, payout);
}
