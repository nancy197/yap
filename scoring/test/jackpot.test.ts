import {describe,it,expect} from 'vitest';
import {score} from '../src/score.js';
import {blockContributions,jackpotShares} from '../src/jackpot.js';
import {datasetHash} from '../src/canonical.js';
import {verifyProof,yapperLeaf} from '../src/merkle.js';
import type {EpochDataset,Labels} from '../src/types.js';

function dataset(authors:string[]):EpochDataset {
  const posts=authors.map((author,i)=>({key:`${author}/${i+1}`,author,id:String(i+1),text:'A clear and useful explanation of how this protocol works in practice today',createdAt:'1000000000',editedAt:'1000000000',topics:['#near']}));
  const content={schema:'yap-epoch/1' as const,network:'testnet' as const,fromMs:1000,toMs:2000,epoch:9,readOnly:false,writes:[],posts,likes:[],reposts:[],follows:[],firstWrites:Object.fromEntries(authors.map(a=>[a,'1']))};
  return {...content,dataHash:datasetHash(content)};
}
const label=(d:EpochDataset):Labels=>Object.fromEntries(d.posts.map(p=>[p.key,2]));

describe('proof of yap jackpot',()=>{
  it('sums contributions over the block and splits the payout exactly',()=>{
    const c=blockContributions([{a:'300',b:'100'},{a:'100',c:'0'},{b:'500'}]);
    expect(Object.fromEntries(c)).toEqual({a:400n,b:600n});
    const s=jackpotShares(c,1001n);
    expect(s.get('a')!+s.get('b')!).toBe(1001n);
    expect(s.get('a')).toBe(401n); // 400.4 rounded down, then +1 remainder in account order
    expect(s.get('b')).toBe(600n);
  });
  it('gives earlier contributors a claimable leaf even if they were silent in the final tick',()=>{
    const d=dataset(['writer.near']);
    const r=score(d,label(d),{},{yapperAllocation:'1000',jackpot:{block:3,payout:'5000',earlier:[{'early.near':'500000'}]}});
    const writer=r.yappers.find(y=>y.account==='writer.near')!;
    const early=r.yappers.find(y=>y.account==='early.near')!;
    // writer scored 500000 this tick (unstaked, no smart followers => halved), early 500000 earlier: an even split.
    expect(early.jackpot).toBe('2500');
    expect(writer.jackpot).toBe('2500');
    expect(writer.amount).toBe('3500');
    expect(early.amount).toBe('2500');
    expect(early.score).toBe('0');
    expect(r.jackpot).toEqual({block:3,payout:'5000',contributions:{'early.near':'500000','writer.near':'500000'},shares:{'early.near':'2500','writer.near':'2500'}});
    expect(r.yappers.reduce((n,y)=>n+BigInt(y.amount),0n)).toBe(6000n);
    const leaf=yapperLeaf(9,'early.near',2500n,0n,0);
    expect(verifyProof(leaf,early.proof,r.yappersRoot)).toBe(true);
  });
  it('leaves scoring unchanged when no block completes',()=>{
    const d=dataset(['writer.near']);
    const plain=score(d,label(d),{},{yapperAllocation:'1000'});
    expect(plain.jackpot).toBeUndefined();
    expect(plain.yappers[0]?.amount).toBe('1000');
  });
});
