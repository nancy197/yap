use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{require, AccountId};

#[derive(Clone, BorshDeserialize, BorshSerialize, Serialize, Deserialize, near_sdk::NearSchema)]
#[abi(borsh, json)]
#[serde(crate = "near_sdk::serde")]
pub struct GenesisSplit {
    pub reserve_bps: u32,
    pub dao_bps: u32,
    pub deployer_bps: u32,
}

#[derive(Clone, BorshDeserialize, BorshSerialize, Serialize, Deserialize, near_sdk::NearSchema)]
#[abi(borsh, json)]
#[serde(crate = "near_sdk::serde")]
pub struct Config {
    pub epoch_secs: u64,
    pub genesis_ts: u64,
    pub base_emission: U128,
    pub initial_attention_target: U128,
    pub ema_bps: u32,
    pub loud_bps: u32,
    pub max_ratio_bps: u32,
    pub streak_cap: u32,
    pub streak_step_bps: u32,
    pub quiet_burn_bps: u32,
    pub dead_burn_bps: u32,
    pub report_deadline_epochs: u32,
    pub yapper_bps: u32,
    pub staker_bps: u32,
    pub dao_bps: u32,
    pub claim_epochs: u32,
    pub scorers: Vec<AccountId>,
    pub scorer_quorum: u32,
    pub scorer_bond: U128,
    pub challenge_secs: u64,
    pub challenge_bond: U128,
    pub unbond_epochs: u32,
    pub dao: AccountId,
    pub dao_proposal_bond: U128,
    pub accepted_arena_tokens: Vec<AccountId>,
    pub initial_supply: U128,
    pub genesis_split: GenesisSplit,
}

impl Config {
    pub fn validate(&self) {
        require!(
            self.epoch_secs > 0 && self.initial_attention_target.0 > 0,
            "bad epoch or target"
        );
        require!(
            self.base_emission.0 > 0 && self.initial_supply.0 > 0,
            "zero token amount"
        );
        require!(
            self.ema_bps <= 10_000 && self.loud_bps <= 10_000,
            "bad attention bps"
        );
        require!(
            self.max_ratio_bps >= 10_000 && self.streak_step_bps <= 10_000,
            "bad ratio or step"
        );
        require!(
            self.quiet_burn_bps <= 10_000 && self.dead_burn_bps <= 10_000,
            "bad burn bps"
        );
        require!(
            self.yapper_bps <= 10_000 && self.staker_bps <= 10_000 && self.dao_bps <= 10_000,
            "bad emission bps"
        );
        require!(
            self.yapper_bps + self.staker_bps + self.dao_bps == 10_000,
            "bad emission split"
        );
        require!(
            self.genesis_split.reserve_bps <= 10_000
                && self.genesis_split.dao_bps <= 10_000
                && self.genesis_split.deployer_bps <= 10_000,
            "bad genesis bps"
        );
        require!(
            self.genesis_split.reserve_bps
                + self.genesis_split.dao_bps
                + self.genesis_split.deployer_bps
                == 10_000,
            "bad genesis split"
        );
        require!(
            self.claim_epochs > 0
                && self.report_deadline_epochs > 0
                && self.challenge_secs > 0
                && self.challenge_secs <= u64::MAX / 4_000_000_000,
            "bad time parameter"
        );
        require!(
            self.unbond_epochs > 0 && self.scorer_bond.0 > 0 && self.challenge_bond.0 > 0,
            "bad bond or unbond"
        );
        require!(
            !self.scorers.is_empty()
                && self.scorer_quorum > 0
                && self.scorer_quorum as usize <= self.scorers.len(),
            "bad quorum"
        );
        let mut unique = self.scorers.clone();
        unique.sort();
        unique.dedup();
        require!(unique.len() == self.scorers.len(), "duplicate scorer");
        let mut tokens = self.accepted_arena_tokens.clone();
        tokens.sort();
        tokens.dedup();
        require!(
            tokens.len() == self.accepted_arena_tokens.len(),
            "duplicate arena token"
        );
        require!(self.genesis_ts > 0, "genesis timestamp required");
    }
}
