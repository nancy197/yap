use crate::*;

#[near]
impl Yap {
    pub fn resolve_challenge(&mut self, e: u32, upheld: bool) {
        require!(account() == self.config.dao, "DAO only");
        let mut challenge = self.get_challenge(e).expect("challenge missing");
        require!(
            matches!(
                challenge.status,
                ChallengeStatus::Open | ChallengeStatus::ProposalPending
            ),
            "challenge settled"
        );
        let mut epoch = self.get_epoch(e).expect("epoch missing");
        require!(
            epoch.status == EpochStatus::Challenged,
            "epoch not challenged"
        );
        if upheld {
            let mut slash_total = 0u128;
            for signer in &epoch.signers {
                let mut scorer = self.get_scorer(signer.clone());
                let slash = scorer.bond.0.min(self.config.scorer_bond.0);
                scorer.bond.0 = sub(scorer.bond.0, slash);
                scorer.slashed.0 = add(scorer.slashed.0, slash);
                self.scorers.insert(signer, &scorer);
                slash_total = add(slash_total, slash);
                events::emit(
                    "scorer_slashed",
                    json!({"epoch":e,"scorer":signer,"amount":U128(slash)}),
                );
            }
            let half = slash_total / 2;
            self.token.internal_transfer(
                &self_id(),
                &challenge.challenger,
                add(challenge.bond.0, half),
                None,
            );
            self.burn_from_contract(sub(slash_total, half), "scorer_slash");
            for signer in &self.config.scorers {
                self.votes.remove(&format!("{e}:{signer}"));
            }
            epoch.status = EpochStatus::Discarded;
            epoch.report = None;
            epoch.report_hash = None;
            epoch.signers.clear();
            challenge.status = ChallengeStatus::Upheld;
        } else {
            self.burn_from_contract(challenge.bond.0, "rejected_challenge");
            epoch.status = EpochStatus::Proposed;
            challenge.status = ChallengeStatus::Rejected;
        }
        self.epochs.insert(&e, &epoch);
        self.challenges.insert(&e, &challenge);
        events::emit("challenge_resolved", json!({"epoch":e,"upheld":upheld}));
    }

    pub fn expire_challenge(&self, e: u32) -> Promise {
        let challenge = self.get_challenge(e).expect("challenge missing");
        require!(
            matches!(
                challenge.status,
                ChallengeStatus::Open | ChallengeStatus::ProposalPending
            ),
            "challenge settled"
        );
        require!(
            now() > challenge.opened_at + self.config.challenge_secs * 4 * 1_000_000_000,
            "not expired"
        );
        let id = challenge.proposal_id.expect("proposal pending");
        Promise::new(self.config.dao.clone())
            .function_call(
                "get_proposal",
                serde_json::to_vec(&json!({"id":id})).unwrap(),
                NearToken::from_yoctonear(0),
                GAS_DAO,
            )
            .then(Promise::new(self_id()).function_call(
                "on_expire_challenge",
                serde_json::to_vec(&json!({"e":e})).unwrap(),
                NearToken::from_yoctonear(0),
                GAS_CALLBACK,
            ))
    }

    #[private]
    pub fn on_expire_challenge(&mut self, e: u32) {
        let status = match env::promise_result_checked(0, 4096) {
            Ok(bytes) => serde_json::from_slice::<serde_json::Value>(&bytes)
                .ok()
                .and_then(|v| v.get("status").and_then(|x| x.as_str()).map(str::to_owned)),
            Err(_) => None,
        };
        require!(
            matches!(status.as_deref(), Some("Rejected" | "Removed" | "Expired")),
            "DAO proposal not rejected"
        );
        // A DAO callback cannot impersonate the DAO; use the same settlement path internally.
        self.settle_rejected(e);
    }

