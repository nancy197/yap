import { readFileSync,existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe,it,expect } from 'vitest';
import { arenaLeaf,merkle,nodeHash,verifyProof,yapperLeaf } from '../src/merkle.js';
interface Vector {epoch:number;account:string;amount:string;score?:string;tier?:number;arenaId?:number;leaf:string;proof:string[];}
interface Vectors {yappers:Vector[];arenas:Vector[];yappersRoot:string;arenaRoot:string;node:{a:string;b:string;hash:string};emptyRoot:string;}
const vectors=JSON.parse(readFileSync(resolve('test-vectors.json'),'utf8')) as Vectors;
describe('domain-separated Borsh Merkle vectors',()=>{
  it('matches independently generated leaves, nodes, roots and proofs',()=>{
    for(const v of vectors.yappers) expect(yapperLeaf(v.epoch,v.account,v.amount,v.score!,v.tier!)).toBe(v.leaf);
    for(const v of vectors.arenas) expect(arenaLeaf(v.arenaId!,v.epoch,v.account,v.amount)).toBe(v.leaf);
    expect(nodeHash(vectors.node.a,vectors.node.b)).toBe(vectors.node.hash);
    expect(nodeHash(vectors.node.b,vectors.node.a)).toBe(vectors.node.hash);
    for(const [items,root] of [[vectors.yappers,vectors.yappersRoot],[vectors.arenas,vectors.arenaRoot]] as const){
      expect(merkle(items.map(x=>x.leaf)).root).toBe(root);
      for(const item of items) expect(verifyProof(item.leaf,item.proof,root)).toBe(true);
    }
    expect(merkle([]).root).toBe(vectors.emptyRoot);
    expect(verifyProof(vectors.yappers[0]!.leaf,[],vectors.yappersRoot)).toBe(false);
  });
  it('checks the Rust phase vectors when present',()=>{
    const path=resolve('../contracts/yap/tests/vectors.json');
    if(!existsSync(path)) return;
    const other=JSON.parse(readFileSync(path,'utf8')) as {
      yapper_leaves:{epoch:number;account:string;amount:string;score:number;tier:number;expected:string}[];
      arena_leaves:{arena_id:number;epoch:number;account:string;amount:string;expected:string}[];
      nodes:{left:string;right:string;expected:string}[];
      proofs:{leaf:string;proof:string[];root:string;valid:boolean}[];
    };
    for(const v of other.yapper_leaves) expect(yapperLeaf(v.epoch,v.account,v.amount,String(v.score),v.tier)).toBe(v.expected);
    for(const v of other.arena_leaves) expect(arenaLeaf(v.arena_id,v.epoch,v.account,v.amount)).toBe(v.expected);
    for(const v of other.nodes) expect(nodeHash(v.left,v.right)).toBe(v.expected);
    for(const v of other.proofs) expect(verifyProof(v.leaf,v.proof,v.root)).toBe(v.valid);
  });
});
