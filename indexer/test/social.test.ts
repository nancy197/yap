import {describe,it,expect} from 'vitest';
import {makeDataset} from '../src/social.js';
import {history} from '../src/reader.js';
import type {Write} from '@yap/scoring';
function w(account:string,key:string,value:unknown,ms:number,height=1):Write{return {predecessorId:account,key,value,blockHeight:height,blockTimestamp:String(ms*1_000_000),receiptId:`r${height}`,actionIndex:0};}
describe('social-kv replay',()=>{
  it('applies last-write-wins, tombstones, first creation and epoch bounds',()=>{
    const rows=[w('alice.near','post/1',{text:'first #NEAR'},500),w('alice.near','post/1',{text:'edited #near'},1200,2),w('bob.near','like/alice.near/1',{},1300,3),w('bob.near','like/alice.near/1',null,1400,4),w('bob.near','graph/follow/alice.near',{},700,5),w('bob.near','graph/follow/alice.near','invalid',1500,6)];
    const d=makeDataset('testnet',1000,2000,rows);
    expect(d.posts).toHaveLength(0);
    expect(d.likes).toHaveLength(0);
    expect(d.follows).toHaveLength(0);
    expect(d.writes).toHaveLength(4);
    expect(makeDataset('testnet',0,2000,rows).posts[0]?.createdAt).toBe('500000000');
    expect(makeDataset('testnet',0,2000,rows).posts[0]?.topics).toEqual(['#near']);
  });
  it('rejects malformed posts and accepts only object edges',()=>{
    const rows=[w('alice.near','post/1',{text:'x',media:[{src:'https://bad',mime:'image/png'}]},1100),w('alice.near','post/2',{text:'valid'},1200,2),w('bob.near','like/alice.near/2','yes',1300,3),w('bob.near','repost/alice.near/2',{},1400,4)];
    const d=makeDataset('testnet',1000,2000,rows);
    expect(d.posts.map(x=>x.key)).toEqual(['alice.near/2']);
    expect(d.likes).toHaveLength(0);expect(d.reposts).toHaveLength(1);
  });
  it('resolves nested reply roots and rejects cycles',()=>{
    const rows=[w('alice.near','post/1',{text:'root'},1100),w('bob.near','post/2',{text:'reply',reply_to:'alice.near/1',root:'alice.near/1'},1200,2),
      w('carol.near','post/3',{text:'nested',reply_to:'bob.near/2',root:'alice.near/1'},1300,3),
      w('dan.near','post/4',{text:'bad',reply_to:'carol.near/3',root:'bob.near/2'},1400,4),
      w('eve.near','post/5',{text:'cycle',reply_to:'frank.near/6'},1500,5),w('frank.near','post/6',{text:'cycle',reply_to:'eve.near/5'},1600,6)];
    const d=makeDataset('testnet',1000,2000,rows);
    expect(d.posts.map(x=>x.key)).toEqual(['alice.near/1','bob.near/2','carol.near/3']);
    expect(makeDataset('testnet',1000,2000,rows.slice().reverse()).dataHash).toBe(d.dataHash);
  });
  it('uses a valid reply backlink as the account first write',()=>{
    const rows=[w('alice.near','post/1',{text:'root'},500),w('bob.near','reply/alice.near/1/2',{},600,2),w('bob.near','like/alice.near/1',{},1200,3)];
    expect(makeDataset('testnet',1000,2000,rows).firstWrites['bob.near']).toBe('600000000');
  });
  it('paginates account-wide history and retains u64 nanoseconds',async()=>{
    let calls=0;
    const fake=async (_url:string,_options?:RequestInit)=>{
      calls++;
      return new Response(calls===1?'{"entries":[{"predecessor_id":"alice.near","current_account_id":"social","key":"post/1","value":{"text":"hello"},"block_height":1,"block_timestamp":1793458204844000000}],"page_token":"next"}':'{"entries":[]}',{status:200});
    };
    const rows=[];
    for await(const row of history('mainnet',undefined,fake as typeof fetch)) rows.push(row);
    expect(calls).toBe(2);expect(rows[0]?.blockTimestamp).toBe('1793458204844000000');
  });
});
