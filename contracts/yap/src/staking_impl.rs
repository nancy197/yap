use crate::*;

#[near]
impl Yap {
    pub fn unstake(&mut self, amount: U128) {
        require!(amount.0 > 0, "zero unstake");
        let caller = account();
        let mut stake = self.get_stake(caller.clone());
        stake.amount.0 = sub(stake.amount.0, amount.0);
        stake.positions.push(staking::StakePosition {
            epoch: self.current_epoch(),
            amount: stake.amount,
        });
        stake.pending_unstake.0 = add(stake.pending_unstake.0, amount.0);
        let withdraw_at = self
            .current_epoch()
            .saturating_add(self.config.unbond_epochs);
        stake.unbonds.push(staking::Unbond {
            amount,
            withdraw_at,
        });
        stake.withdraw_at = stake
            .unbonds
            .iter()
            .map(|u| u.withdraw_at)
            .min()
            .unwrap_or(0);
        self.stakes.insert(&caller, &stake);
        events::emit(
            "unstake",
            json!({"account":caller,"amount":amount,"withdraw_at":withdraw_at}),
        );
    }

    pub fn withdraw(&mut self) {
        let caller = account();
        let mut stake = self.get_stake(caller.clone());
        let current = self.current_epoch();
        let mut amount = 0;
        stake.unbonds.retain(|u| {
            if u.withdraw_at <= current {
                amount = add(amount, u.amount.0);
                false
            } else {
                true
            }
        });
        require!(amount > 0, "unstake not ready");
        stake.pending_unstake.0 = sub(stake.pending_unstake.0, amount);
        stake.withdraw_at = stake
            .unbonds
            .iter()
            .map(|u| u.withdraw_at)
            .min()
            .unwrap_or(0);
        self.stakes.insert(&caller, &stake);
        self.token
            .internal_transfer(&self_id(), &caller, amount, None);
        events::emit("withdraw", json!({"account":caller,"amount":U128(amount)}));
    }

    pub fn claim_staker_rewards(&mut self) {
        let caller = account();
        let mut stake = self.get_stake(caller.clone());
        require!(stake.rewards.0 > 0, "no rewards");
        let amount = stake.rewards.0;
        stake.rewards = U128(0);
        self.stakes.insert(&caller, &stake);
        self.token
            .internal_transfer(&self_id(), &caller, amount, None);
        events::emit(
            "staker_claim",
            json!({"account":caller,"amount":U128(amount)}),
        );
    }
}

impl Yap {
    pub(crate) fn add_stake(&mut self, sender: AccountId, amount: u128) {
        require!(amount > 0, "zero stake");
        let mut stake = self.get_stake(sender.clone());
        stake.amount.0 = add(stake.amount.0, amount);
        stake.positions.push(staking::StakePosition {
            epoch: self.current_epoch(),
            amount: stake.amount,
        });
        stake.eligible_from = self.current_epoch().saturating_add(1);
        self.stakes.insert(&sender, &stake);
        events::emit("stake", json!({"account":sender,"amount":U128(amount)}));
    }

    pub(crate) fn distribute_staker(&mut self, e: u32, pool: u128) {
        if pool == 0 {
            return;
        }
        let accounts: Vec<_> = self
            .stakes
            .iter()
            .map(|(id, stake)| (id.clone(), stake.whole_epoch_amount(e)))
            .filter(|(_, amount)| *amount > 0)
            .collect();
        let total = accounts
            .iter()
            .fold(0u128, |sum, (_, amount)| add(sum, *amount));
        if total == 0 {
            self.burn_from_contract(pool, "no_eligible_stakers");
            return;
        }
        self.reward_per_share = add(self.reward_per_share, mul(pool, SCALE) / total);
        let mut assigned = 0u128;
        for (index, (id, amount)) in accounts.iter().enumerate() {
            let reward = if index + 1 == accounts.len() {
                sub(pool, assigned)
            } else {
                mul(pool, *amount) / total
            };
            assigned = add(assigned, reward);
            let mut stake = self.get_stake(id.clone());
            stake.rewards.0 = add(stake.rewards.0, reward);
            self.stakes.insert(id, &stake);
            events::emit(
                "staker_reward",
                json!({"epoch":e,"account":id,"amount":U128(reward)}),
            );
        }
    }
}
