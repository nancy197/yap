import { S, div, ln, log10, mul, prorata, sqrt, stakeFixed } from './fixed.js';
import { arenaLeaf, merkle, yapperLeaf } from './merkle.js';
import type { EpochDataset, Labels, ScoreParams, ScoreResult, Stakes } from './types.js';

const cmp = (a:string,b:string):number => a<b?-1:a>b?1:0;
function assertParams(p: ScoreParams): Required<Pick<ScoreParams,'smartPct'|'minFollowers'|'maxPosts'|'yapperAllocation'|'arenas'|'trailingScores'>> {
  const result = {smartPct:p.smartPct ?? 20, minFollowers:p.minFollowers ?? 3, maxPosts:p.maxPosts ?? 10,
    yapperAllocation:p.yapperAllocation ?? '0', arenas:p.arenas ?? [], trailingScores:p.trailingScores ?? {}};
  if (!Number.isInteger(result.smartPct) || result.smartPct < 0 || result.smartPct > 100 || !Number.isInteger(result.minFollowers) || result.minFollowers < 0 || !Number.isInteger(result.maxPosts) || result.maxPosts < 1 || BigInt(result.yapperAllocation) < 0n) throw new Error('invalid scoring params');
  return result;
}
function apportion(total: bigint, weights: bigint[]): bigint[] {
  const denom = weights.reduce((a,b) => a+b,0n);
  if (denom === 0n) return weights.map(() => 0n);
  const out = weights.map(x => x*total/denom);
  let remainder = total-out.reduce((a,b)=>a+b,0n);
  for (let i=0; remainder>0n; i++,remainder--) out[i % out.length]!++;
  return out;
}
function pageRank(accounts: string[], follows: {from:string;to:string}[], stakes: Stakes): Map<string,bigint> {
  const edges = new Map(accounts.map(a => [a, [] as string[]]));
  for (const {from,to} of follows) if (from !== to && edges.has(from) && edges.has(to)) edges.get(from)!.push(to);
  for (const list of edges.values()) list.sort();
  const teleportWeights = accounts.map(a => S + sqrt(stakeFixed(stakes[a] ?? '0') * S));
  const MASS = 1_000_000_000_000n;
  const teleport = apportion(MASS,teleportWeights);
  let ranks = [...teleport];
  const index = new Map(accounts.map((a,i)=>[a,i]));
  for (let iteration=0; iteration<40; iteration++) {
    let next = apportion(MASS*15n/100n,teleportWeights);
    for (let i=0; i<accounts.length; i++) {
      const targets = edges.get(accounts[i]!)!;
      const contribution = ranks[i]! * 85n / 100n;
      if (!targets.length) continue;
      const each = contribution / BigInt(targets.length);
      let rest = contribution - each*BigInt(targets.length);
      for (const target of targets) next[index.get(target)!]! += each + (rest-- > 0n ? 1n : 0n);
    }
    const spill = apportion(MASS-next.reduce((a,b)=>a+b,0n),teleportWeights);
    next = next.map((x,i)=>x+spill[i]!);
    ranks = next;
  }
  return new Map(accounts.map((a,i)=>[a,ranks[i]!]));
}
function tierMap(scores: Map<string,bigint>, trailing: Record<string,string[]>): Map<string,number> {
  const totals = [...scores].map(([account,current]) => ({account,total: current + (trailing[account] ?? []).slice(-29).reduce((n,x)=>n+BigInt(x),0n)}))
    .filter(x=>x.total>0n).sort((a,b)=>a.total===b.total?cmp(a.account,b.account):a.total>b.total?-1:1);
  const n = totals.length;
  const out = new Map<string,number>();
  for (let i=0; i<n; i++) out.set(totals[i]!.account, i < Math.floor((n+99)/100) ? 4 : i < Math.floor((n*10+99)/100) ? 3 : i < Math.floor((n*30+99)/100) ? 2 : 1);
  return out;
}
export function score(dataset: EpochDataset, labels: Labels, stakes: Stakes = {}, params: ScoreParams = {}): ScoreResult {
  const p = assertParams(params);
  const accounts = [...new Set([
    ...Object.keys(dataset.firstWrites),...Object.keys(stakes),
    ...dataset.posts.map(x=>x.author),...dataset.follows.flatMap(x=>[x.from,x.to]),
    ...dataset.likes.map(x=>x.from),...dataset.reposts.map(x=>x.from)
  ])].sort();
  const rank = pageRank(accounts,dataset.follows,stakes);
  const maxRank = [...rank.values()].reduce((a,b)=>a>b?a:b,0n);
  const rankNorm = new Map(accounts.map(a=>[a,maxRank ? div(rank.get(a)!,maxRank) : 0n]));
  const followerSets = new Map(accounts.map(a=>[a,new Set<string>()]));
  for (const edge of dataset.follows) if (edge.from!==edge.to) followerSets.get(edge.to)?.add(edge.from);
  const candidates = accounts.filter(a=>(followerSets.get(a)?.size ?? 0)>=p.minFollowers)
    .sort((a,b)=>rank.get(a)===rank.get(b)?cmp(a,b):rank.get(a)!>rank.get(b)!?-1:1);
  const smart = new Set(candidates.slice(0,Math.floor((candidates.length*p.smartPct+99)/100)));
  const smartFollowers = new Map(accounts.map(a=>[a,[...(followerSets.get(a) ?? [])].filter(f=>smart.has(f)).length]));
  const postMap = new Map(dataset.posts.map(x=>[x.key,x]));
  for (const post of dataset.posts) if (labels[post.key] === undefined || ![0,1,2,3].includes(labels[post.key]!)) throw new Error(`missing/invalid label ${post.key}`);
  type Action = {from:string; target:string; kind:string; ownQ:number};
  const actions: Action[] = [
    ...dataset.likes.map(e=>({from:e.from,target:e.to,kind:'like',ownQ:0})),
    ...dataset.reposts.map(e=>({from:e.from,target:e.to,kind:'repost',ownQ:0})),
    ...dataset.posts.flatMap(post=>[
      ...(post.replyTo ? [{from:post.author,target:post.replyTo,kind:'reply',ownQ:labels[post.key]!}] : []),
      ...(post.quote ? [{from:post.author,target:post.quote,kind:'quote',ownQ:labels[post.key]!}] : [])
    ])
  ].sort((a,b)=>cmp(a.from,b.from)||cmp(a.target,b.target)||cmp(a.kind,b.kind));
  const engagement = new Map(dataset.posts.map(x=>[x.key,0n]));
  const pairCounts = new Map<string,number>();
  for (const action of actions) {
    const target = postMap.get(action.target);
    if (!target || target.author===action.from || ((action.kind==='reply'||action.kind==='quote') && action.ownQ<2)) continue;
    const first = dataset.firstWrites[action.from];
    if (first && BigInt(first)>=BigInt(dataset.fromMs)*1_000_000n && BigInt(first)<BigInt(dataset.toMs)*1_000_000n) continue;
    const pair = `${action.from}\0${target.author}`;
    const count = pairCounts.get(pair) ?? 0;
    if (count>=3) continue;
    pairCounts.set(pair,count+1);
    const base = rankNorm.get(action.from) ?? 0n;
    const smartFactor = smart.has(action.from) ? 1_500_000n : S;
    const stakeFactor = S + log10(S + stakeFixed(stakes[action.from] ?? '0'));
    const typeFactor = action.kind==='like' ? 1n : action.kind==='repost' ? 2n : action.kind==='reply' ? 3n : 4n;
    engagement.set(target.key,engagement.get(target.key)!+mul(mul(base,smartFactor),stakeFactor)*typeFactor);
  }
  const qWeight = [0n,250_000n,S,2n*S];
  const postScores = new Map(dataset.posts.map(post=>{
    const q = labels[post.key]!;
    return [post.key,mul(qWeight[q]!, S+ln(S+(engagement.get(post.key) ?? 0n)))] as const;
  }));
  const byAuthor = new Map(accounts.map(a=>[a,[] as {key:string;score:bigint;q:number}[]]));
  for (const post of dataset.posts) byAuthor.get(post.author)?.push({key:post.key,score:postScores.get(post.key)!,q:labels[post.key]!});
  const selected = new Map<string,{key:string;score:bigint;q:number}[]>();
  const yapScores = new Map<string,bigint>();
  for (const account of accounts) {
    const posts = byAuthor.get(account)!.sort((a,b)=>a.score===b.score?cmp(a.key,b.key):a.score>b.score?-1:1).slice(0,p.maxPosts);
    selected.set(account,posts);
    let total = posts.reduce((n,x)=>n+x.score,0n);
    if ((smartFollowers.get(account) ?? 0)===0 && BigInt(stakes[account] ?? '0')===0n) total /= 2n;
    yapScores.set(account,total);
  }
  const tiers = tierMap(yapScores,p.trailingScores);
  const eligible = accounts.filter(a=>(yapScores.get(a) ?? 0n)>0n).sort();
  const amounts = prorata(eligible.map(key=>({key,score:yapScores.get(key)!})),BigInt(p.yapperAllocation));
  const leaves = eligible.map(a=>yapperLeaf(dataset.epoch,a,amounts.get(a) ?? 0n,yapScores.get(a)!,tiers.get(a) ?? 0));
  const tree = merkle(leaves);
  const yappers = eligible.map((account,i)=>({account,score:yapScores.get(account)!.toString(),amount:(amounts.get(account) ?? 0n).toString(),tier:tiers.get(account) ?? 0,
    smartFollowers:smartFollowers.get(account) ?? 0,rankNorm:(rankNorm.get(account) ?? 0n).toString(),
    posts:selected.get(account)!.map(x=>({key:x.key,score:x.score.toString(),q:x.q})),proof:tree.proofs[i]!}))
    .sort((a,b)=>BigInt(a.score)===BigInt(b.score)?cmp(a.account,b.account):BigInt(a.score)>BigInt(b.score)?-1:1);
  const attention = [...yapScores.values()].reduce((a,b)=>a+b,0n).toString();
  const topicScores = new Map<string,bigint>();
  for (const post of dataset.posts) for (const topic of post.topics) topicScores.set(topic,(topicScores.get(topic) ?? 0n)+postScores.get(post.key)!);
  const totalPostScore = [...postScores.values()].reduce((a,b)=>a+b,0n);
  const mindshare = [...topicScores].map(([topic,value])=>({topic,score:value.toString(),share:totalPostScore ? div(value,totalPostScore).toString() : '0'}))
    .sort((a,b)=>BigInt(a.score)===BigInt(b.score)?cmp(a.topic,b.topic):BigInt(a.score)>BigInt(b.score)?-1:1);
  const arenas: ScoreResult['arenas'] = {};
  for (const arena of p.arenas) {
    if (arena.id<0 || !Number.isInteger(arena.id) || BigInt(arena.amount)<0n) throw new Error('invalid arena');
    const arenaScores = new Map<string,bigint>();
    for (const account of accounts) {
      const relevant = (byAuthor.get(account) ?? []).filter(x=>postMap.get(x.key)?.topics.includes(arena.topic))
        .sort((a,b)=>a.score===b.score?cmp(a.key,b.key):a.score>b.score?-1:1).slice(0,p.maxPosts);
      let value = relevant.reduce((n,x)=>n+x.score,0n);
      if ((smartFollowers.get(account) ?? 0)===0 && BigInt(stakes[account] ?? '0')===0n) value/=2n;
      arenaScores.set(account,value);
    }
    const members = [...arenaScores].filter(([account,value])=>value>0n && (tiers.get(account) ?? 0)>=arena.minTier).sort(([a],[b])=>cmp(a,b));
    const payouts = prorata(members.map(([key,value])=>({key,score:value})),BigInt(arena.amount));
    const arenaTree = merkle(members.map(([account])=>arenaLeaf(arena.id,dataset.epoch,account,payouts.get(account) ?? 0n)));
    arenas[String(arena.id)] = {id:arena.id,topic:arena.topic,root:arenaTree.root,yappers:members.map(([account,value],i)=>({account,score:value.toString(),amount:(payouts.get(account) ?? 0n).toString(),proof:arenaTree.proofs[i]!}))};
  }
  return {attention,yappersRoot:tree.root,yappers,arenas,mindshare,smartAccounts:[...smart].sort()};
}
