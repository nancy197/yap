import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

const enc = new TextEncoder();
function concat(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((n,p) => n+p.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}
function unsigned(n: bigint, bytes: number): Uint8Array {
  if (n < 0n || n >= (1n << BigInt(bytes * 8))) throw new Error(`out of range u${bytes*8}`);
  const out = new Uint8Array(bytes);
  for (let i=0; i<bytes; i++) out[i] = Number((n >> BigInt(i*8)) & 255n);
  return out;
}
function str(s: string): Uint8Array { const body = enc.encode(s); return concat(unsigned(BigInt(body.length),4),body); }
export function yapperLeaf(epoch: number, account: string, amount: bigint | string, score: bigint | string, tier: number): string {
  return bytesToHex(sha256(concat(Uint8Array.of(0),unsigned(BigInt(epoch),4),str(account),unsigned(BigInt(amount),16),unsigned(BigInt(score),8),unsigned(BigInt(tier),1))));
}
export function arenaLeaf(arenaId: number, epoch: number, account: string, amount: bigint | string): string {
  return bytesToHex(sha256(concat(Uint8Array.of(1),unsigned(BigInt(arenaId),4),unsigned(BigInt(epoch),4),str(account),unsigned(BigInt(amount),16))));
}
export function nodeHash(a: string, b: string): string {
  const aa = hexToBytes(a), bb = hexToBytes(b);
  if (aa.length !== 32 || bb.length !== 32) throw new Error('hash must be 32 bytes');
  return bytesToHex(sha256(concat(Uint8Array.of(2), ...(a <= b ? [aa,bb] : [bb,aa]))));
}
export function merkle(leaves: string[]): {root:string; proofs:string[][]} {
  if (leaves.length === 0) return {root:'0'.repeat(64),proofs:[]};
  let level = [...leaves];
  const proofs = leaves.map(() => [] as string[]);
  let groups = leaves.map((_,i) => [i]);
  while (level.length > 1) {
    const next: string[] = [], nextGroups: number[][] = [];
    for (let i=0; i<level.length; i+=2) {
      const left = level[i]!; const right = level[i+1] ?? left;
      if (i+1 < level.length) {
        for (const j of groups[i]!) proofs[j]!.push(right);
        for (const j of groups[i+1]!) proofs[j]!.push(left);
      } else for (const j of groups[i]!) proofs[j]!.push(left);
      next.push(nodeHash(left,right));
      nextGroups.push([...(groups[i] ?? []),...(groups[i+1] ?? [])]);
    }
    level = next; groups = nextGroups;
  }
  return {root:level[0]!,proofs};
}
export function verifyProof(leaf: string, proof: string[], root: string): boolean {
  return proof.reduce(nodeHash, leaf) === root;
}
