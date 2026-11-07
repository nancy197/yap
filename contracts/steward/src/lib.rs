// Callbacks carry the full yapper leaf (account, epoch, amount, score, tier, proof).
#![allow(clippy::too_many_arguments)]
//! YAP Steward: turns on-chain reputation into Sputnik DAO membership and small, capped treasury grants.
//!
//! - `promote`: anyone shows a yapper leaf (Merkle proof against a finalized $YAP epoch) with tier >= `min_tier`.
//!   The steward files `AddMemberToRole(role)` on the community DAO and approves it with its own `steward` role, so
//!   the account joins the `trusted` role with no council vote. Membership lasts `season_epochs` after the proof
//!   epoch; a newer proof extends it.
//! - `demote`: anyone can remove a member whose season ran out (`RemoveMemberFromRole`, same path).
//! - `grant`: an active trusted member sends up to `grant_cap` YAP from the DAO treasury, within `period_budget`
//!   per season. Larger spends stay normal council proposals.
//!
//! No owner, no setters, no upgrade path: every number is fixed at `new`. The DAO grants this contract the
//! `steward` role (votes on add/remove-member and transfer proposals); the code only ever votes on the proposals
//! it filed itself, after checking the rules above.
use near_sdk::json_types::U128;
use near_sdk::serde_json::{self, json, Value};
use near_sdk::store::{IterableMap, LookupMap, Vector};
use near_sdk::{
    env, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseError,
};

pub mod merkle;

