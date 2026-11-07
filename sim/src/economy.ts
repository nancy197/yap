import type {TokenParams} from '../params.js';

export type EpochKind = 'loud'|'quiet'|'dead';
export interface EconomyRow {
  epoch:number; kind:EpochKind; supply:string; reserve:string; minted:string; burned:string;
  reserveBurn:string; unclaimedBurn:string; streak:number; bestStreak:number;
  attention:string; target:string; yapper:string; staker:string; dao:string;
}
interface Pending {epoch:number; unclaimed:bigint}
export class Economy {
  readonly params:TokenParams;
  supply:bigint; reserve:bigint; target:bigint;
  streak=0; bestStreak=0; mintedTotal=0n; burnedTotal=0n;
  private pending:Pending[]=[];
  constructor(params:TokenParams) {
    this.params=params;
    this.supply=BigInt(params.initial_supply);
    this.reserve=this.supply*BigInt(params.genesis_split.reserve_bps)/10_000n;
    this.target=BigInt(params.initial_attention_target);
    if(this.target<=0n) throw new Error('target must be positive');
  }
  advance(epoch:number, attention:bigint, unclaimed:bigint=0n):EconomyRow {
    if(attention<0n) throw new Error('negative attention');
    const p=this.params, oldTarget=this.target;
    let kind:EpochKind, minted=0n, reserveBurn=0n, yapper=0n, staker=0n, dao=0n;
    if(attention===0n) {
      kind='dead';this.streak=0;
      reserveBurn=this.reserve*BigInt(p.dead_burn_bps)/10_000n;
      this.target=oldTarget*BigInt(10_000-p.ema_bps)/10_000n;
    } else {
      const ratio=attention*10_000n/oldTarget;
      if(attention*10_000n>=oldTarget*BigInt(p.loud_bps)) {
        kind='loud';this.streak++;
        this.bestStreak=Math.max(this.bestStreak,this.streak);
        const limited=ratio<BigInt(p.max_ratio_bps)?ratio:BigInt(p.max_ratio_bps);
        const bonus=BigInt(Math.min(this.streak,p.streak_cap)*p.streak_step_bps);
        minted=(BigInt(p.base_emission)*limited/10_000n)*(10_000n+bonus)/10_000n;
      } else {
        kind='quiet';this.streak=0;
        reserveBurn=this.reserve*BigInt(p.quiet_burn_bps)/10_000n;
        minted=BigInt(p.base_emission)*ratio/10_000n;
      }
      this.target=oldTarget*BigInt(10_000-p.ema_bps)/10_000n+attention*BigInt(p.ema_bps)/10_000n;
      yapper=minted*BigInt(p.yapper_bps)/10_000n;
      staker=minted*BigInt(p.staker_bps)/10_000n;
      dao=minted-yapper-staker; // Contract assigns the integer remainder to DAO.
      if(unclaimed<0n||unclaimed>yapper) throw new Error('invalid unclaimed amount');
      this.pending.push({epoch,unclaimed});
    }
    this.reserve-=reserveBurn;
    let unclaimedBurn=0n;
    this.pending=this.pending.filter(item=>{
      if(epoch>item.epoch+p.claim_epochs) {unclaimedBurn+=item.unclaimed;return false;}
      return true;
    });
    const burned=reserveBurn+unclaimedBurn;
    this.supply+=minted-burned;
    this.mintedTotal+=minted;this.burnedTotal+=burned;
    return {epoch,kind,supply:this.supply.toString(),reserve:this.reserve.toString(),minted:minted.toString(),burned:burned.toString(),
      reserveBurn:reserveBurn.toString(),unclaimedBurn:unclaimedBurn.toString(),streak:this.streak,bestStreak:this.bestStreak,
      attention:attention.toString(),target:this.target.toString(),yapper:yapper.toString(),staker:staker.toString(),dao:dao.toString()};
  }
}
