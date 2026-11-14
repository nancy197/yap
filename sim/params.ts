// Raw YAP amounts use 18 decimals. Names match the contract's Config JSON.
export const ONE_YAP = 1_000_000_000_000_000_000n;
export interface TokenParams {
  epoch_secs: number; initial_supply: string; base_emission: string;
  initial_attention_target: string; ema_bps: number; max_ratio_bps: number;
  jackpot_bps: number; vault_release_bps: number; initial_block_threshold: string; difficulty_bps: number;
  report_deadline_epochs: number;
  yapper_bps: number; staker_bps: number; dao_bps: number; claim_epochs: number;
  unbond_epochs: number; genesis_split: {vault_bps:number;dao_bps:number;deployer_bps:number};
}
const common = {
  initial_supply: (1_000_000n * ONE_YAP).toString(),
  base_emission: (1_000n * ONE_YAP).toString(),
  initial_attention_target: '100000000', // 100 Yap-score units, scaled by 1e6.
  ema_bps: 2_000, max_ratio_bps: 30_000,
  // Proof of Yap: 20% of each tick's mint feeds the jackpot; a block pays it plus 10% of the vault.
  // Block 1 needs ~5.5 loud testnet ticks of attention (a loud tick scores ~55 units); each block needs 25% more.
  jackpot_bps: 2_000, vault_release_bps: 1_000,
  initial_block_threshold: '300000000', difficulty_bps: 12_500,
  report_deadline_epochs: 3,
  yapper_bps: 8_000, staker_bps: 1_000, dao_bps: 1_000,
  claim_epochs: 14, unbond_epochs: 7,
  genesis_split: {vault_bps:6_000,dao_bps:2_500,deployer_bps:1_500}
} satisfies Omit<TokenParams,'epoch_secs'>;
export const mainnet: TokenParams = {...common, epoch_secs:86_400};
export const testnet: TokenParams = {...common, epoch_secs:600};
