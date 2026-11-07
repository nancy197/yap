// Copies data the UI reads at runtime into public/: deployment info and the read-only mainnet sample.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
const root = new URL('../../', import.meta.url).pathname;
mkdirSync(new URL('../public/mainnet/', import.meta.url), { recursive: true });
const copy = (from, to) => existsSync(root + from) && cpSync(root + from, new URL('../public/' + to, import.meta.url).pathname);
copy('deploy/testnet.json', 'deploy.json');
copy('deploy/transactions.json', 'transactions.json');
copy('data/mainnet-sample/scores.json', 'mainnet/scores.json');
console.log('synced data into web/public');
