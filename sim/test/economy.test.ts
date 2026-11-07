import {describe,it,expect} from 'vitest';
import {mainnet,ONE_YAP} from '../params.js';
import {Economy} from '../src/economy.js';

describe('R-3 integer port',()=>{
  it('applies loud, quiet and dead emissions, burns and EMA in contract order',()=>{
    const p={...mainnet,initial_supply:(10_000n*ONE_YAP).toString(),base_emission:(1_000n*ONE_YAP).toString(),initial_attention_target:'100000000'};
    const e=new Economy(p);
    const loud=e.advance(0,100_000_000n);
    expect(loud.kind).toBe('loud');expect(loud.minted).toBe((1_050n*ONE_YAP).toString());
    expect(loud.streak).toBe(1);expect(loud.target).toBe('100000000');
    const quiet=e.advance(1,50_000_000n);
    expect(quiet.kind).toBe('quiet');expect(quiet.minted).toBe((500n*ONE_YAP).toString());
    expect(quiet.reserveBurn).toBe((180n*ONE_YAP).toString());
    expect(quiet.target).toBe('90000000');expect(quiet.streak).toBe(0);
    const dead=e.advance(2,0n);
    expect(dead.kind).toBe('dead');expect(dead.minted).toBe('0');
    expect(dead.reserveBurn).toBe((582n*ONE_YAP).toString());
    expect(dead.target).toBe('72000000');
    expect(dead.supply).toBe((10_000n*ONE_YAP+1_550n*ONE_YAP-180n*ONE_YAP-582n*ONE_YAP).toString());
  });
  it('caps the streak bonus at ten and burns expired unclaimed yapper emissions',()=>{
    const p={...mainnet,claim_epochs:1};
    const e=new Economy(p);
    let row=e.advance(0,100_000_000n,100n*ONE_YAP);
    for(let i=1;i<12;i++) row=e.advance(i,100_000_000n);
    expect(row.streak).toBe(12);expect(row.bestStreak).toBe(12);
    expect(row.minted).toBe((1_500n*ONE_YAP).toString());
    expect(e.burnedTotal).toBe(100n*ONE_YAP);
  });
});
