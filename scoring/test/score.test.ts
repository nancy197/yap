import {describe,it,expect} from 'vitest';
import {score} from '../src/score.js';
import {mockLabels} from '../src/mockLabels.js';
import {canonical,datasetHash} from '../src/canonical.js';
import {verify} from '../src/verify.js';
import type {EpochDataset,Labels} from '../src/types.js';
const S=1_000_000;
function dataset(authors:string[]=['writer.near']):EpochDataset {
  const posts=authors.map((author,i)=>({key:`${author}/${i+1}`,author,id:String(i+1),text:'A clear and useful explanation of how this protocol works in practice today',createdAt:'1000000000',editedAt:'1000000000',topics:['#near']}));
  const content={schema:'yap-epoch/1' as const,network:'testnet' as const,fromMs:1000,toMs:2000,epoch:7,readOnly:false,writes:[],posts,likes:[],reposts:[],follows:[],firstWrites:Object.fromEntries(authors.map(a=>[a,'1']))};
  return {...content,dataHash:datasetHash(content)};
}
function label(d:EpochDataset,q:0|1|2|3=2):Labels{return Object.fromEntries(d.posts.map(p=>[p.key,q]));}
function yap(d:EpochDataset,labels=label(d)){return score(d,labels,{}, {minFollowers:3,yapperAllocation:'1000',arenas:[{id:1,topic:'#near',minTier:1,amount:'100'}]});}
describe('deterministic scoring',()=>{
  it('scores an unengaged normal post and damps an unstaked account',()=>{
    const result=yap(dataset());
    expect(result.yappers[0]?.score).toBe(String(S/2));
    expect(result.attention).toBe(String(S/2));
    expect(result.yappers[0]?.amount).toBe('1000');
    expect(result.mindshare[0]?.share).toBe(String(S));
    expect(result.arenas['1']?.yappers[0]?.amount).toBe('100');
  });
  it('ignores self-likes',()=>{
    const d=dataset();d.likes=[{from:'writer.near',to:d.posts[0]!.key}];
    expect(yap(d).attention).toBe(yap(dataset()).attention);
  });
  it('ignores a flood of newly created bots',()=>{
    const d=dataset();
    for(let i=0;i<100;i++){const a=`bot${i}.near`;d.firstWrites[a]='1500000000';d.likes.push({from:a,to:d.posts[0]!.key});}
    expect(yap(d).attention).toBe(yap(dataset()).attention);
    expect(yap(d,label(d,0)).attention).toBe('0');
  });
  it('caps an aged like-ring to three actions per engager-author pair',()=>{
    const d=dataset(Array.from({length:10},(_,i)=>`writer.near`));
    // Replace duplicate posts with distinct IDs for the same author.
    d.posts=d.posts.map((p,i)=>({...p,key:`writer.near/${i+1}`,id:String(i+1)}));
    for(let i=0;i<5;i++)d.firstWrites[`ring${i}.near`]='1';
    d.follows=Array.from({length:5},(_,i)=>({from:`ring${i}.near`,to:'writer.near'}));
    const three=structuredClone(d),ten=structuredClone(d);
    for(let i=0;i<5;i++){
      for(let j=0;j<3;j++)three.likes.push({from:`ring${i}.near`,to:d.posts[j]!.key});
      for(let j=0;j<10;j++)ten.likes.push({from:`ring${i}.near`,to:d.posts[j]!.key});
    }
    expect(yap(ten).attention).toBe(yap(three).attention);
  });
  it('checks canonical hashes and verification fields',()=>{
    const d=dataset(),labels=label(d),result=yap(d);
    expect(canonical({z:1,a:{b:2,a:1}})).toBe('{"a":{"a":1,"b":2},"z":1}');
    const report={attention:result.attention,yappers_root:result.yappersRoot,labels_hash:'bad',data_hash:d.dataHash,arenas:[{arena_id:1,root:result.arenas['1']!.root}]};
    expect(verify(d,labels,{}, {minFollowers:3,yapperAllocation:'1000',arenas:[{id:1,topic:'#near',minTier:1,amount:'100'}]},report).checks.labelsHash).toBe(false);
  });
  it('marks only a meaningful post in the deterministic mock labeler',()=>{
    const d=dataset();d.posts.push({...d.posts[0]!,key:'writer.near/2',text:'hi'});
    const labels=mockLabels(d);
    expect(labels['writer.near/2']).toBe(0);
    expect(labels['writer.near/1']).toBeGreaterThanOrEqual(2);
  });
});
