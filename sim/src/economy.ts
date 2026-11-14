// Proof of Yap token rules, in the contract's integer order: per-tick emission (20% to the jackpot), blocks that
// complete when cumulative attention crosses a rising threshold and pay the jackpot plus a vault release.
// Nothing burns: a dead tick mints nothing, and expired unclaimed rewards return to the jackpot.
import type {TokenParams} from '../params.js';

export type EpochKind = 'tick'|'jackpot'|'dead';
export interface EconomyRow {
  epoch:number; kind:EpochKind; supply:string; vault:string; minted:string; jackpotPot:string; payout:string;
  recycled:string; block:number; progress:string; threshold:string;
  attention:string; target:string; yapper:string; staker:string; dao:string;
}
interface Pending {epoch:number; unclaimed:bigint}
export class Economy {
  readonly params:TokenParams;
  supply:bigint; vault:bigint; target:bigint; jackpotPot=0n;
  block=1; progress=0n; threshold:bigint; mintedTotal=0n;
  private pending:Pending[]=[];
  constructor(params:TokenParams) {
    this.params=params;
    this.supply=BigInt(params.initial_supply);
    this.vault=this.supply*BigInt(params.genesis_split.vault_bps)/10_000n;
    this.target=BigInt(params.initial_attention_target);
    this.threshold=BigInt(params.initial_block_threshold);
    if(this.target<=0n||this.threshold<=0n) throw new Error('target and threshold must be positive');
  }
  /** A copy for previewing this tick's pool before claims are decided. */
  clone():Economy {
    const c=new Economy(this.params);
    Object.assign(c,{supply:this.supply,vault:this.vault,target:this.target,jackpotPot:this.jackpotPot,block:this.block,
      progress:this.progress,threshold:this.threshold,mintedTotal:this.mintedTotal});
    return c;
  }
  advance(epoch:number, attention:bigint, unclaimed:bigint=0n):EconomyRow {
    if(attention<0n) throw new Error('negative attention');
    const p=this.params, oldTarget=this.target, block=this.block;
    let kind:EpochKind='dead', minted=0n, payout=0n, yapper=0n, staker=0n, dao=0n;
    // Expired unclaimed rewards go back into the jackpot before this tick is settled.
    let recycled=0n;
    this.pending=this.pending.filter(item=>{
      if(epoch>item.epoch+p.claim_epochs) {recycled+=item.unclaimed;return false;}
      return true;
    });
    this.jackpotPot+=recycled;
    if(attention===0n) {
      this.target=oldTarget*BigInt(10_000-p.ema_bps)/10_000n;
    } else {
      kind='tick';
      const raw=BigInt(p.base_emission)*attention/oldTarget, cap=BigInt(p.base_emission)*BigInt(p.max_ratio_bps)/10_000n;
      minted=raw<cap?raw:cap;
      this.target=(oldTarget*BigInt(10_000-p.ema_bps)+attention*BigInt(p.ema_bps))/10_000n;
      const toJackpot=minted*BigInt(p.jackpot_bps)/10_000n, rest=minted-toJackpot;
      yapper=rest*BigInt(p.yapper_bps)/10_000n;
      staker=rest*BigInt(p.staker_bps)/10_000n;
      dao=rest-yapper-staker;
      this.jackpotPot+=toJackpot;
      this.progress+=attention;
      if(this.progress>=this.threshold) {
        kind='jackpot';
        const release=this.vault*BigInt(p.vault_release_bps)/10_000n;
        this.vault-=release;
        payout=this.jackpotPot+release;
        this.jackpotPot=0n;
        this.block++;this.progress=0n;
        this.threshold=this.threshold*BigInt(p.difficulty_bps)/10_000n;
      }
      if(unclaimed<0n||unclaimed>yapper+payout) throw new Error('invalid unclaimed amount');
      this.pending.push({epoch,unclaimed});
    }
    this.supply+=minted;this.mintedTotal+=minted;
    return {epoch,kind,supply:this.supply.toString(),vault:this.vault.toString(),minted:minted.toString(),
      jackpotPot:this.jackpotPot.toString(),payout:payout.toString(),recycled:recycled.toString(),block,
      progress:this.progress.toString(),threshold:this.threshold.toString(),attention:attention.toString(),
      target:this.target.toString(),yapper:yapper.toString(),staker:staker.toString(),dao:dao.toString()};
  }
}