const GAS_VIEW: Gas = Gas::from_tgas(10);
const GAS_CB: Gas = Gas::from_tgas(150);
const GAS_ADD: Gas = Gas::from_tgas(20);
const GAS_ACT: Gas = Gas::from_tgas(80);
const GAS_CB_ACT: Gas = Gas::from_tgas(10);
const STORAGE_DEPOSIT: NearToken = NearToken::from_micronear(1_250);

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Config {
    pub yap: AccountId,
    pub dao: AccountId,
    /// Sputnik role the steward manages, e.g. "trusted".
    pub role: String,
    /// Minimum tier in the yapper leaf: 3 = Gold, 4 = Inner Circle.
    pub min_tier: u8,
    /// Membership length after the proof epoch; also the grant budget period.
    pub season_epochs: u32,
    /// Must equal the $YAP contract's epoch clock.
    pub genesis_ts: u64,
    pub epoch_secs: u64,
    pub grant_cap: U128,
    pub period_budget: U128,
    /// Sputnik proposal bond (yoctoNEAR); returned by the DAO when the proposal passes.
    pub proposal_bond: U128,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Member {
    pub since_epoch: u32,
    pub proof_epoch: u32,
    pub expires_epoch: u32,
    pub tier: u8,
    pub score: u64,
    pub add_proposal: Option<u64>,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Grant {
    pub id: u32,
    pub by: AccountId,
    pub receiver: AccountId,
    pub amount: U128,
    pub memo: String,
    pub epoch: u32,
    pub proposal: Option<u64>,
    pub status: String,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Steward {
    config: Config,
    members: IterableMap<AccountId, Member>,
    grants: Vector<Grant>,
    spent: LookupMap<u32, u128>,
}

fn emit(event: &str, data: Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({"standard":"yap-steward","version":"1.0.0","event":event,"data":[data]})
    ));
}

#[near]
impl Steward {
    #[init]
    pub fn new(config: Config) -> Self {
        require!(config.min_tier >= 1 && config.min_tier <= 4, "bad tier");
        require!(
            config.season_epochs > 0 && config.epoch_secs > 0,
            "bad season"
        );
        require!(
            config.grant_cap.0 > 0 && config.grant_cap.0 <= config.period_budget.0,
            "bad caps"
        );
        require!(
            !config.role.is_empty() && config.role.len() <= 32,
            "bad role"
        );
        Self {
            config,
            members: IterableMap::new(b"m"),
            grants: Vector::new(b"g"),
            spent: LookupMap::new(b"s"),
        }
    }

    // ---------- views ----------
    pub fn get_config(&self) -> Config {
        self.config.clone()
    }
    pub fn current_epoch(&self) -> u32 {
        let now = env::block_timestamp() / 1_000_000_000;
        (now.saturating_sub(self.config.genesis_ts) / self.config.epoch_secs) as u32
    }
    pub fn period_of(&self, epoch: u32) -> u32 {
        epoch / self.config.season_epochs
    }
    pub fn get_members(&self) -> Vec<(AccountId, Member)> {
        self.members
            .iter()
            .map(|(a, m)| (a.clone(), m.clone()))
            .collect()
    }
    pub fn get_member(&self, account: AccountId) -> Option<Member> {
        self.members.get(&account).cloned()
    }
    pub fn is_active(&self, account: AccountId) -> bool {
        self.members
            .get(&account)
            .map(|m| m.expires_epoch >= self.current_epoch())
            .unwrap_or(false)
    }
    pub fn get_grants(&self, from: u32, limit: u32) -> Vec<Grant> {
        (from..self.grants.len().min(from.saturating_add(limit)))
            .filter_map(|i| self.grants.get(i).cloned())
            .collect()
    }
    pub fn get_spent(&self, period: u32) -> U128 {
        U128(self.spent.get(&period).copied().unwrap_or(0))
    }

    // ---------- promote ----------
    /// Prove `account` had tier >= min_tier in finalized epoch `e` (its yapper leaf + Merkle proof).
    pub fn promote(
        &mut self,
        account: AccountId,
        e: u32,
        amount: U128,
        score: u64,
        tier: u8,
        proof: Vec<String>,
    ) -> Promise {
        require!(tier >= self.config.min_tier && tier <= 4, "tier too low");
        require!(
            e.saturating_add(self.config.season_epochs) > self.current_epoch(),
            "proof epoch too old"
        );
        require!(proof.len() <= 32, "proof too long");
        Promise::new(self.config.yap.clone())
            .function_call(
                "get_epoch".to_string(),
                serde_json::to_vec(&json!({"e":e})).unwrap(),
                NearToken::from_yoctonear(0),
                GAS_VIEW,
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CB)
                    .on_epoch(account, e, amount, score, tier, proof),
            )
    }

    #[private]
    pub fn on_epoch(
        &mut self,
        account: AccountId,
        e: u32,
        amount: U128,
        score: u64,
        tier: u8,
        proof: Vec<String>,
        #[callback_result] epoch: Result<Value, PromiseError>,
    ) -> Option<Promise> {
        let epoch = epoch.expect("could not read the YAP epoch");
        require!(epoch["status"] == "Finalized", "epoch not finalized");
        let root = epoch["report"]["yappers_root"].as_str().expect("no report");
        let leaf = merkle::yapper_leaf(e, account.as_str(), amount.0, score, tier);
        require!(merkle::verify(&leaf, &proof, root), "bad proof");
        let expires = e.saturating_add(self.config.season_epochs);
        let cur = self.current_epoch();
        if let Some(m) = self.members.get_mut(&account) {
            // Already a member: a newer proof only extends the season. No DAO proposal needed.
            m.expires_epoch = m.expires_epoch.max(expires);
            m.proof_epoch = m.proof_epoch.max(e);
            m.tier = tier;
            m.score = score;
            emit(
                "extended",
                json!({"account":account,"expires_epoch":expires}),
            );
            return None;
        }
        self.members.insert(
            account.clone(),
            Member {
                since_epoch: cur,
                proof_epoch: e,
                expires_epoch: expires,
                tier,
                score,
                add_proposal: None,
            },
        );
        emit(
            "promoted",
            json!({"account":account,"epoch":e,"tier":tier,"expires_epoch":expires}),
        );
        let kind = json!({"AddMemberToRole":{"member_id":account,"role":self.config.role}});
        Some(self.file_and_approve(kind, format!("YAP steward: {account} reached tier {tier} in epoch {e} (proof verified against the finalized YAP root). Adds them to role '{}' until epoch {expires}.", self.config.role), Action::Add(account)))
    }

    // ---------- demote ----------
    /// Anyone can remove a member whose season has ended.
    pub fn demote(&mut self, account: AccountId) -> Promise {
        let m = self.members.get(&account).cloned().expect("not a member");
        require!(m.expires_epoch < self.current_epoch(), "season not over");
        self.members.remove(&account);
        emit("demoted", json!({"account":account}));
        let kind = json!({"RemoveMemberFromRole":{"member_id":account,"role":self.config.role}});
        self.file_and_approve(
            kind,
            format!(
                "YAP steward: {account}'s season ended at epoch {}; removes them from role '{}'.",
                m.expires_epoch, self.config.role
            ),
            Action::Remove,
        )
    }

    // ---------- grant ----------
    /// An active trusted member sends a small YAP grant from the DAO treasury. Attach >= 0.00125 NEAR so the
    /// receiver's YAP storage can be registered.
    #[payable]
    pub fn grant(&mut self, receiver: AccountId, amount: U128, memo: String) -> Promise {
        let by = env::predecessor_account_id();
        require!(
            self.is_active(by.clone()),
            "only active trusted members can grant"
        );
        require!(by != receiver, "no self grants");
        require!(
            amount.0 > 0 && amount.0 <= self.config.grant_cap.0,
            "over the per-grant cap; use a council proposal"
        );
        require!(memo.len() <= 280, "memo too long");
        require!(
            env::attached_deposit() >= STORAGE_DEPOSIT,
            "attach 0.00125 NEAR for storage"
        );
        let cur = self.current_epoch();
        let period = self.period_of(cur);
        let spent = self.spent.get(&period).copied().unwrap_or(0) + amount.0;
        require!(
            spent <= self.config.period_budget.0,
            "season grant budget used up"
        );
        self.spent.insert(period, spent);
        let id = self.grants.len();
        self.grants.push(Grant {
            id,
            by: by.clone(),
            receiver: receiver.clone(),
            amount,
            memo: memo.clone(),
            epoch: cur,
            proposal: None,
            status: "Pending".into(),
        });
        emit(
            "grant",
            json!({"id":id,"by":by,"receiver":receiver,"amount":amount}),
        );
        let kind = json!({"Transfer":{"token_id":self.config.yap,"receiver_id":receiver,"amount":amount,"msg":null}});
        // Register the receiver on the YAP token first (no-op if already registered), then file + approve.
        let description = format!("YAP steward grant #{id}: {by} (trusted member) sends {} raw YAP units to {receiver}: {memo}", amount.0);
        Promise::new(self.config.yap.clone())
            .function_call(
                "storage_deposit".to_string(),
                serde_json::to_vec(&json!({"account_id":receiver,"registration_only":true}))
                    .unwrap(),
                STORAGE_DEPOSIT,
                GAS_VIEW,
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CB)
                    .after_storage(kind, description, id),
            )
    }

    #[private]
    pub fn after_storage(&mut self, kind: Value, description: String, id: u32) -> Promise {
        self.file_and_approve(kind, description, Action::Grant(id))
    }

    // ---------- DAO plumbing ----------
    #[private]
    pub fn on_added(
        &mut self,
        kind: Value,
        action: Action,
        #[callback_result] id: Result<u64, PromiseError>,
    ) -> Option<Promise> {
        let Ok(id) = id else {
            self.rollback(&action);
            return None;
        };
        match &action {
            Action::Add(a) => {
                if let Some(m) = self.members.get_mut(a) {
                    m.add_proposal = Some(id);
                }
            }
            Action::Grant(g) => {
                if let Some(x) = self.grants.get_mut(*g) {
                    x.proposal = Some(id);
                }
            }
            Action::Remove => {}
        }
        Some(
            Promise::new(self.config.dao.clone())
                .function_call(
                    "act_proposal".to_string(),
                    serde_json::to_vec(&json!({"id":id,"action":"VoteApprove","proposal":kind}))
                        .unwrap(),
                    NearToken::from_yoctonear(0),
                    GAS_ACT,
                )
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(GAS_CB_ACT)
                        .on_voted(action),
                ),
        )
    }

    #[private]
    pub fn on_voted(&mut self, action: Action, #[callback_result] r: Result<(), PromiseError>) {
        if let Action::Grant(g) = action {
            if let Some(x) = self.grants.get_mut(g) {
                x.status = if r.is_ok() {
                    "Approved".into()
                } else {
                    "Failed".into()
                };
            }
        }
        if r.is_err() {
            emit("vote_failed", json!({}));
        }
    }
}

