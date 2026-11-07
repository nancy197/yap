// The arena claim ABI carries both allocation and tier proofs as separate arguments.
#![allow(clippy::too_many_arguments)]

mod arena;
mod arena_impl;
mod challenge;
mod challenge_impl;
mod config;
mod epoch;
mod events;
pub mod merkle;
mod staking;
mod staking_impl;
#[cfg(test)]
mod tests;
mod token;

pub use arena::Arena;
pub use challenge::{Challenge, ChallengeStatus};
pub use config::{Config, GenesisSplit};
pub use epoch::{ArenaRoot, Epoch, EpochReport, EpochStatus};
pub use staking::Stake;

use base64::Engine;
use near_contract_standards::fungible_token::metadata::{FungibleTokenMetadata, FT_METADATA_SPEC};
use near_contract_standards::fungible_token::FungibleToken;
use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::collections::{LookupMap, UnorderedMap};
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{
    env, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue,
};
use serde_json::json;

const GAS_DAO: Gas = Gas::from_tgas(80);
const GAS_CALLBACK: Gas = Gas::from_tgas(25);
const GAS_FT: Gas = Gas::from_tgas(30);
const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);
const SCALE: u128 = 1_000_000_000_000;

fn add(a: u128, b: u128) -> u128 {
    a.checked_add(b).expect("addition overflow")
}
fn sub(a: u128, b: u128) -> u128 {
    a.checked_sub(b).expect("subtraction underflow")
}
fn mul(a: u128, b: u128) -> u128 {
    a.checked_mul(b).expect("multiplication overflow")
}
fn bps(a: u128, n: u32) -> u128 {
    mul(a, n as u128) / 10_000
}
fn now() -> u64 {
    env::block_timestamp()
}
fn self_id() -> AccountId {
    env::current_account_id()
}
fn account() -> AccountId {
    env::predecessor_account_id()
}
fn hash_ok(value: &str) {
    require!(
        value.len() == 64 && hex::decode(value).map(|v| v.len() == 32).unwrap_or(false),
        "expected 32-byte hex hash"
    );
}
fn uri_ok(value: &str) {
    require!(!value.is_empty() && value.len() <= 4096, "bad URI length");
}

#[derive(
    BorshDeserialize, BorshSerialize, Clone, Default, Serialize, Deserialize, near_sdk::NearSchema,
)]
#[abi(borsh, json)]
#[serde(crate = "near_sdk::serde")]
pub struct Scorer {
    pub bond: U128,
    pub slashed: U128,
}

#[derive(Serialize, Deserialize, near_sdk::NearSchema)]
#[abi(json)]
#[serde(crate = "near_sdk::serde")]
pub struct StateView {
    pub streak: u32,
    pub best_streak: u32,
    pub attention_target: U128,
    pub minted_total: U128,
    pub burned_total: U128,
    pub reserve: U128,
    pub current_epoch: u32,
    pub reward_per_share: U128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Yap {
    config: Config,
    token: FungibleToken,
    metadata: FungibleTokenMetadata,
    reserve: u128,
    streak: u32,
    best_streak: u32,
    attention_target: u128,
    minted_total: u128,
    burned_total: u128,
    reward_per_share: u128,
    epochs: UnorderedMap<u32, Epoch>,
    votes: LookupMap<String, String>,
    scorers: LookupMap<AccountId, Scorer>,
    challenges: UnorderedMap<u32, Challenge>,
    claims: LookupMap<String, bool>,
    stakes: UnorderedMap<AccountId, Stake>,
    arenas: UnorderedMap<u32, Arena>,
    arena_claims: LookupMap<String, bool>,
    arena_paid: LookupMap<String, u128>,
    next_arena: u32,
}

#[near]
impl Yap {
    #[init]
    pub fn new(config: Config, metadata: Option<FungibleTokenMetadata>) -> Self {
        require!(!env::state_exists(), "already initialized");
        config.validate();
        let metadata = metadata.unwrap_or(FungibleTokenMetadata {
            spec: FT_METADATA_SPEC.into(),
            name: "YAP".into(),
            symbol: "YAP".into(),
            icon: None,
            reference: None,
            reference_hash: None,
            decimals: 18,
        });
        metadata.assert_valid();
        require!(
            metadata.symbol == "YAP" && metadata.decimals == 18,
            "YAP metadata required"
        );
        let mut token = FungibleToken::new(b"t".to_vec());
        let deployer = account();
        let contract = self_id();
        let mut genesis_accounts = vec![contract.clone(), config.dao.clone(), deployer.clone()];
        genesis_accounts.sort();
        genesis_accounts.dedup();
        for id in &genesis_accounts {
            token.internal_register_account(id);
        }
        let reserve = bps(config.initial_supply.0, config.genesis_split.reserve_bps);
        let dao_amount = bps(config.initial_supply.0, config.genesis_split.dao_bps);
        let deployer_amount = sub(sub(config.initial_supply.0, reserve), dao_amount);
        token.internal_deposit(&contract, reserve);
        token::mint_event(&contract, reserve, "genesis reserve");
        token.internal_deposit(&config.dao, dao_amount);
        token::mint_event(&config.dao, dao_amount, "genesis DAO");
        token.internal_deposit(&deployer, deployer_amount);
        token::mint_event(&deployer, deployer_amount, "genesis deployer");
        let result = Self {
            attention_target: config.initial_attention_target.0,
            config,
            token,
            metadata,
            reserve,
            streak: 0,
            best_streak: 0,
            minted_total: add(add(reserve, dao_amount), deployer_amount),
            burned_total: 0,
            reward_per_share: 0,
            epochs: UnorderedMap::new(b"e".to_vec()),
            votes: LookupMap::new(b"v".to_vec()),
            scorers: LookupMap::new(b"s".to_vec()),
            challenges: UnorderedMap::new(b"c".to_vec()),
            claims: LookupMap::new(b"l".to_vec()),
            stakes: UnorderedMap::new(b"k".to_vec()),
            arenas: UnorderedMap::new(b"a".to_vec()),
            arena_claims: LookupMap::new(b"x".to_vec()),
            arena_paid: LookupMap::new(b"p".to_vec()),
            next_arena: 0,
        };
        events::emit(
            "genesis",
            json!({"reserve":U128(reserve),"dao":U128(dao_amount),"deployer":U128(deployer_amount)}),
        );
        result
    }

