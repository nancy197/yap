// Browser wallet. Two ways to sign real testnet transactions:
// - a NEAR wallet through Wallet Selector (MyNearWallet, Intear), or
// - a one-click burner account (public faucet) / imported key kept in this browser's localStorage.
// It signs near.social writes (`__fastdata_kv` on `social`) and calls to the $YAP, steward and DAO contracts.
import { Account, JsonRpcProvider, KeyPair, actions, type KeyPairString } from 'near-api-js';
import { useSyncExternalStore } from 'react';
import { setupWalletSelector, type WalletSelector } from '@near-wallet-selector/core';
import { setupModal, type WalletSelectorModal } from '@near-wallet-selector/modal-ui';
import { setupMyNearWallet } from '@near-wallet-selector/my-near-wallet';
import { setupIntearWallet } from '@near-wallet-selector/intear-wallet';
import '@near-wallet-selector/modal-ui/styles.css';
import { RPC, TOKEN } from './data';

const FAUCET = 'https://helper.nearprotocol.com/account';
const STORE = 'yap-wallet-v1';
const provider = new JsonRpcProvider({ url: RPC });
type Saved = { id: string; key?: string; kind: 'burner' | 'selector' } | null;
let current: Saved = (() => {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) ?? 'null');
    return s && s.key ? { ...s, kind: 'burner' } : null;
  } catch {
    return null;
  }
})();
const subs = new Set<() => void>();
const set = (s: Saved) => {
  current = s;
  try {
    s?.kind === 'burner' ? localStorage.setItem(STORE, JSON.stringify(s)) : localStorage.removeItem(STORE);
  } catch {}
  subs.forEach((f) => f());
};
export function useWallet() {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => current,
  );
}

// ---------- Wallet Selector ----------
let selector: Promise<{ selector: WalletSelector; modal: WalletSelectorModal }> | null = null;
function getSelector() {
  selector ??= (async () => {
    // Meteor's SDK still imports near-api-js v4 APIs and breaks the build with v7, so it is left out.
    const s = await setupWalletSelector({ network: 'testnet', modules: [setupMyNearWallet(), setupIntearWallet()] });
    const modal = setupModal(s, { contractId: TOKEN, description: 'Sign in to YAP with a NEAR testnet account.' });
    const sync = () => {
      const acc = s.store.getState().accounts.find((a) => a.active) ?? s.store.getState().accounts[0];
      if (acc) set({ id: acc.accountId, kind: 'selector' });
      else if (current?.kind === 'selector') set(null);
    };
    s.store.observable.subscribe(sync);
    sync();
    return { selector: s, modal };
  })();
  return selector;
}
// Restore a wallet session on load (MyNearWallet returns here after redirects).
if (!current) getSelector().catch(() => {});
export async function connectWallet() {
  (await getSelector()).modal.show();
}

export const account = () => (current?.kind === 'burner' && current.key ? new Account(current.id, provider, current.key as KeyPairString) : null);
export async function signOut() {
  if (current?.kind === 'selector') {
    const w = await (await getSelector()).selector.wallet().catch(() => null);
    await w?.signOut().catch(() => {});
  }
  set(null);
}

export async function createBurner(): Promise<string> {
  const id = `yap-${Math.random().toString(36).slice(2, 10)}.testnet`;
  const kp = KeyPair.fromRandom('ed25519');
  const r = await fetch(FAUCET, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ newAccountId: id, newAccountPublicKey: kp.getPublicKey().toString() }) });
  if (!r.ok) throw new Error(`Faucet: ${r.status} ${(await r.text()).slice(0, 120)}`);
  set({ id, key: kp.toString(), kind: 'burner' });
  return id;
}
export async function importKey(id: string, key: string) {
  const kp = KeyPair.fromString(key.trim() as KeyPairString);
  const keys: any = await provider.viewAccessKeyList({ accountId: id.trim(), finality: 'final' } as never);
  if (!(keys.keys ?? []).some((k: any) => k.public_key === kp.getPublicKey().toString())) throw new Error('This key is not on that account');
  set({ id: id.trim(), key: key.trim(), kind: 'burner' });
}

const hashOf = (r: any) => r?.transaction?.hash ?? r?.transaction_outcome?.id ?? '';

/** One function call, signed by whichever wallet is connected. Returns the tx hash ('' after a wallet redirect). */
async function send(receiverId: string, methodName: string, args: Record<string, unknown>, gas: bigint, deposit: bigint, expectFailure = false): Promise<string> {
  if (!current) throw new Error('Connect a testnet account first');
  if (current.kind === 'burner') {
    const acc = account()!;
    const r: any = await acc.signAndSendTransaction({ receiverId, actions: [actions.functionCall(methodName, args, gas, deposit)], throwOnFailure: false } as never);
    const fail = r?.status?.Failure ?? r?.receipts_outcome?.find((x: any) => x.outcome?.status?.Failure)?.outcome?.status?.Failure;
    if (fail && !expectFailure) throw new Error(`${methodName} failed: ${JSON.stringify(fail).slice(0, 240)}`);
    return hashOf(r);
  }
  const w = await (await getSelector()).selector.wallet();
  const r: any = await w.signAndSendTransaction({ signerId: current.id, receiverId, actions: [{ type: 'FunctionCall', params: { methodName, args, gas: gas.toString(), deposit: deposit.toString() } }] } as never);
  return hashOf(r);
}

/** near.social write. The receipt fails by design (no contract on `social`); FastData still indexes it. */
export async function socialWrite(args: Record<string, unknown>): Promise<string> {
  // Wallets may refuse 1 gas, so browser wallets attach 1 Ggas (still about 0.0001 NEAR).
  return send('social', '__fastdata_kv', args, current?.kind === 'burner' ? 1n : 1_000_000_000n, 0n, true);
}
export async function call(method: string, args: Record<string, unknown>, deposit = 0n, tgas = 100, contractId = TOKEN): Promise<string> {
  return send(contractId, method, args, BigInt(tgas) * 10n ** 12n, deposit);
}
export async function ensureStorage(id: string) {
  const { view } = await import('./data');
  if (!(await view('storage_balance_of', { account_id: id }))) await call('storage_deposit', { account_id: id }, 1_250_000_000_000_000_000_000n, 30);
}
