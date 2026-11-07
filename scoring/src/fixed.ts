export const S = 1_000_000n;
const LN2 = 693_147n;
const LN10 = 2_302_585n;
export function mul(a: bigint, b: bigint): bigint { return a * b / S; }
export function div(a: bigint, b: bigint): bigint { return a * S / b; }
export function sqrt(n: bigint): bigint {
  if (n < 0n) throw new Error('negative sqrt');
  if (n < 2n) return n;
  let x = 1n << BigInt((n.toString(2).length + 1) >> 1);
  while (true) { const y = (x + n / x) >> 1n; if (y >= x) return x; x = y; }
}
// x is fixed-point. Normalize to [1,2), then use the atanh series.
export function ln(x: bigint): bigint {
  if (x <= 0n) throw new Error('ln domain');
  let shifts = 0n;
  while (x >= 2n * S) { x /= 2n; shifts++; }
  while (x < S) { x *= 2n; shifts--; }
  const z = div(x - S, x + S);
  const zz = mul(z, z);
  let term = z, sum = 0n;
  for (let k = 1n; k <= 79n; k += 2n) { sum += term / k; term = mul(term, zz); }
  return 2n * sum + shifts * LN2;
}
export function log10(x: bigint): bigint { return div(ln(x), LN10); }
export function stakeFixed(raw: string): bigint {
  const n = BigInt(raw);
  if (n < 0n) throw new Error('negative stake');
  return n * S / 1_000_000_000_000_000_000n;
}
export function prorata(items: {key: string; score: bigint}[], total: bigint): Map<string, bigint> {
  const sum = items.reduce((n, x) => n + x.score, 0n);
  const out = new Map<string, bigint>();
  if (sum === 0n || total === 0n) return new Map(items.map(x => [x.key, 0n]));
  const sorted = [...items].sort((a,b) => a.key<b.key?-1:a.key>b.key?1:0);
  let paid = 0n;
  for (const x of sorted) { const amount = x.score * total / sum; out.set(x.key, amount); paid += amount; }
  let remainder = total - paid;
  for (const x of sorted) { if (remainder-- <= 0n) break; out.set(x.key, (out.get(x.key) ?? 0n) + 1n); }
  return out;
}