    pub fn get_config(&self) -> Config {
        self.config.clone()
    }
    pub fn get_state(&self) -> StateView {
        StateView {
            streak: self.streak,
            best_streak: self.best_streak,
            attention_target: U128(self.attention_target),
            minted_total: U128(self.minted_total),
            burned_total: U128(self.burned_total),
            reserve: U128(self.reserve),
            current_epoch: self.current_epoch(),
            reward_per_share: U128(self.reward_per_share),
        }
    }
    pub fn get_epoch(&self, e: u32) -> Option<Epoch> {
        self.epochs.get(&e)
    }
    pub fn get_epochs(&self, from: u32, limit: u32) -> Vec<Epoch> {
        (from..from.saturating_add(limit.min(100)))
            .filter_map(|e| self.get_epoch(e))
            .collect()
    }
    pub fn get_arena(&self, id: u32) -> Option<Arena> {
        self.arenas.get(&id)
    }
    pub fn get_arenas(&self, from: u32, limit: u32) -> Vec<Arena> {
        (from..from.saturating_add(limit.min(100)))
            .filter_map(|id| self.get_arena(id))
            .collect()
    }
    pub fn get_stake(&self, account: AccountId) -> Stake {
        self.stakes.get(&account).unwrap_or_default()
    }
    pub fn get_scorer(&self, account: AccountId) -> Scorer {
        self.scorers.get(&account).unwrap_or_default()
    }
    pub fn is_claimed(&self, e: u32, account: AccountId) -> bool {
        self.claims.get(&format!("{e}:{account}")).unwrap_or(false)
    }
    pub fn get_challenge(&self, e: u32) -> Option<Challenge> {
        self.challenges.get(&e)
    }
    pub fn current_epoch(&self) -> u32 {
        let now_secs = now() / 1_000_000_000;
        if now_secs < self.config.genesis_ts {
            0
        } else {
            ((now_secs - self.config.genesis_ts) / self.config.epoch_secs) as u32
        }
    }

