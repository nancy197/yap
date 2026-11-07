import {score} from '@yap/scoring';
import type {ScoreResult} from '@yap/scoring';
import type {Generated} from './generate.js';

export interface Defences {pageRank:boolean;aiLabels:boolean;caps:boolean;stakeWeighting:boolean}
export const variants:Record<string,Defences>={
  none:{pageRank:false,aiLabels:false,caps:false,stakeWeighting:false},
  pageRank:{pageRank:true,aiLabels:false,caps:false,stakeWeighting:false},
  aiLabels:{pageRank:false,aiLabels:true,caps:false,stakeWeighting:false},
  caps:{pageRank:false,aiLabels:false,caps:true,stakeWeighting:false},
  stakeWeighting:{pageRank:false,aiLabels:false,caps:false,stakeWeighting:true},
  all:{pageRank:true,aiLabels:true,caps:true,stakeWeighting:true}
};
interface Action {from:string;target:string;kind:'like'|'repost'|'reply'|'quote';q:number}
// Counterfactuals deliberately live in sim only. The "all" row always comes from @yap/scoring.
export function attackerShares(g:Generated,real:ScoreResult):Record<string,number|null> {
  if(g.attackers.size===0) return Object.fromEntries(Object.keys(variants).map(k=>[k,null]));
  // Probe q=2 so even real-world q=0 accounts expose their PageRank in counterfactuals.
  const probeLabels=Object.fromEntries(g.dataset.posts.map(p=>[p.key,2])) as Record<string,2>;
  const noStake=score(g.dataset,probeLabels,{},{});
  const output:Record<string,number|null>={};
  for(const [name,d] of Object.entries(variants)) {
    if(name==='all') {
      const total=BigInt(real.attention);
      const attack=real.yappers.filter(y=>g.attackers.has(y.account)).reduce((n,y)=>n+BigInt(y.score),0n);
      output[name]=total===0n?0:Number(attack*1_000_000n/total)/1_000_000;
      continue;
    }
    const ranks=d.stakeWeighting?real:noStake;
    const rankMap=new Map(ranks.yappers.map(y=>[y.account,Number(y.rankNorm)/1_000_000]));
    const smartFollowers=new Map(ranks.yappers.map(y=>[y.account,y.smartFollowers]));
    const smart=new Set(ranks.smartAccounts);
    const posts=new Map(g.dataset.posts.map(p=>[p.key,p]));
    const label=(key:string):number=>!d.aiLabels&&g.attackers.has(posts.get(key)?.author ?? '')?2:g.labels[key] ?? 0;
    const actions:Action[]=[
      ...g.dataset.likes.map(x=>({...x,kind:'like' as const,target:x.to,q:0})),
      ...g.dataset.reposts.map(x=>({...x,kind:'repost' as const,target:x.to,q:0})),
      ...g.dataset.posts.flatMap(p=>[
        ...(p.replyTo?[{from:p.author,target:p.replyTo,kind:'reply' as const,q:label(p.key)}]:[]),
        ...(p.quote?[{from:p.author,target:p.quote,kind:'quote' as const,q:label(p.key)}]:[])
      ])
    ].map(x=>({from:x.from,target:x.target,kind:x.kind,q:x.q}))
      .sort((a,b)=>a.from.localeCompare(b.from)||a.target.localeCompare(b.target)||a.kind.localeCompare(b.kind));
    const engagement=new Map(g.dataset.posts.map(p=>[p.key,0]));
    const pairs=new Map<string,number>();
    for(const a of actions) {
      const target=posts.get(a.target);
      if(!target||target.author===a.from||((a.kind==='reply'||a.kind==='quote')&&a.q<2)) continue;
      const first=g.dataset.firstWrites[a.from];
      if(first&&BigInt(first)>=BigInt(g.dataset.fromMs)*1_000_000n&&BigInt(first)<BigInt(g.dataset.toMs)*1_000_000n) continue;
      const pair=`${a.from}\0${target.author}`;
      const count=pairs.get(pair)??0;
      if(d.caps&&count>=3) continue;
      pairs.set(pair,count+1);
      const rank=d.pageRank?(rankMap.get(a.from)??0):1;
      const smartFactor=d.pageRank&&smart.has(a.from)?1.5:1;
      const stake=Number(BigInt(g.stakes[a.from]??'0'))/1e18;
      const stakeFactor=d.stakeWeighting?1+Math.log10(1+stake):1;
      const typeFactor=a.kind==='like'?1:a.kind==='repost'?2:a.kind==='reply'?3:4;
      engagement.set(target.key,(engagement.get(target.key)??0)+rank*smartFactor*stakeFactor*typeFactor);
    }
    const byAuthor=new Map<string,number[]>();
    const quality=[0,0.25,1,2];
    for(const p of g.dataset.posts) {
      const value=quality[label(p.key)]!*(1+Math.log1p(engagement.get(p.key)??0));
      const arr=byAuthor.get(p.author)??[];arr.push(value);byAuthor.set(p.author,arr);
    }
    let total=0,attack=0;
    for(const [account,values] of byAuthor) {
      values.sort((a,b)=>b-a);
      let value=values.slice(0,d.caps?10:undefined).reduce((a,b)=>a+b,0);
      if(d.pageRank&&(smartFollowers.get(account)??0)===0&&(!d.stakeWeighting||BigInt(g.stakes[account]??'0')===0n)) value*=0.5;
      total+=value;if(g.attackers.has(account)) attack+=value;
    }
    output[name]=total===0?0:Math.round(attack/total*1_000_000)/1_000_000;
  }
  return output;
}
