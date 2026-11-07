import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { resolve,dirname } from 'node:path';
import { canonical,datasetHash,sha256Hex } from './canonical.js';
import { mockLabels } from './mockLabels.js';
import { score } from './score.js';
import type { EpochDataset,Labels,ScoreParams,Stakes } from './types.js';
const argv=process.argv.slice(2);
function arg(name:string):string|undefined {const i=argv.indexOf(`--${name}`);return i<0?undefined:argv[i+1];}
async function json<T>(path:string):Promise<T> {return JSON.parse(await readFile(resolve(path),'utf8')) as T;}
const datasetFile=arg('dataset')??'../data/mainnet-sample/dataset.json';
const dataset=await json<EpochDataset>(datasetFile);
if(datasetHash(dataset)!==dataset.dataHash) throw new Error('dataset hash mismatch');
const labelsFile=arg('labels');
const labels=labelsFile?await json<Labels>(labelsFile):mockLabels(dataset);
const stakesFile=arg('stakes');
const stakes=stakesFile?await json<Stakes>(stakesFile):{};
const paramsFile=arg('params');
const params=paramsFile?await json<ScoreParams>(paramsFile):{yapperAllocation:arg('allocation')??'0'};
const result=score(dataset,labels,stakes,params);
const output={network:dataset.network,networkLabel:dataset.network==='mainnet'?'mainnet (read-only, unrewarded)':'testnet',readOnly:dataset.readOnly,simulatedLabels:!labelsFile,fromMs:dataset.fromMs,toMs:dataset.toMs,
  dataHash:dataset.dataHash,labelsHash:sha256Hex(canonical(labels)),attention:result.attention,yappersRoot:result.yappersRoot,
  top20:result.yappers.slice(0,20).map(({account,score,tier,smartFollowers})=>({account,score,tier,smartFollowers})),topTopics:result.mindshare.slice(0,20),result};
const out=arg('out');
if(out){await mkdir(dirname(resolve(out)),{recursive:true});await writeFile(resolve(out),canonical(output)+'\n');}
const labelsOut=arg('labels-out');
if(labelsOut){await mkdir(dirname(resolve(labelsOut)),{recursive:true});await writeFile(resolve(labelsOut),canonical(labels)+'\n');}
console.log(JSON.stringify({...output,result:undefined},null,2));