    pub fn submit_report(&mut self, e: u32, report: EpochReport) {
        let caller = account();
        require!(self.config.scorers.contains(&caller), "not a scorer");
        require!(
            self.get_scorer(caller.clone()).bond.0 >= self.config.scorer_bond.0,
            "scorer bond missing"
        );
        require!(e < self.current_epoch(), "epoch still open");
        require!(
            self.current_epoch() <= e.saturating_add(self.config.report_deadline_epochs),
            "report deadline passed"
        );
        hash_ok(&report.yappers_root);
        hash_ok(&report.labels_hash);
        if let Some(hash) = &report.prompt_hash {
            hash_ok(hash);
        }
        if let Some(hash) = &report.attestation_hash {
            hash_ok(hash);
        }
        hash_ok(&report.data_hash);
        uri_ok(&report.uri);
        let mut seen = std::collections::HashSet::new();
        for root in &report.arenas {
            hash_ok(&root.root);
            require!(seen.insert(root.arena_id), "duplicate arena root");
            let arena = self.arenas.get(&root.arena_id).expect("unknown arena");
            require!(
                e >= arena.start_epoch && e < arena.start_epoch + arena.epochs,
                "arena inactive"
            );
        }
        for (id, arena) in self.arenas.iter() {
            if !arena.closed
                && e >= arena.start_epoch
                && e < arena.start_epoch.saturating_add(arena.epochs)
            {
                require!(seen.contains(&id), "active arena root missing");
            }
        }
        let hash = merkle::hash_hex(&near_sdk::borsh::to_vec(&report).expect("borsh report"));
        let key = format!("{e}:{caller}");
        require!(self.votes.get(&key).is_none(), "already voted");
        let mut epoch = self.get_epoch(e).unwrap_or_else(|| Epoch::new(e));
        require!(
            !matches!(
                epoch.status,
                EpochStatus::Finalized
                    | EpochStatus::Dead
                    | EpochStatus::Challenged
                    | EpochStatus::Proposed
            ),
            "epoch unavailable"
        );
        self.votes.insert(&key, &hash);
        let signers: Vec<_> = self
            .config
            .scorers
            .iter()
            .filter(|id| self.votes.get(&format!("{e}:{id}")).as_ref() == Some(&hash))
            .cloned()
            .collect();
        events::emit(
            "report_vote",
            json!({"epoch":e,"scorer":caller,"hash":hash}),
        );
        if signers.len() >= self.config.scorer_quorum as usize {
            epoch.status = EpochStatus::Proposed;
            epoch.report = Some(report);
            epoch.report_hash = Some(hash);
            epoch.signers = signers;
            epoch.proposed_at = now();
            self.epochs.insert(&e, &epoch);
            events::emit("report_proposed", json!({"epoch":e}));
        }
    }

    pub fn finalize(&mut self, e: u32) {
        let mut epoch = self.get_epoch(e).expect("epoch missing");
        require!(epoch.status == EpochStatus::Proposed, "not proposed");
        require!(
            self.current_epoch() <= e.saturating_add(self.config.report_deadline_epochs),
            "finalization deadline passed"
        );
        require!(
            now() >= epoch.proposed_at + self.config.challenge_secs * 1_000_000_000,
            "challenge window open"
        );
        // An Upheld challenge discarded the earlier report; the report now proposed is a resubmission, so only a
        // challenge that is still open blocks finalization.
        require!(
            !self.challenges.get(&e).is_some_and(|c| matches!(
                c.status,
                ChallengeStatus::Open | ChallengeStatus::ProposalPending
            )),
            "challenge open"
        );
        let attention = epoch.report.as_ref().expect("report missing").attention.0;
        if attention == 0 {
            self.apply_dead(&mut epoch);
        } else {
            let old_target = self.attention_target;
            let loud = mul(attention, 10_000) >= mul(old_target, self.config.loud_bps as u128);
            let base_at_attention = mul(self.config.base_emission.0, attention) / old_target;
            let emission = if loud {
                self.streak = self.streak.checked_add(1).expect("streak overflow");
                self.best_streak = self.best_streak.max(self.streak);
                let limited = base_at_attention.min(
                    mul(
                        self.config.base_emission.0,
                        self.config.max_ratio_bps as u128,
                    ) / 10_000,
                );
                let streak_bonus = mul(
                    self.streak.min(self.config.streak_cap) as u128,
                    self.config.streak_step_bps as u128,
                );
                mul(limited, add(10_000, streak_bonus)) / 10_000
            } else {
                self.streak = 0;
                self.burn_reserve(self.config.quiet_burn_bps);
                base_at_attention
            };
            self.attention_target = (add(
                mul(old_target, (10_000 - self.config.ema_bps) as u128),
                mul(attention, self.config.ema_bps as u128),
            ) / 10_000)
                .max(1);
            epoch.status = EpochStatus::Finalized;
            self.allocate_emission(&mut epoch, emission);
            events::emit(
                "epoch_finalized",
                json!({"epoch":e,"attention":U128(attention),"emission":U128(emission),"streak":self.streak}),
            );
        }
        self.epochs.insert(&e, &epoch);
    }

