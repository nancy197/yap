import type { EpochDataset, Post, Write } from '@yap/scoring';
import { datasetHash } from '@yap/scoring';
import type { Network } from './reader.js';
const cmp = (a:string,b:string):number => a<b?-1:a>b?1:0;
const accountRe = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
const postIdRe = /^[1-9]\d{0,15}$/;
function validAccount(value:string):boolean {return value.length>=2 && value.length<=64 && accountRe.test(value);}
function validId(value:string):boolean {return postIdRe.test(value) && BigInt(value)<=9_007_199_254_740_991n;}
function ref(value:unknown): value is string { if(typeof value!=='string') return false; const i=value.lastIndexOf('/'); return i>0 && validAccount(value.slice(0,i)) && validId(value.slice(i+1)); }
function object(value:unknown):value is Record<string,unknown> {return value!==null && typeof value==='object' && !Array.isArray(value);}
function chars(value:string):number {return [...value].length;}
function mediaUri(value:unknown):boolean {
  if(typeof value!=='string') return false;
  const match = /^fastfs:\/\/([^/]+)\/([^/]+)\/(.+)$/.exec(value);
  return !!match && validAccount(match[1]!) && validAccount(match[2]!) && /^[A-Za-z0-9._/-]{1,1024}$/.test(match[3]!) && !match[3]!.startsWith('/') && !match[3]!.includes('..');
}
function validMedia(value:unknown):boolean {
  if(!Array.isArray(value)||value.length>10) return false;
  return value.every(item=>object(item) && mediaUri(item.src) && ['image/webp','image/jpeg','image/png','image/gif','image/avif'].includes(String(item.mime)) &&
    ['w','h'].every(k=>item[k]===undefined || (Number.isInteger(item[k]) && Number(item[k])>=1 && Number(item[k])<=16384)) &&
    (item.alt===undefined || (typeof item.alt==='string' && chars(item.alt)<=5000)));
}
function validProfile(key:string,value:unknown):boolean {
  if(typeof value!=='string' || !value.length) return false;
  const limits:Record<string,number>={'profile/name':256,'profile/about':10000,'profile/avatar':2048,'profile/banner':2048,'profile/location':256};
  if(key in limits) return chars(value)<=limits[key]! && (!['profile/avatar','profile/banner'].includes(key) || mediaUri(value));
  const service=/^profile\/links\/([a-z0-9_]{1,32})$/.exec(key);
  return !!service && chars(value)<=2048;
}
interface ParsedPost {text:string;replyTo?:string;root?:string;quote?:string;}
function postValue(value:unknown,self:string):ParsedPost|null {
  if(!object(value)) return null;
  if(value.text!==undefined && (typeof value.text!=='string'||chars(value.text)>25000)) return null;
  if(value.media!==undefined && !validMedia(value.media)) return null;
  if(value.reply_to!==undefined && (!ref(value.reply_to)||value.reply_to===self)) return null;
  if(value.root!==undefined && !ref(value.root)) return null;
  if(value.quote!==undefined && !ref(value.quote)) return null;
  if(value.root!==undefined && value.reply_to===undefined) return null;
  const text = typeof value.text==='string' ? value.text : '';
  if (!text.trim() && (!Array.isArray(value.media)||value.media.length===0) && value.quote===undefined) return null;
  const out: ParsedPost = {text};
  if(typeof value.reply_to==='string') out.replyTo=value.reply_to;
  if(typeof value.root==='string') out.root=value.root;
  if(typeof value.quote==='string') out.quote=value.quote;
  return out;
}
function topics(text:string):string[] {
  // Remove URLs before token extraction, as specified by social-kv/1.
  const withoutUrls = text.replace(/https?:\/\/[^\s<>\"]+/g,' ');
  const result = new Set<string>();
  for(const match of withoutUrls.matchAll(/(?:^|[^A-Za-z0-9_@.])@([a-z0-9][a-z0-9._-]{0,63})/g)) {
    const account=match[1]!.replace(/[._-]+$/,''); if(validAccount(account)) result.add(`@${account}`);
  }
  for(const match of withoutUrls.matchAll(/(?:^|[^\p{L}\p{N}_&#/])#([\p{L}\p{N}_]{1,64})/gu)) {
    if(/\p{L}/u.test(match[1]!)) result.add(`#${match[1]!.toLowerCase()}`);
  }
  for(const match of withoutUrls.matchAll(/(?:^|[^A-Za-z0-9_$])\$([A-Za-z][A-Za-z0-9]{1,15})/g)) result.add(`$${match[1]!.toUpperCase()}`);
  return [...result].sort();
}
function order(a:Write,b:Write):number {
  if(a.blockHeight!==b.blockHeight) return a.blockHeight-b.blockHeight;
  const ta=BigInt(a.blockTimestamp),tb=BigInt(b.blockTimestamp);
  if(ta!==tb) return ta<tb?-1:1;
  if(a.predecessorId===b.predecessorId && a.key===b.key && a.sourceOrdinal!==undefined && b.sourceOrdinal!==undefined) return b.sourceOrdinal-a.sourceOrdinal;
  return cmp(a.receiptId,b.receiptId)||a.actionIndex-b.actionIndex||cmp(a.predecessorId,b.predecessorId)||cmp(a.key,b.key);
}
function classify(write:Write):'post'|'like'|'repost'|'follow'|'reply'|null {
  if(!validAccount(write.predecessorId)||/[^\x00-\x7F]/.test(write.key)) return null;
  if(write.key.startsWith('post/')&&validId(write.key.slice(5))) return 'post';
  const parts=write.key.split('/');
  if(parts.length===3 && (parts[0]==='like'||parts[0]==='repost') && validAccount(parts[1]!) && validId(parts[2]!)) return parts[0];
  if(parts.length===4 && parts[0]==='reply' && validAccount(parts[1]!) && validId(parts[2]!) && validId(parts[3]!)) return 'reply';
  if(parts.length===3 && parts[0]==='graph' && parts[1]==='follow' && validAccount(parts[2]!) && parts[2]!==write.predecessorId) return 'follow';
  return null;
}
export function makeDataset(network:Network,fromMs:number,toMs:number,all:Write[],epochOverride?:number):EpochDataset {
  if(!Number.isSafeInteger(fromMs)||!Number.isSafeInteger(toMs)||fromMs>=toMs) throw new Error('invalid epoch range');
  const start=BigInt(fromMs)*1_000_000n,end=BigInt(toMs)*1_000_000n;
  const ordered=all.filter(w=>BigInt(w.blockTimestamp)<end).sort(order);
  const firstWrites:Record<string,string>={};
  const firstPost=new Map<string,string>();
  const latest=new Map<string,Write>();
  const epochWrites:Write[]=[];
  for(const w of ordered) {
    const type=classify(w);
    // Valid profile writes establish an account's first activity too.
    const profile=validAccount(w.predecessorId) && validProfile(w.key,w.value);
    const valid=type==='post' ? !!postValue(w.value,`${w.predecessorId}/${w.key.slice(5)}`) : type ? object(w.value) : profile;
    if(valid && firstWrites[w.predecessorId]===undefined) firstWrites[w.predecessorId]=w.blockTimestamp;
    if(type==='post' && postValue(w.value,`${w.predecessorId}/${w.key.slice(5)}`) && !firstPost.has(`${w.predecessorId}/${w.key.slice(5)}`)) firstPost.set(`${w.predecessorId}/${w.key.slice(5)}`,w.blockTimestamp);
    if(type) latest.set(`${w.predecessorId}\0${w.key}`,w);
    if(BigInt(w.blockTimestamp)>=start) { const {sourceOrdinal: _ordinal, ...stored} = w; epochWrites.push(stored); }
  }
  const postStates=new Map<string,{post:ParsedPost;write:Write}>();
  for(const w of latest.values()) if(classify(w)==='post') {
    const key=`${w.predecessorId}/${w.key.slice(5)}`;
    const parsed=postValue(w.value,key);
    if(parsed) postStates.set(key,{post:parsed,write:w});
  }
  const validPost=new Map<string,Post>();
  const resolving=new Set<string>();
  function resolvePost(key:string):boolean {
    if(validPost.has(key)) return true;
    if(resolving.has(key)) return false;
    const state=postStates.get(key);
    if(!state) return false;
    resolving.add(key);
    const {post,write}=state;
    if(post.replyTo) {
      const parent=postStates.get(post.replyTo);
      if(!parent || !resolvePost(post.replyTo)) {resolving.delete(key);return false;}
      const expected=parent.post.root ?? parent.post.replyTo ?? post.replyTo;
      if(post.root!==undefined && post.root!==expected) {resolving.delete(key);return false;}
    }
    validPost.set(key,{key,author:write.predecessorId,id:write.key.slice(5),text:post.text,createdAt:firstPost.get(key)!,editedAt:write.blockTimestamp,
      ...(post.replyTo ? {replyTo:post.replyTo}:{}),...(post.quote ? {quote:post.quote}:{}),topics:topics(post.text)});
    resolving.delete(key);
    return true;
  }
  for(const key of postStates.keys()) resolvePost(key);
  const posts=[...validPost.values()].filter(p=>BigInt(p.createdAt)>=start&&BigInt(p.createdAt)<end).sort((a,b)=>cmp(a.key,b.key));
  const likes:EpochDataset['likes']=[],reposts:EpochDataset['reposts']=[],follows:EpochDataset['follows']=[];
  for(const w of latest.values()) {
    const type=classify(w);
    if(!object(w.value)) continue;
    if(type==='follow') follows.push({from:w.predecessorId,to:w.key.slice('graph/follow/'.length)});
    if(BigInt(w.blockTimestamp)<start) continue;
    if(type==='like'||type==='repost') (type==='like'?likes:reposts).push({from:w.predecessorId,to:w.key.slice(type.length+1)});
  }
  const edgeSort=(a:{from:string;to:string},b:{from:string;to:string})=>cmp(a.from,b.from)||cmp(a.to,b.to);
  likes.sort(edgeSort);reposts.sort(edgeSort);follows.sort(edgeSort);
  const epoch=epochOverride ?? Math.floor(fromMs/86_400_000);
  if(!Number.isInteger(epoch)||epoch<0||epoch>4_294_967_295) throw new Error('invalid epoch number');
  const content={schema:'yap-epoch/1' as const,network,fromMs,toMs,epoch,readOnly:network==='mainnet',writes:epochWrites,posts,likes,reposts,follows,firstWrites};
  return {...content,dataHash:datasetHash(content)};
}
