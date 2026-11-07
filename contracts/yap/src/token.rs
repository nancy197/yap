use crate::*;
use near_contract_standards::fungible_token::core::FungibleTokenCore;
use near_contract_standards::fungible_token::events::{FtBurn, FtMint};
use near_contract_standards::fungible_token::metadata::FungibleTokenMetadataProvider;
use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_contract_standards::fungible_token::resolver::FungibleTokenResolver;
use near_contract_standards::storage_management::{
    StorageBalance, StorageBalanceBounds, StorageManagement,
};

#[near]
impl FungibleTokenCore for Yap {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.token.ft_transfer(receiver_id, amount, memo);
    }
    #[payable]
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        self.token.ft_transfer_call(receiver_id, amount, memo, msg)
    }
    fn ft_total_supply(&self) -> U128 {
        self.token.ft_total_supply()
    }
    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.token.ft_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenResolver for Yap {
    #[private]
    fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        let (used, burned) =
            self.token
                .internal_ft_resolve_transfer(&sender_id, receiver_id, amount);
        if burned > 0 {
            self.on_tokens_burned(sender_id, burned);
        }
        U128(used)
    }
}

#[near]
impl StorageManagement for Yap {
    #[payable]
    fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        let beneficiary = account_id.clone().unwrap_or_else(account);
        let balance = self.token.storage_deposit(account_id, registration_only);
        events::emit(
            "storage_deposit",
            json!({"account":beneficiary,"balance":balance}),
        );
        balance
    }
    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        let balance = self.token.storage_withdraw(amount);
        events::emit(
            "storage_withdraw",
            json!({"account":account(),"balance":balance}),
        );
        balance
    }
    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        let caller = account();
        require!(
            caller != self_id() && caller != self.config.dao,
            "protected account"
        );
        let stake = self.get_stake(caller.clone());
        require!(
            stake.amount.0 == 0 && stake.pending_unstake.0 == 0 && stake.rewards.0 == 0,
            "active stake or rewards"
        );
        require!(
            self.get_scorer(caller.clone()).bond.0 == 0,
            "active scorer bond"
        );
        require!(
            !self.challenges.iter().any(|(_, c)| c.challenger == caller
                && matches!(
                    c.status,
                    ChallengeStatus::Open | ChallengeStatus::ProposalPending
                )),
            "active challenge"
        );
        require!(
            !self
                .arenas
                .iter()
                .any(|(_, a)| a.opener == caller && a.token == self_id() && !a.closed),
            "active YAP arena"
        );
        if let Some((account, balance)) = self.token.internal_storage_unregister(force) {
            self.on_account_closed(account.clone(), balance);
            events::emit(
                "storage_unregister",
                json!({"account":account,"burned":U128(balance)}),
            );
            true
        } else {
            false
        }
    }
    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }
    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenMetadataProvider for Yap {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        self.metadata.clone()
    }
}

#[near]
impl FungibleTokenReceiver for Yap {
    fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        let token = account();
        let value: serde_json::Value =
            serde_json::from_str(&msg).expect("invalid transfer message");
        require!(
            value.as_object().map(|o| o.len()) == Some(1),
            "one transfer action required"
        );
        if value.get("stake").is_some() {
            require!(token == self_id(), "stake requires YAP");
            self.add_stake(sender_id, amount.0);
        } else if value.get("scorer_bond").is_some() {
            require!(token == self_id(), "bond requires YAP");
            require!(self.config.scorers.contains(&sender_id), "not a scorer");
            let mut scorer = self.get_scorer(sender_id.clone());
            scorer.bond.0 = add(scorer.bond.0, amount.0);
            self.scorers.insert(&sender_id, &scorer);
            events::emit("scorer_bond", json!({"account":sender_id,"amount":amount}));
        } else if let Some(v) = value.get("challenge") {
            require!(token == self_id(), "challenge requires YAP");
            let e: u32 =
                serde_json::from_value(v.get("epoch").cloned().expect("epoch required")).unwrap();
            let reason: String =
                serde_json::from_value(v.get("reason_uri").cloned().expect("reason required"))
                    .unwrap();
            let _ = self.open_challenge(sender_id, e, reason, amount.0);
        } else if let Some(v) = value.get("open_arena") {
            let topic: String =
                serde_json::from_value(v.get("topic").cloned().expect("topic required")).unwrap();
            let per_epoch: U128 =
                serde_json::from_value(v.get("per_epoch").cloned().expect("per_epoch required"))
                    .unwrap();
            let epochs: u32 =
                serde_json::from_value(v.get("epochs").cloned().expect("epochs required")).unwrap();
            let min_tier: u8 =
                serde_json::from_value(v.get("min_tier").cloned().expect("min_tier required"))
                    .unwrap();
            let title: String =
                serde_json::from_value(v.get("title").cloned().expect("title required")).unwrap();
            self.open_arena_internal(
                sender_id, token, amount.0, topic, per_epoch, epochs, min_tier, title,
            );
        } else {
            env::panic_str("unknown transfer action");
        }
        PromiseOrValue::Value(U128(0))
    }
}

impl Yap {
    fn on_tokens_burned(&mut self, account_id: AccountId, amount: u128) {
        self.burned_total = add(self.burned_total, amount);
        burn_event(&account_id, amount, "ft_resolve");
        events::emit("burn", json!({"amount":U128(amount),"reason":"ft_resolve"}));
    }
    fn on_account_closed(&mut self, account_id: AccountId, balance: u128) {
        require!(
            account_id != self_id() && account_id != self.config.dao,
            "protected account"
        );
        require!(
            self.get_stake(account_id.clone()).amount.0 == 0,
            "active stake"
        );
        require!(
            self.get_scorer(account_id.clone()).bond.0 == 0,
            "active scorer bond"
        );
        if balance > 0 {
            self.on_tokens_burned(account_id, balance);
        }
    }
}

pub(crate) fn mint_event(to: &AccountId, amount: u128, memo: &str) {
    if amount > 0 {
        FtMint {
            owner_id: to,
            amount: U128(amount),
            memo: Some(memo),
        }
        .emit();
    }
}
pub(crate) fn burn_event(owner: &AccountId, amount: u128, memo: &str) {
    if amount > 0 {
        FtBurn {
            owner_id: owner,
            amount: U128(amount),
            memo: Some(memo),
        }
        .emit();
    }
}
