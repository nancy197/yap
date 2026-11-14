import {describe,it,expect} from 'vitest';
import {mainnet,ONE_YAP} from '../params.js';
import {Economy} from '../src/economy.js';

describe('Proof of Yap integer port',()=>{
  it('splits emission, mines a block, pays pot + vault release and raises difficulty',()=>{
    const p={...mainnet,initial_supply:(10_000n*ONE_YAP).toString(),base_emission:(1_000n*ONE_YAP).toString(),
      initial_attention_target:'100000000',initial_block_threshold:'250000000'};
    const e=new Economy(p);
    expect(e.vault).toBe(6_000n*ONE_YAP);
    const t0=e.advance(0,100_000_000n);
    // 1_000 minted: 200 to the jackpot, 800 split 80/10/10.
    expect(t0.kind).toBe('tick');expect(t0.minted).toBe((1_000n*ONE_YAP).toString());
    expect(t0.jackpotPot).toBe((200n*ONE_YAP).toString());
    expect([t0.yapper,t0.staker,t0.dao]).toEqual([640n,80n,80n].map(x=>(x*ONE_YAP).toString()));
    const dead=e.advance(1,0n);
    expect(dead.kind).toBe('dead');expect(dead.minted).toBe('0');expect(dead.vault).toBe((6_000n*ONE_YAP).toString());
    expect(dead.target).toBe('80000000');expect(dead.progress).toBe('100000000');
    // 160 attention vs target 80 -> 2_000 minted (400 to the pot); progress 260 crosses 250 and the block pays out.
    const t2=e.advance(2,160_000_000n);
    expect(t2.kind).toBe('jackpot');expect(t2.block).toBe(1);
    expect(t2.payout).toBe((600n*ONE_YAP+600n*ONE_YAP).toString());
    expect(t2.vault).toBe((5_400n*ONE_YAP).toString());
    expect(t2.jackpotPot).toBe('0');expect(t2.progress).toBe('0');expect(t2.threshold).toBe('312500000');
    expect(e.block).toBe(2);
  });
  it('recycles expired unclaimed rewards into the jackpot and never burns',()=>{
    const p={...mainnet,claim_epochs:1};
    const e=new Economy(p);
    e.advance(0,50_000_000n,100n*ONE_YAP);
    e.advance(1,50_000_000n);
    const row=e.advance(2,50_000_000n);
    expect(row.recycled).toBe((100n*ONE_YAP).toString());
    expect(BigInt(row.supply)).toBe(BigInt(p.initial_supply)+e.mintedTotal);
  });
});
