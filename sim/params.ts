// Raw YAP amounts use 18 decimals. Names match the contract's Config JSON.
export const ONE_YAP = 1_000_000_000_000_000_000n;
export interface TokenParams {
  epoch_secs: number; initial_supply: string; base_emission: string;
  initial_attention_target: string; ema_bps: number; loud_bps: number;
  max_ratio_bps: number; streak_cap: number; streak_step_bps: number;
  quiet_burn_bps: number; dead_burn_bps: number; report_deadline_epochs: number;
  yapper_bps: number; staker_bps: number; dao_bps: number; claim_epochs: number;
  unbond_epochs: number; genesis_split: {reserve_bps:number;dao_bps:number;deployer_bps:number};
}
const common = {
  initial_supply: (1_000_000n * ONE_YAP).toString(),
  base_emission: (1_000n * ONE_YAP).toString(),
  initial_attention_target: '100000000', // 100 Yap-score units, scaled by 1e6.
  ema_bps: 2_000, loud_bps: 8_000, max_ratio_bps: 30_000,
  streak_cap: 10, streak_step_bps: 500, quiet_burn_bps: 300,
  dead_burn_bps: 1_000, report_deadline_epochs: 3,
  yapper_bps: 8_000, staker_bps: 1_000, dao_bps: 1_000,
  claim_epochs: 14, unbond_epochs: 7,
  genesis_split: {reserve_bps:6_000,dao_bps:2_500,deployer_bps:1_500}
} satisfies Omit<TokenParams,'epoch_secs'>;
export const mainnet: TokenParams = {...common, epoch_secs:86_400};
export const testnet: TokenParams = {...common, epoch_secs:600};