    pub fn crank_dead_epoch(&mut self, e: u32) {
        require!(
            self.current_epoch() > e.saturating_add(self.config.report_deadline_epochs),
            "deadline not passed"
        );
        require!(
            self.get_epoch(e)
                .map(|x| !matches!(
                    x.status,
                    EpochStatus::Finalized | EpochStatus::Dead | EpochStatus::Challenged
                ))
                .unwrap_or(true),
            "epoch unavailable"
        );
        let mut epoch = self.get_epoch(e).unwrap_or_else(|| Epoch::new(e));
        self.apply_dead(&mut epoch);
        self.epochs.insert(&e, &epoch);
    }

    pub fn claim(&mut self, e: u32, amount: U128, score: u64, tier: u8, proof: Vec<String>) {
        let caller = account();
        let mut epoch = self.claimable_epoch(e);
        require!(!self.is_claimed(e, caller.clone()), "already claimed");
        require!(tier <= 4, "invalid tier");
        let leaf = merkle::yapper_leaf(e, caller.as_str(), amount.0, score, tier);
        require!(
            merkle::verify(
                &leaf,
                &proof,
                &epoch.report.as_ref().expect("report").yappers_root
            ),
            "bad proof"
        );
        epoch.claimed.0 = add(epoch.claimed.0, amount.0);
        require!(
            epoch.claimed.0 <= epoch.yapper_pool.0,
            "allocation exceeded"
        );
        self.epochs.insert(&e, &epoch);
        self.claims.insert(&format!("{e}:{caller}"), &true);
        self.token
            .internal_transfer(&self_id(), &caller, amount.0, None);
        events::emit("claim", json!({"epoch":e,"account":caller,"amount":amount}));
    }

    pub fn burn_unclaimed(&mut self, e: u32) {
        let mut epoch = self.get_epoch(e).expect("epoch missing");
        require!(
            epoch.status == EpochStatus::Finalized && !epoch.unclaimed_burned,
            "not burnable"
        );
        require!(
            self.current_epoch() > e.saturating_add(self.config.claim_epochs),
            "claim window open"
        );
        let left = sub(epoch.yapper_pool.0, epoch.claimed.0);
        self.burn_from_contract(left, "unclaimed");
        epoch.unclaimed_burned = true;
        self.epochs.insert(&e, &epoch);
        events::emit("unclaimed_burned", json!({"epoch":e,"amount":U128(left)}));
    }
}

impl Yap {
    fn claimable_epoch(&self, e: u32) -> Epoch {
        let epoch = self.get_epoch(e).expect("epoch missing");
        require!(
            epoch.status == EpochStatus::Finalized,
            "epoch not finalized"
        );
        require!(
            self.current_epoch() <= e.saturating_add(self.config.claim_epochs),
            "claim expired"
        );
        epoch
    }
    fn mint(&mut self, to: &AccountId, amount: u128, reason: &str) {
        if amount == 0 {
            return;
        }
        self.token.internal_deposit(to, amount);
        token::mint_event(to, amount, reason);
        self.minted_total = add(self.minted_total, amount);
        events::emit(
            "mint",
            json!({"to":to,"amount":U128(amount),"reason":reason}),
        );
    }
    fn burn_from_contract(&mut self, amount: u128, reason: &str) {
        if amount == 0 {
            return;
        }
        self.token.internal_withdraw(&self_id(), amount);
        token::burn_event(&self_id(), amount, reason);
        self.burned_total = add(self.burned_total, amount);
        events::emit("burn", json!({"amount":U128(amount),"reason":reason}));
    }
    fn burn_reserve(&mut self, burn_bps: u32) {
        let amount = bps(self.reserve, burn_bps);
        self.reserve = sub(self.reserve, amount);
        self.burn_from_contract(amount, "reserve");
    }
    fn apply_dead(&mut self, epoch: &mut Epoch) {
        self.streak = 0;
        self.burn_reserve(self.config.dead_burn_bps);
        self.attention_target = bps(self.attention_target, 10_000 - self.config.ema_bps).max(1);
        epoch.status = EpochStatus::Dead;
        events::emit(
            "epoch_dead",
            json!({"epoch":epoch.number,"reserve":U128(self.reserve),"attention_target":U128(self.attention_target)}),
        );
    }
    fn allocate_emission(&mut self, epoch: &mut Epoch, emission: u128) {
        let yapper = bps(emission, self.config.yapper_bps);
        let staker = bps(emission, self.config.staker_bps);
        let dao = sub(sub(emission, yapper), staker);
        self.mint(&self_id(), add(yapper, staker), "epoch");
        self.mint(&self.config.dao.clone(), dao, "epoch_dao");
        epoch.emission = U128(emission);
        epoch.yapper_pool = U128(yapper);
        epoch.staker_pool = U128(staker);
        epoch.dao_pool = U128(dao);
        self.distribute_staker(epoch.number, staker);
    }
}
