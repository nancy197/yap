import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonical } from '@yap/scoring';
import { history, type Network } from './reader.js';
import { makeDataset } from './social.js';
const argv=process.argv.slice(2);
function arg(name:string):string|undefined {const i=argv.indexOf(`--${name}`);return i<0?undefined:argv[i+1];}
const network=(arg('network')??'testnet') as Network;
if(network!=='testnet'&&network!=='mainnet') throw new Error('network must be testnet or mainnet');
const from=Number(arg('from')),to=Number(arg('to'));
if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||from>=to) throw new Error('provide --from <ms> --to <ms>');
const writes=[];
for await (const write of history(network,(pages,rows)=>{if(pages%25===0) process.stderr.write(`FastData pages ${pages}, rows ${rows}\n`);})) writes.push(write);
const dataset=makeDataset(network,from,to,writes,arg('epoch')===undefined ? undefined : Number(arg('epoch')));
const out=resolve(arg('out')??`../data/epochs/${network}/${dataset.epoch}.json`);
await mkdir(resolve(out,'..'),{recursive:true});
await writeFile(out,canonical(dataset)+'\n');
console.log(JSON.stringify({file:out,network,readOnly:dataset.readOnly,rows:writes.length,epochWrites:dataset.writes.length,posts:dataset.posts.length,likes:dataset.likes.length,reposts:dataset.reposts.length,follows:dataset.follows.length,dataHash:dataset.dataHash}));
