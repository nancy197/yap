import { canonical, datasetHash, sha256Hex } from './canonical.js';
import { score } from './score.js';
import type { EpochDataset, Labels, ScoreParams, Stakes } from './types.js';

export interface EpochReport {
  attention: string;
  yappers_root: string;
  labels_hash: string;
  data_hash: string;
  arenas: {arena_id:number;root:string}[] | Record<string,string>;
}
export interface Verification { match:boolean; checks:Record<string,boolean>; computed:{attention:string;yappersRoot:string;labelsHash:string;dataHash:string;arenaRoots:Record<string,string>}; }
export function verify(dataset:EpochDataset,labels:Labels,stakes:Stakes,params:ScoreParams,report:EpochReport):Verification {
  const result=score(dataset,labels,stakes,params);
  const hashes={attention:result.attention,yappersRoot:result.yappersRoot,labelsHash:sha256Hex(canonical(labels)),dataHash:datasetHash(dataset),
    arenaRoots:Object.fromEntries(Object.entries(result.arenas).map(([id,value])=>[id,value.root]))};
  const chainArenas=Array.isArray(report.arenas)?Object.fromEntries(report.arenas.map(x=>[String(x.arena_id),x.root])):report.arenas;
  const checks:Record<string,boolean>={datasetFile:dataset.dataHash===hashes.dataHash,dataHash:report.data_hash===hashes.dataHash,
    labelsHash:report.labels_hash===hashes.labelsHash,attention:report.attention===hashes.attention,yappersRoot:report.yappers_root===hashes.yappersRoot};
  for(const [id,root] of Object.entries(hashes.arenaRoots)) checks[`arena:${id}`]=chainArenas[id]===root;
  for(const id of Object.keys(chainArenas)) if(!(id in hashes.arenaRoots)) checks[`unexpectedArena:${id}`]=false;
  return {match:Object.values(checks).every(Boolean),checks,computed:hashes};
}
export async function verifyUri(uri:string,report:EpochReport,fetcher:typeof fetch=fetch):Promise<Verification> {
  const base=uri.replace(/\/$/,'');
  async function json<T>(name:string):Promise<T> {const response=await fetcher(`${base}/${name}`);if(!response.ok) throw new Error(`${name}: HTTP ${response.status}`);return response.json() as Promise<T>;}
  const [dataset,labels,stakes,params]=await Promise.all([json<EpochDataset>('dataset.json'),json<Labels>('labels.json'),json<Stakes>('stakes.json'),json<ScoreParams>('params.json')]);
  return verify(dataset,labels,stakes,params,report);
}
export async function fetchOnChainReport(rpcUrl:string,contract:string,epoch:number,fetcher:typeof fetch=fetch):Promise<EpochReport> {
  const args=JSON.stringify({e:epoch});
  const base64=btoa(String.fromCharCode(...new TextEncoder().encode(args)));
  const response=await fetcher(rpcUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'yap-verify',method:'query',params:{request_type:'call_function',finality:'final',account_id:contract,method_name:'get_epoch',args_base64:base64}})});
  if(!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const payload=await response.json() as {result?:{result?:number[]};error?:unknown};
  if(payload.error||!payload.result?.result) throw new Error(`RPC query failed: ${JSON.stringify(payload.error)}`);
  const value=JSON.parse(new TextDecoder().decode(Uint8Array.from(payload.result.result))) as {report?:EpochReport}|EpochReport;
  return ('report' in value ? value.report : value) as EpochReport;
}
export async function verifyOnChain(uri:string,rpcUrl:string,contract:string,epoch:number,fetcher:typeof fetch=fetch):Promise<Verification> {
  return verifyUri(uri,await fetchOnChainReport(rpcUrl,contract,epoch,fetcher),fetcher);
}
