use crate::*;

#[near]
impl Yap {
    pub fn claim_arena(
        &mut self,
        arena_id: u32,
        e: u32,
        amount: U128,
        proof: Vec<String>,
        yapper_amount: U128,
        score: u64,
        tier: u8,
        yapper_proof: Vec<String>,
    ) -> Option<Promise> {
        let caller = account();
        let epoch = self.claimable_epoch(e);
        let arena = self.get_arena(arena_id).expect("arena missing");
        require!(
            !arena.closed && e >= arena.start_epoch && e < arena.start_epoch + arena.epochs,
            "arena inactive"
        );
        require!(tier >= arena.min_tier && tier <= 4, "tier too low");
        let report = epoch.report.as_ref().expect("report missing");
        let yapper_leaf = merkle::yapper_leaf(e, caller.as_str(), yapper_amount.0, score, tier);
        require!(
            merkle::verify(&yapper_leaf, &yapper_proof, &report.yappers_root),
            "bad tier proof"
        );
        let root = report
            .arenas
            .iter()
            .find(|root| root.arena_id == arena_id)
            .expect("arena root missing");
        let leaf = merkle::arena_leaf(arena_id, e, caller.as_str(), amount.0);
        require!(merkle::verify(&leaf, &proof, &root.root), "bad arena proof");
        let key = format!("{arena_id}:{e}:{caller}");
        require!(
            !self.arena_claims.get(&key).unwrap_or(false),
            "arena already claimed"
        );
        let pool_key = format!("{arena_id}:{e}");
        let paid = add(self.arena_paid.get(&pool_key).unwrap_or(0), amount.0);
        require!(paid <= arena.per_epoch.0, "arena allocation exceeded");
        self.arena_paid.insert(&pool_key, &paid);
        self.arena_claims.insert(&key, &true);
        self.pay_arena(&arena, &caller, amount.0, Some((arena_id, e, key)))
    }

    pub fn close_arena(&mut self, id: u32) -> Option<Promise> {
        let mut arena = self.get_arena(id).expect("arena missing");
        require!(!arena.closed, "already closed");
        require!(
            self.current_epoch()
                > arena
                    .start_epoch
                    .saturating_add(arena.epochs)
                    .saturating_add(self.config.claim_epochs),
            "arena claim window open"
        );
        arena.closed = true;
        let refund = arena.budget_left.0;
        arena.budget_left = U128(0);
        self.arenas.insert(&id, &arena);
        events::emit("arena_closed", json!({"id":id,"refund":U128(refund)}));
        self.pay_arena(&arena, &arena.opener, refund, None)
    }

    #[private]
    pub fn on_arena_payout(
        &mut self,
        id: u32,
        e: Option<u32>,
        claimant: Option<AccountId>,
        amount: U128,
    ) {
        if env::promise_result_checked(0, 4096).is_ok() {
            let arena = self.get_arena(id).expect("arena missing");
            events::emit(
                "arena_paid",
                json!({"id":id,"to":claimant.unwrap_or(arena.opener),"amount":amount}),
            );
            return;
        }
        let mut arena = self.get_arena(id).expect("arena missing");
        arena.budget_left.0 = add(arena.budget_left.0, amount.0);
        if let (Some(e), Some(claimant)) = (e, claimant) {
            let key = format!("{id}:{e}:{claimant}");
            self.arena_claims.remove(&key);
            let pool_key = format!("{id}:{e}");
            let paid = sub(self.arena_paid.get(&pool_key).unwrap_or(0), amount.0);
            self.arena_paid.insert(&pool_key, &paid);
        } else {
            arena.closed = false;
        }
        self.arenas.insert(&id, &arena);
        events::emit("arena_payout_failed", json!({"id":id,"amount":amount}));
    }
}

impl Yap {
    pub(crate) fn open_arena_internal(
        &mut self,
        sender: AccountId,
        token: AccountId,
        amount: u128,
        topic: String,
        per_epoch: U128,
        epochs: u32,
        min_tier: u8,
        title: String,
    ) {
        require!(
            self.config.accepted_arena_tokens.contains(&token) || token == self_id(),
            "arena token not accepted"
        );
        require!(
            topic.len() > 1 && topic.len() <= 100 && title.len() <= 150,
            "bad arena text"
        );
        require!(
            epochs > 0 && epochs <= 365 && per_epoch.0 > 0 && min_tier <= 4,
            "bad arena parameters"
        );
        require!(
            mul(per_epoch.0, epochs as u128) == amount,
            "wrong arena budget"
        );
        let id = self.next_arena;
        self.next_arena = self.next_arena.checked_add(1).expect("arena id overflow");
        let arena = Arena {
            id,
            opener: sender,
            token,
            topic,
            title,
            min_tier,
            per_epoch,
            start_epoch: self.current_epoch().saturating_add(1),
            epochs,
            budget_left: U128(amount),
            closed: false,
        };
        self.arenas.insert(&id, &arena);
        events::emit("arena_opened", json!({"id":id,"arena":arena}));
    }

    fn pay_arena(
        &mut self,
        arena: &Arena,
        recipient: &AccountId,
        amount: u128,
        claim: Option<(u32, u32, String)>,
    ) -> Option<Promise> {
        if amount == 0 {
            return None;
        }
        // For claims, budget is debited here. close_arena debits before invoking this method.
        if claim.is_some() {
            let mut changed = self.get_arena(arena.id).expect("arena missing");
            changed.budget_left.0 = sub(changed.budget_left.0, amount);
            self.arenas.insert(&arena.id, &changed);
        }
        if arena.token == self_id() {
            self.token
                .internal_transfer(&self_id(), recipient, amount, None);
            events::emit(
                "arena_paid",
                json!({"id":arena.id,"to":recipient,"amount":U128(amount)}),
            );
            None
        } else {
            let e = claim.as_ref().map(|(_, e, _)| *e);
            let claimant = if claim.is_some() {
                Some(recipient.clone())
            } else {
                None
            };
            let args = serde_json::to_vec(&json!({"receiver_id":recipient,"amount":U128(amount)}))
                .unwrap();
            let callback = serde_json::to_vec(
                &json!({"id":arena.id,"e":e,"claimant":claimant,"amount":U128(amount)}),
            )
            .unwrap();
            Some(
                Promise::new(arena.token.clone())
                    .function_call("ft_transfer", args, ONE_YOCTO, GAS_FT)
                    .then(Promise::new(self_id()).function_call(
                        "on_arena_payout",
                        callback,
                        NearToken::from_yoctonear(0),
                        GAS_CALLBACK,
                    )),
            )
        }
    }
}
