import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('non-finite number');
    if (typeof value === 'bigint') throw new Error('encode bigint as decimal string');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().filter(k => obj[k] !== undefined).map(k => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`;
}
export function sha256Hex(value: Uint8Array | string): string {
  return bytesToHex(sha256(typeof value === 'string' ? new TextEncoder().encode(value) : value));
}
export function datasetHash<T extends object>(dataset: T): string {
  const {dataHash: _ignored, ...content} = dataset as T & {dataHash?: string};
  return sha256Hex(canonical(content));
}