#[near(serializers = [json])]
pub enum Action {
    Add(AccountId),
    Remove,
    Grant(u32),
}

impl Steward {
    fn file_and_approve(&self, kind: Value, description: String, action: Action) -> Promise {
        Promise::new(self.config.dao.clone())
            .function_call(
                "add_proposal".to_string(),
                serde_json::to_vec(&json!({"proposal":{"description":description,"kind":kind}}))
                    .unwrap(),
                NearToken::from_yoctonear(self.config.proposal_bond.0),
                GAS_ADD,
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(
                        GAS_ACT
                            .saturating_add(GAS_CB_ACT)
                            .saturating_add(Gas::from_tgas(15)),
                    )
                    .on_added(kind, action),
            )
    }
    fn rollback(&mut self, action: &Action) {
        match action {
            Action::Add(a) => {
                self.members.remove(a);
            }
            Action::Grant(g) => {
                let Some((epoch, amount)) = self.grants.get(*g).map(|x| (x.epoch, x.amount.0))
                else {
                    return;
                };
                let period = self.period_of(epoch);
                let spent = self
                    .spent
                    .get(&period)
                    .copied()
                    .unwrap_or(0)
                    .saturating_sub(amount);
                self.spent.insert(period, spent);
                if let Some(x) = self.grants.get_mut(*g) {
                    x.status = "Failed".into();
                }
            }
            Action::Remove => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    fn cfg() -> Config {
        Config {
            yap: "yap.near".parse().unwrap(),
            dao: "dao.near".parse().unwrap(),
            role: "trusted".into(),
            min_tier: 3,
            season_epochs: 6,
            genesis_ts: 1000,
            epoch_secs: 600,
            grant_cap: U128(300),
            period_budget: U128(1000),
            proposal_bond: U128(1),
        }
    }
    fn at(secs: u64, who: &str, deposit: u128) {
        let mut b = VMContextBuilder::new();
        b.block_timestamp(secs * 1_000_000_000)
            .predecessor_account_id(who.parse().unwrap())
            .attached_deposit(NearToken::from_yoctonear(deposit));
        testing_env!(b.build());
    }

    #[test]
    fn epoch_clock() {
        at(1000 + 600 * 7 + 5, "a.near", 0);
        let s = Steward::new(cfg());
        assert_eq!(s.current_epoch(), 7);
        assert_eq!(s.period_of(7), 1);
    }
    #[test]
    #[should_panic(expected = "tier too low")]
    fn promote_needs_tier() {
        at(1000, "a.near", 0);
        let mut s = Steward::new(cfg());
        let _ = s.promote("x.near".parse().unwrap(), 0, U128(1), 1, 2, vec![]);
    }
    #[test]
    #[should_panic(expected = "proof epoch too old")]
    fn promote_needs_fresh_proof() {
        at(1000 + 600 * 20, "a.near", 0);
        let mut s = Steward::new(cfg());
        let _ = s.promote("x.near".parse().unwrap(), 2, U128(1), 1, 3, vec![]);
    }
    #[test]
    #[should_panic(expected = "only active trusted members can grant")]
    fn grant_needs_membership() {
        at(1000, "a.near", 1_250_000_000_000_000_000_000);
        let mut s = Steward::new(cfg());
        let _ = s.grant("b.near".parse().unwrap(), U128(10), "thanks".into());
    }
    #[test]
    fn grant_caps_and_budget() {
        at(1000, "a.near", 1_250_000_000_000_000_000_000);
        let mut s = Steward::new(cfg());
        s.members.insert(
            "a.near".parse().unwrap(),
            Member {
                since_epoch: 0,
                proof_epoch: 0,
                expires_epoch: 6,
                tier: 3,
                score: 1,
                add_proposal: None,
            },
        );
        let _ = s.grant("b.near".parse().unwrap(), U128(300), "one".into());
        let _ = s.grant("c.near".parse().unwrap(), U128(300), "two".into());
        let _ = s.grant("d.near".parse().unwrap(), U128(300), "three".into());
        assert_eq!(s.get_spent(0).0, 900);
        let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            s.grant("e.near".parse().unwrap(), U128(200), "four".into())
        }));
        assert!(r.is_err(), "budget must cap the season");
    }
    #[test]
    #[should_panic(expected = "over the per-grant cap")]
    fn grant_cap() {
        at(1000, "a.near", 1_250_000_000_000_000_000_000);
        let mut s = Steward::new(cfg());
        s.members.insert(
            "a.near".parse().unwrap(),
            Member {
                since_epoch: 0,
                proof_epoch: 0,
                expires_epoch: 6,
                tier: 3,
                score: 1,
                add_proposal: None,
            },
        );
        let _ = s.grant("b.near".parse().unwrap(), U128(301), "big".into());
    }
    #[test]
    #[should_panic(expected = "season not over")]
    fn demote_waits_for_season() {
        at(1000 + 600 * 3, "a.near", 0);
        let mut s = Steward::new(cfg());
        s.members.insert(
            "x.near".parse().unwrap(),
            Member {
                since_epoch: 0,
                proof_epoch: 0,
                expires_epoch: 6,
                tier: 3,
                score: 1,
                add_proposal: None,
            },
        );
        let _ = s.demote("x.near".parse().unwrap());
    }
    #[test]
    fn rollback_refunds_budget() {
        at(1000, "a.near", 1_250_000_000_000_000_000_000);
        let mut s = Steward::new(cfg());
        s.members.insert(
            "a.near".parse().unwrap(),
            Member {
                since_epoch: 0,
                proof_epoch: 0,
                expires_epoch: 6,
                tier: 3,
                score: 1,
                add_proposal: None,
            },
        );
        let _ = s.grant("b.near".parse().unwrap(), U128(300), "one".into());
        s.rollback(&Action::Grant(0));
        assert_eq!(s.get_spent(0).0, 0);
        assert_eq!(s.get_grants(0, 5)[0].status, "Failed");
    }
}
