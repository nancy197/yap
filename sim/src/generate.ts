import {makeDataset} from '@yap/indexer';
import type {EpochDataset,Labels,Stakes,Write} from '@yap/scoring';
import {ONE_YAP} from '../params.js';

export type Scenario = 'steady'|'hype-then-fade'|'dead-meme'|'spam-farm'|'like-ring'|'whale-staker';
export const SIM_SEED=20261107;
export const scenarios:Scenario[]=['steady','hype-then-fade','dead-meme','spam-farm','like-ring','whale-staker'];
export interface Persona {account:string;kind:'organic'|'spam'|'ring'|'whale';quality:number;claimRate:number;stake:bigint}
export interface Generated {dataset:EpochDataset;labels:Labels;stakes:Stakes;attackers:Set<string>;personas:Persona[]}
const START=1_800_000_000_000, EPOCH_MS=600_000;
function hash(seed:number):()=>number {let x=seed>>>0;return ()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/2**32;};}
const seedNumber:Record<Scenario,number>={'steady':1101,'hype-then-fade':2202,'dead-meme':3303,'spam-farm':4404,'like-ring':5505,'whale-staker':6606};
export class SocialWorld {
  readonly personas:Persona[];readonly attackers:Set<string>;
  private readonly random:()=>number;
  private readonly history:Write[]=[];
  private readonly labels:Labels={};
  private ordinal=0;
  readonly scenario:Scenario;
  constructor(scenario:Scenario) {
    this.scenario=scenario;this.random=hash(SIM_SEED^seedNumber[scenario]);
    this.personas=Array.from({length:40},(_,i)=>({account:`person${String(i).padStart(2,'0')}.testnet`,kind:'organic' as const,
      quality:i%10===0?3:i%7===0?1:2,claimRate:i%9===0?0.65:0.92,stake:BigInt(i%4===0?100:0)*ONE_YAP}));
    if(scenario==='spam-farm') for(let i=0;i<100;i++) this.personas.push({account:`spam${String(i).padStart(3,'0')}.testnet`,kind:'spam',quality:0,claimRate:0.35,stake:0n});
    if(scenario==='like-ring') for(let i=0;i<10;i++) this.personas.push({account:`ring${String(i).padStart(2,'0')}.testnet`,kind:'ring',quality:2,claimRate:0.85,stake:0n});
    if(scenario==='whale-staker') this.personas.push({account:'whale.testnet',kind:'whale',quality:2,claimRate:0.99,stake:10_000n*ONE_YAP});
    this.attackers=new Set(this.personas.filter(p=>p.kind==='spam'||p.kind==='ring').map(p=>p.account));
    const aged=START-EPOCH_MS;
    for(const p of this.personas) this.write(p.account,'profile/name',p.account,aged);
    const organic=this.personas.filter(p=>p.kind==='organic');
    for(let i=0;i<organic.length;i++) for(let j=1;j<=4;j++) this.write(organic[i]!.account,`graph/follow/${organic[(i+j*3)%organic.length]!.account}`,{},aged);
    const attackers=this.personas.filter(p=>p.kind==='ring'||p.kind==='spam');
    for(let i=0;i<attackers.length;i++) for(let j=1;j<=4;j++) this.write(attackers[i]!.account,`graph/follow/${attackers[(i+j)%attackers.length]!.account}`,{},aged);
    for(const p of this.personas.filter(p=>p.kind==='whale')) for(let j=0;j<8;j++) this.write(p.account,`graph/follow/${organic[j]!.account}`,{},aged);
  }
  private write(account:string,key:string,value:unknown,ms:number):void {
    this.history.push({predecessorId:account,key,value,blockHeight:++this.ordinal,blockTimestamp:(BigInt(ms)*1_000_000n).toString(),receiptId:`sim-${this.ordinal}`,actionIndex:0});
  }
  private label(p:Persona):0|1|2|3 {
    const r=this.random();
    if(p.kind==='spam') return r<0.10?2:r<0.25?1:0;
    if(r<0.08) return Math.max(1,p.quality-1) as 1|2;
    if(r>0.94) return Math.min(3,p.quality+1) as 2|3;
    return p.quality as 1|2|3;
  }
  epoch(epoch:number):Generated {
    const from=START+epoch*EPOCH_MS,to=from+EPOCH_MS;
    const active=this.scenario!=='dead-meme'||epoch<20;
    const hype=this.scenario==='hype-then-fade'?(epoch<20?1:epoch<30?2.2:epoch<40?1:0.18):1;
    const posts:{author:string;id:string;key:string}[]=[];
    if(active) for(let i=0;i<this.personas.length;i++) {
      const p=this.personas[i]!;
      const count=p.kind==='spam'?12:p.kind==='ring'?12:p.kind==='whale'?2:
        hype<1?(this.random()<hype?1:0):Math.floor(hype*(1+this.random()*2));
      for(let j=0;j<count;j++) {
        const id=String(1+epoch*100_000+i*100+j),key=`${p.account}/${id}`;
        const text=p.kind==='spam'?'Big gains soon buy now #yap':p.kind==='ring'?'A thoughtful take on the social graph and the community #yap':
          `A community observation ${epoch} ${i} ${j} about builders sharing useful ideas #yap`;
        this.write(p.account,`post/${id}`,{text},from+1_000+j);
        this.labels[key]=this.label(p);posts.push({author:p.account,id,key});
      }
    }
    const organicPosts=posts.filter(p=>!this.attackers.has(p.author)&&p.author!=='whale.testnet');
    const attackerPosts=posts.filter(p=>this.attackers.has(p.author));
    if(active) for(const p of this.personas) {
      const targets=p.kind==='ring'?attackerPosts.filter(x=>{
        const own=Number(p.account.slice(4,6)),other=Number(x.author.slice(4,6));
        return other===(own+1)%10||other===(own+2)%10;
      }):p.kind==='spam'?attackerPosts.filter(x=>Number(x.author.slice(4,7))<20):organicPosts;
      if(targets.length===0) continue;
      const count=p.kind==='spam'?12:p.kind==='ring'?20:p.kind==='whale'?7:Math.floor(3*hype+this.random()*4);
      for(let k=0;k<count;k++) {
        const target=targets[Math.floor(this.random()*targets.length)]!;
        if(target.author===p.account) continue;
        this.write(p.account,`like/${target.key}`,{},from+50_000+k);
        if(k%5===0) this.write(p.account,`repost/${target.key}`,{},from+51_000+k);
        if(k%9===0 && p.kind!=='spam') {
          const id=String(1+epoch*100_000+this.personas.indexOf(p)*100+30+k);
          const key=`${p.account}/${id}`;
          this.write(p.account,`post/${id}`,{text:'A useful reply to this idea #yap',reply_to:target.key},from+52_000+k);
          this.labels[key]=this.label(p);
        }
        if(k%11===0 && p.kind==='organic') {
          const id=String(1+epoch*100_000+this.personas.indexOf(p)*100+60+k);
          const key=`${p.account}/${id}`;
          this.write(p.account,`post/${id}`,{text:'Adding context and a quote #yap',quote:target.key},from+53_000+k);
          this.labels[key]=this.label(p);
        }
      }
    }
    const dataset=makeDataset('testnet',from,to,this.history,epoch);
    const labels:Labels=Object.fromEntries(dataset.posts.map(p=>[p.key,this.labels[p.key] ?? 0]));
    const stakes:Stakes=Object.fromEntries(this.personas.filter(p=>p.stake>0n).map(p=>[p.account,p.stake.toString()]));
    return {dataset,labels,stakes,attackers:this.attackers,personas:this.personas};
  }
}
