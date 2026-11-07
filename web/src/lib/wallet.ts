// Browser wallet: a one-click burner testnet account (public faucet) or an imported testnet key, kept in this
// browser's localStorage. It signs near.social writes (`__fastdata_kv` on `social`) and $YAP contract calls.
import { Account, JsonRpcProvider, KeyPair, actions, type KeyPairString } from 'near-api-js';
import { useSyncExternalStore } from 'react';
import { RPC, TOKEN } from './data';

const FAUCET = 'https://helper.nearprotocol.com/account';
const STORE = 'yap-wallet-v1';
const provider = new JsonRpcProvider({ url: RPC });
type Saved = { id: string; key: string } | null;
let current: Saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? 'null');
  } catch {
    return null;
  }
})();
const subs = new Set<() => void>();
const set = (s: Saved) => {
  current = s;
  try {
    s ? localStorage.setItem(STORE, JSON.stringify(s)) : localStorage.removeItem(STORE);
  } catch {}
  subs.forEach((f) => f());
};
export function useWallet() {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => current,
  );
}
export const account = () => (current ? new Account(current.id, provider, current.key as KeyPairString) : null);
export const signOut = () => set(null);

export async function createBurner(): Promise<string> {
  const id = `yap-${Math.random().toString(36).slice(2, 10)}.testnet`;
  const kp = KeyPair.fromRandom('ed25519');
  const r = await fetch(FAUCET, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ newAccountId: id, newAccountPublicKey: kp.getPublicKey().toString() }) });
  if (!r.ok) throw new Error(`Faucet: ${r.status} ${(await r.text()).slice(0, 120)}`);
  set({ id, key: kp.toString() });
  return id;
}
export async function importKey(id: string, key: string) {
  const kp = KeyPair.fromString(key.trim() as KeyPairString);
  const keys: any = await provider.viewAccessKeyList({ accountId: id.trim(), finality: 'final' } as never);
  if (!(keys.keys ?? []).some((k: any) => k.public_key === kp.getPublicKey().toString())) throw new Error('This key is not on that account');
  set({ id: id.trim(), key: key.trim() });
}

const need = () => {
  const a = account();
  if (!a) throw new Error('Connect a testnet account first');
  return a;
};
const hashOf = (r: any) => r?.transaction?.hash ?? r?.transaction_outcome?.id ?? '';

/** near.social write. The receipt fails by design (no contract on `social`); FastData still indexes it. */
export async function socialWrite(args: Record<string, unknown>): Promise<string> {
  const r: any = await need().signAndSendTransaction({ receiverId: 'social', actions: [actions.functionCall('__fastdata_kv', args, 1n, 0n)], throwOnFailure: false } as never);
  return hashOf(r);
}
export async function call(method: string, args: Record<string, unknown>, deposit = 0n, tgas = 100, contractId = TOKEN): Promise<string> {
  const r: any = await need().callFunctionRaw({ contractId, methodName: method, args, deposit, gas: BigInt(tgas) * 10n ** 12n });
  const fail = r?.status?.Failure ?? r?.receipts_outcome?.find((x: any) => x.outcome?.status?.Failure)?.outcome?.status?.Failure;
  if (fail) throw new Error(`${method} failed: ${JSON.stringify(fail).slice(0, 240)}`);
  return hashOf(r);
}
export async function ensureStorage(id: string) {
  const { view } = await import('./data');
  if (!(await view('storage_balance_of', { account_id: id }))) await call('storage_deposit', { account_id: id }, 1_250_000_000_000_000_000_000n, 30);
}
