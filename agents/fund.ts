// Tops up the YAP testnet agents so they can keep running through judging.
// Funds come from a fresh faucet account (10 testnet NEAR); falls back to yap-hq.testnet if the faucet refuses.
// Keys go to ~/.near-credentials/testnet, never into the repo.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { KeyPair } from 'near-api-js';
import { signer, balance, exists, N, ROOT, TOKEN, STEWARD, DAO } from './common.ts';

const CRED = resolve(homedir(), '.near-credentials/testnet');
const STATE = resolve(ROOT, 'data/funder.txt');
const milli = (x: number) => (BigInt(Math.round(x * 1000)) * N) / 1000n;

async function funder(): Promise<string> {
  if (existsSync(STATE)) {
    const id = (await readFile(STATE, 'utf8')).trim();
    if (Number(await balance(id)) > 2) return id;
  }
  const id = `yapops${Date.now().toString().slice(-7)}.testnet`;
  const key = KeyPair.fromRandom('ed25519');
  const r = await fetch('https://helper.nearprotocol.com/account', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ newAccountId: id, newAccountPublicKey: key.getPublicKey().toString() }),
  });
  if (!r.ok) { console.log(`faucet refused (${r.status}): ${(await r.text()).slice(0, 160)}`); return 'yap-hq.testnet'; }
  for (let i = 0; i < 20 && !(await exists(id)); i++) await new Promise((f) => setTimeout(f, 3000));
  await mkdir(CRED, { recursive: true });
  await writeFile(resolve(CRED, `${id}.json`), JSON.stringify({ account_id: id, public_key: key.getPublicKey().toString(), private_key: key.toString() }), { mode: 0o600 });
  await writeFile(STATE, id);
  console.log(`faucet account ${id}: ${await balance(id)} NEAR`);
  return id;
}

// Target balance per account (testnet NEAR).
const targets: Record<string, number> = {
  'scorer-1.yap-hq.testnet': 0.7, 'scorer-2.yap-hq.testnet': 0.5, 'scorer-3.yap-hq.testnet': 0.5,
  'watchdog.yap-hq.testnet': 0.4, 'yapbot.yap-hq.testnet': 0.4, [STEWARD]: 0.2,
};
for (let i = 1; i <= 34; i++) targets[`y${String(i).padStart(2, '0')}.yap-hq.testnet`] = 0.2;

const from = await funder();
const src = await signer(from);
const keep = from === 'yap-hq.testnet' ? 0.8 : 0.1;

// Contracts pay for their own state. When free balance (amount - storage cost) drops under 0.3 NEAR,
// every state write fails with LackBalanceForStateActionError, which is what stopped the scorer on 9 Nov.
const view = async (id: string) => (await fetch('https://test.rpc.fastnear.com', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'query', params: { request_type: 'view_account', finality: 'final', account_id: id } }),
}).then((r) => r.json()) as any).result;
for (const id of [TOKEN, STEWARD, DAO]) {
  const a = await view(id);
  const free = Number(BigInt(a.amount) - BigInt(a.storage_usage) * 10n ** 19n) / 1e24;
  if (free >= 0.3) continue;
  const left = Number(await balance(from));
  if (left - 1 < keep) { console.log(`cannot top up ${id}: ${from} has ${left} NEAR`); continue; }
  await src.transfer({ receiverId: id, amount: milli(1) } as never);
  console.log(`${id}: free ${free.toFixed(3)} -> +1 NEAR`);
}

for (const [id, want] of Object.entries(targets)) {
  const have = Number(await balance(id));
  const left = Number(await balance(from));
  const need = +(want - have).toFixed(3);
  if (need < 0.02) continue;
  if (left - need < keep) { console.log(`stop: ${from} has ${left} NEAR left`); break; }
  await src.transfer({ receiverId: id, amount: milli(need) } as never);
  console.log(`${id}: ${have} -> +${need}`);
}
console.log(`done; ${from} has ${await balance(from)} NEAR`);
