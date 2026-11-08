import {readFile, writeFile, mkdir, chmod} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {resolve} from 'node:path';
import {Account, JsonRpcProvider, KeyPair, type KeyPairString} from 'near-api-js';

export const ROOT = resolve(import.meta.dirname, '..');
export const HQ = 'yap-hq.testnet';
export const TOKEN_PREFIX = process.env.YAP_TOKEN_PREFIX ?? 'token2';
export const TOKEN = `${TOKEN_PREFIX}.${HQ}`; // v2: token.yap-hq.testnet (v1) is retired, see README
export const DAO = `dao.${HQ}`;
export const RPC = process.env.NEAR_RPC ?? 'https://test.rpc.fastnear.com';
export const provider = new JsonRpcProvider({url:RPC});
export const N = 10n**24n;
export const Y = 10n**18n;
export const near = (milli:number) => BigInt(milli)*N/1000n;
export const tgas = (n:number) => BigInt(n)*10n**12n;
export const explorer = (hash:string) => `https://testnet.nearblocks.io/txns/${hash}`;
export const keysPath = resolve(ROOT,'.keys.json');
const keys:Record<string,KeyPairString> = existsSync(keysPath) ? JSON.parse(await readFile(keysPath,'utf8')) : {};
export async function saveKeys() {await writeFile(keysPath,JSON.stringify(keys,null,2),{mode:0o600});await chmod(keysPath,0o600);}
export async function loadEnv() {
  if(!existsSync(resolve(ROOT,'.env'))) return;
  for(const line of (await readFile(resolve(ROOT,'.env'),'utf8')).split('\n')) {
    const m=line.match(/^([A-Z_][A-Z_0-9]*)=(.*)$/);
    if(m && !process.env[m[1]]) process.env[m[1]]=m[2]!.replace(/^['"]|['"]$/g,'');
  }
}
export async function signer(id:string):Promise<Account> {
  let key=keys[id];
  if(!key) {
    const file=resolve(homedir(),`.near-credentials/testnet/${id}.json`);
    if(!existsSync(file)) throw new Error(`missing testnet key for ${id}`);
    key=JSON.parse(await readFile(file,'utf8')).private_key as KeyPairString;
  }
  return new Account(id,provider,key);
}
export async function exists(id:string):Promise<boolean> {try {await provider.viewAccount({accountId:id,finality:'final'} as never);return true;}catch{return false;}}
export async function balance(id:string):Promise<string> {const a:any=await provider.viewAccount({accountId:id,finality:'final'} as never);return (Number(BigInt(a.amount)/10n**21n)/1000).toFixed(3);}
export async function view<T=any>(contractId:string,method:string,args:Record<string,unknown>={}):Promise<T> {return provider.callFunction({contractId,method,args} as never) as Promise<T>;}
export function txHash(result:any):string {return result?.transaction?.hash ?? result?.transaction_outcome?.id ?? ''}
export async function call(actor:Account,contractId:string,methodName:string,args:Record<string,unknown>,deposit=0n,gas=tgas(100)):Promise<string> {
  const result:any=await actor.callFunctionRaw({contractId,methodName,args,deposit,gas});
  const failure=result?.status?.Failure ?? result?.receipts_outcome?.find((r:any)=>r.outcome?.status?.Failure)?.outcome?.status?.Failure;
  if(failure) throw new Error(`${methodName} failed: ${JSON.stringify(failure).slice(0,800)} tx ${txHash(result)}`);
  return txHash(result);
}
export async function subAccount(prefix:string,millinear:number,parent=HQ):Promise<Account> {
  const id=`${prefix}.${parent}`;
  if(!(await exists(id))) {
    const key=KeyPair.fromRandom('ed25519'); keys[id]=key.toString() as KeyPairString;await saveKeys();
    const p=await signer(parent);
    const result:any=await p.createSubAccount({accountOrPrefix:prefix,publicKey:key.getPublicKey().toString(),nearToTransfer:near(millinear)});
    console.log(`create ${id} ${millinear/1000} NEAR ${explorer(txHash(result))}`);
    await recordTx('create_account',txHash(result),id);
  }
  return signer(id);
}
export async function recordTx(action:string,hash:string,account?:string):Promise<void> {
  const file=resolve(ROOT,'deploy','transactions.json');await mkdir(resolve(ROOT,'deploy'),{recursive:true});
  const rows=existsSync(file)?JSON.parse(await readFile(file,'utf8')) as object[]:[];
  if(!rows.some((r:any)=>r.hash===hash)) rows.push({at:new Date().toISOString(),action,account,hash,url:explorer(hash)});
  await writeFile(file,JSON.stringify(rows,null,2)+'\n');
  console.log(`${action}: ${explorer(hash)}`);
}
export async function savedKey(id:string,tag:string):Promise<KeyPair> {
  const name=`${id}#${tag}`;
  if(!keys[name]) {keys[name]=KeyPair.fromRandom('ed25519').toString() as KeyPairString;await saveKeys();}
  return KeyPair.fromString(keys[name]);
}
export async function functionSigner(id:string,tag:string):Promise<Account> {const key=await savedKey(id,tag);return new Account(id,provider,key.toString() as KeyPairString);}
export const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