    #[private]
    pub fn on_proposal(&mut self, e: u32) {
        let mut challenge = self.get_challenge(e).expect("challenge missing");
        require!(
            challenge.status == ChallengeStatus::ProposalPending,
            "proposal not pending"
        );
        match env::promise_result_checked(0, 4096) {
            Ok(bytes) => {
                let id: u64 = serde_json::from_slice(&bytes).expect("DAO proposal id");
                challenge.proposal_id = Some(id);
                challenge.status = ChallengeStatus::Open;
                self.challenges.insert(&e, &challenge);
                events::emit("challenge_proposal", json!({"epoch":e,"proposal_id":id}));
            }
            Err(_) => {
                self.token.internal_transfer(
                    &self_id(),
                    &challenge.challenger,
                    challenge.bond.0,
                    None,
                );
                self.challenges.remove(&e);
                let mut epoch = self.get_epoch(e).expect("epoch missing");
                epoch.status = EpochStatus::Proposed;
                self.epochs.insert(&e, &epoch);
                events::emit("challenge_proposal_failed", json!({"epoch":e}));
            }
        }
    }
}

impl Yap {
    pub(crate) fn open_challenge(
        &mut self,
        challenger: AccountId,
        e: u32,
        reason_uri: String,
        amount: u128,
    ) -> Promise {
        require!(
            amount == self.config.challenge_bond.0,
            "wrong challenge bond"
        );
        uri_ok(&reason_uri);
        let mut epoch = self.get_epoch(e).expect("epoch missing");
        require!(epoch.status == EpochStatus::Proposed, "epoch not proposed");
        require!(
            now() < epoch.proposed_at + self.config.challenge_secs * 1_000_000_000,
            "challenge window closed"
        );
        require!(
            self.challenges.get(&e).is_none()
                || self.get_challenge(e).unwrap().status == ChallengeStatus::Upheld,
            "already challenged"
        );
        epoch.status = EpochStatus::Challenged;
        self.epochs.insert(&e, &epoch);
        self.challenges.insert(
            &e,
            &Challenge {
                epoch: e,
                challenger: challenger.clone(),
                bond: U128(amount),
                reason_uri: reason_uri.clone(),
                opened_at: now(),
                proposal_id: None,
                status: ChallengeStatus::ProposalPending,
            },
        );
        let args = base64::engine::general_purpose::STANDARD
            .encode(serde_json::to_vec(&json!({"e":e,"upheld":true})).unwrap());
        let proposal = json!({"proposal":{"description":format!("YAP epoch {e} challenge: {reason_uri}"),
            "kind":{"FunctionCall":{"receiver_id":self_id(),"actions":[{"method_name":"resolve_challenge","args":args,
                "deposit":"0","gas":"50000000000000"}]}}}});
        events::emit(
            "challenge_opened",
            json!({"epoch":e,"challenger":challenger}),
        );
        Promise::new(self.config.dao.clone())
            .function_call(
                "add_proposal",
                serde_json::to_vec(&proposal).unwrap(),
                NearToken::from_yoctonear(self.config.dao_proposal_bond.0),
                GAS_DAO,
            )
            .then(Promise::new(self_id()).function_call(
                "on_proposal",
                serde_json::to_vec(&json!({"e":e})).unwrap(),
                NearToken::from_yoctonear(0),
                GAS_CALLBACK,
            ))
    }

    fn settle_rejected(&mut self, e: u32) {
        let mut challenge = self.get_challenge(e).expect("challenge missing");
        require!(
            matches!(
                challenge.status,
                ChallengeStatus::Open | ChallengeStatus::ProposalPending
            ),
            "challenge settled"
        );
        self.burn_from_contract(challenge.bond.0, "rejected_challenge");
        let mut epoch = self.get_epoch(e).expect("epoch missing");
        epoch.status = EpochStatus::Proposed;
        self.epochs.insert(&e, &epoch);
        challenge.status = ChallengeStatus::Rejected;
        self.challenges.insert(&e, &challenge);
        events::emit("challenge_resolved", json!({"epoch":e,"upheld":false}));
    }
}
