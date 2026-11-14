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
pub use epoch::{ArenaRoot, Block, Epoch, EpochReport, EpochStatus};
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
    pub block_number: u32,
    pub block_start_epoch: u32,
    pub block_progress: U128,
    pub block_threshold: U128,
    pub jackpot_pot: U128,
    pub vault: U128,
    pub attention_target: U128,
    pub minted_total: U128,
    pub burned_total: U128,
    pub current_epoch: u32,
    pub reward_per_share: U128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Yap {
    config: Config,
    token: FungibleToken,
    metadata: FungibleTokenMetadata,
    // Proof of Yap: ticks add attention to the current block; crossing the threshold pays the jackpot.
    vault: u128,
    jackpot_pot: u128,
    block_number: u32,
    block_start_epoch: u32,
    block_progress: u128,
    block_threshold: u128,
    blocks: UnorderedMap<u32, Block>,
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
        let vault = bps(config.initial_supply.0, config.genesis_split.vault_bps);
        let dao_amount = bps(config.initial_supply.0, config.genesis_split.dao_bps);
        let deployer_amount = sub(sub(config.initial_supply.0, vault), dao_amount);
        token.internal_deposit(&contract, vault);
        token::mint_event(&contract, vault, "genesis vault");
        token.internal_deposit(&config.dao, dao_amount);
        token::mint_event(&config.dao, dao_amount, "genesis DAO");
        token.internal_deposit(&deployer, deployer_amount);
        token::mint_event(&deployer, deployer_amount, "genesis deployer");
        let result = Self {
            attention_target: config.initial_attention_target.0,
            block_threshold: config.initial_block_threshold.0,
            config,
            token,
            metadata,
            vault,
            jackpot_pot: 0,
            block_number: 1,
            block_start_epoch: 0,
            block_progress: 0,
            blocks: UnorderedMap::new(b"b".to_vec()),
            minted_total: add(add(vault, dao_amount), deployer_amount),
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
            json!({"vault":U128(vault),"dao":U128(dao_amount),"deployer":U128(deployer_amount)}),
        );
        result
    }

    pub fn get_config(&self) -> Config {
        self.config.clone()
    }
    pub fn get_state(&self) -> StateView {
        StateView {
            block_number: self.block_number,
            block_start_epoch: self.block_start_epoch,
            block_progress: U128(self.block_progress),
            block_threshold: U128(self.block_threshold),
            jackpot_pot: U128(self.jackpot_pot),
            vault: U128(self.vault),
            attention_target: U128(self.attention_target),
            minted_total: U128(self.minted_total),
            burned_total: U128(self.burned_total),
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
    pub fn get_block(&self, number: u32) -> Option<Block> {
        self.blocks.get(&number)
    }
    pub fn get_blocks(&self, from: u32, limit: u32) -> Vec<Block> {
        (from..from.saturating_add(limit.min(100)))
            .filter_map(|n| self.get_block(n))
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
            // More yap mints more, capped at max_ratio x the base; the target follows attention by EMA.
            let old_target = self.attention_target;
            let emission = (mul(self.config.base_emission.0, attention) / old_target)
                .min(bps(self.config.base_emission.0, self.config.max_ratio_bps));
            self.attention_target = (add(
                mul(old_target, (10_000 - self.config.ema_bps) as u128),
                mul(attention, self.config.ema_bps as u128),
            ) / 10_000)
                .max(1);
            epoch.status = EpochStatus::Finalized;
            self.allocate_emission(&mut epoch, emission);
            self.advance_block(&mut epoch, attention);
            events::emit(
                "epoch_finalized",
                json!({"epoch":e,"attention":U128(attention),"emission":U128(emission),"block":epoch.block,"block_progress":U128(self.block_progress),"jackpot":epoch.jackpot}),
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

    /// Nothing burns in Proof of Yap: rewards left unclaimed after the claim window go back into the jackpot.
    pub fn recycle_unclaimed(&mut self, e: u32) {
        let mut epoch = self.get_epoch(e).expect("epoch missing");
        require!(
            epoch.status == EpochStatus::Finalized && !epoch.unclaimed_recycled,
            "not recyclable"
        );
        require!(
            self.current_epoch() > e.saturating_add(self.config.claim_epochs),
            "claim window open"
        );
        let left = sub(epoch.yapper_pool.0, epoch.claimed.0);
        self.jackpot_pot = add(self.jackpot_pot, left);
        epoch.unclaimed_recycled = true;
        self.epochs.insert(&e, &epoch);
        events::emit(
            "unclaimed_to_jackpot",
            json!({"epoch":e,"amount":U128(left),"jackpot_pot":U128(self.jackpot_pot)}),
        );
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
    /// A tick nobody reported (or with zero attention): no mint, no progress, nothing burns.
    fn apply_dead(&mut self, epoch: &mut Epoch) {
        self.attention_target = bps(self.attention_target, 10_000 - self.config.ema_bps).max(1);
        epoch.status = EpochStatus::Dead;
        epoch.block = self.block_number;
        events::emit(
            "epoch_dead",
            json!({"epoch":epoch.number,"attention_target":U128(self.attention_target)}),
        );
    }
    /// Adds the tick's attention to the current block. Crossing the threshold pays the jackpot pot plus a vault
    /// release into this tick's yapper pool (split off chain by contribution over the whole block), then starts
    /// the next block with a higher threshold.
    fn advance_block(&mut self, epoch: &mut Epoch, attention: u128) {
        epoch.block = self.block_number;
        self.block_progress = add(self.block_progress, attention);
        if self.block_progress < self.block_threshold {
            return;
        }
        let release = bps(self.vault, self.config.vault_release_bps);
        self.vault = sub(self.vault, release);
        let payout = add(self.jackpot_pot, release);
        self.jackpot_pot = 0;
        epoch.jackpot = U128(payout);
        epoch.yapper_pool = U128(add(epoch.yapper_pool.0, payout));
        let block = Block {
            number: self.block_number,
            start_epoch: self.block_start_epoch,
            end_epoch: epoch.number,
            threshold: U128(self.block_threshold),
            progress: U128(self.block_progress),
            payout: U128(payout),
        };
        self.blocks.insert(&self.block_number, &block);
        events::emit(
            "jackpot",
            json!({"block":block.number,"start_epoch":block.start_epoch,"end_epoch":block.end_epoch,"payout":block.payout,"threshold":block.threshold}),
        );
        self.block_number = self.block_number.checked_add(1).expect("block overflow");
        self.block_start_epoch = epoch.number.saturating_add(1);
        self.block_progress = 0;
        self.block_threshold = bps(self.block_threshold, self.config.difficulty_bps).max(1);
    }
    fn allocate_emission(&mut self, epoch: &mut Epoch, emission: u128) {
        // The jackpot share comes off the top; the rest is split yapper / staker / DAO as before.
        let jackpot = bps(emission, self.config.jackpot_bps);
        let rest = sub(emission, jackpot);
        let yapper = bps(rest, self.config.yapper_bps);
        let staker = bps(rest, self.config.staker_bps);
        let dao = sub(sub(rest, yapper), staker);
        self.jackpot_pot = add(self.jackpot_pot, jackpot);
        self.mint(&self_id(), add(add(yapper, staker), jackpot), "epoch");
        self.mint(&self.config.dao.clone(), dao, "epoch_dao");
        epoch.emission = U128(emission);
        epoch.yapper_pool = U128(yapper);
        epoch.staker_pool = U128(staker);
        epoch.dao_pool = U128(dao);
        self.distribute_staker(epoch.number, staker);
    }
}
