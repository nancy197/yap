use super::*;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{testing_env, PromiseResult};

fn id(s: &str) -> AccountId {
    s.parse().unwrap()
}
fn ctx(who: &str, secs: u64) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(id("yap.testnet"));
    b.predecessor_account_id(id(who));
    b.block_timestamp(secs * 1_000_000_000);
    testing_env!(b.build());
}
fn cfg() -> Config {
    Config {
        epoch_secs: 10,
        genesis_ts: 100,
        base_emission: U128(1_000),
        initial_attention_target: U128(1_000),
        ema_bps: 2_000,
        loud_bps: 8_000,
        max_ratio_bps: 30_000,
        streak_cap: 2,
        streak_step_bps: 500,
        quiet_burn_bps: 300,
        dead_burn_bps: 1_000,
        report_deadline_epochs: 3,
        yapper_bps: 8_000,
        staker_bps: 1_000,
        dao_bps: 1_000,
        claim_epochs: 14,
        scorers: vec![id("s1.testnet"), id("s2.testnet"), id("s3.testnet")],
        scorer_quorum: 2,
        scorer_bond: U128(100),
        challenge_secs: 2,
        challenge_bond: U128(50),
        unbond_epochs: 7,
        dao: id("dao.testnet"),
        dao_proposal_bond: U128(0),
        accepted_arena_tokens: vec![id("usdc.testnet")],
        initial_supply: U128(100_000),
        genesis_split: GenesisSplit {
            reserve_bps: 6_000,
            dao_bps: 2_500,
            deployer_bps: 1_500,
        },
    }
}
fn setup() -> Yap {
    ctx("deployer.testnet", 100);
    let mut y = Yap::new(cfg(), None);
    y.token.internal_register_account(&id("alice.testnet"));
    y
}
fn report(attention: u128, root: String) -> EpochReport {
    EpochReport {
        attention: U128(attention),
        yappers_root: root,
        arenas: vec![],
        labels_hash: hex::encode([2; 32]),
        prompt_hash: None,
        attestation_hash: None,
        data_hash: hex::encode([3; 32]),
        uri: "https://example.test/epoch".into(),
    }
}
fn propose(y: &mut Yap, e: u32, attention: u128, root: String) {
    for (who, secs) in [("s1.testnet", 111), ("s2.testnet", 112)] {
        y.scorers.insert(
            &id(who),
            &Scorer {
                bond: U128(100),
                slashed: U128(0),
            },
        );
        ctx(who, secs);
        y.submit_report(e, report(attention, root.clone()));
    }
}

#[test]
fn genesis_and_loud_quiet_dead() {
    let mut y = setup();
    assert_eq!(y.token.total_supply, 100_000);
    assert_eq!(y.reserve, 60_000);
    assert_eq!(y.token.accounts.get(&id("dao.testnet")), Some(25_000));
    let root = hex::encode([1; 32]);
    propose(&mut y, 0, 1_000, root.clone());
    ctx("any.testnet", 115);
    y.finalize(0);
    assert_eq!(y.streak, 1);
    assert_eq!(y.get_epoch(0).unwrap().emission.0, 1_050);
    assert_eq!(y.attention_target, 1_000);
    ctx("s1.testnet", 121);
    y.submit_report(1, report(100, root.clone()));
    ctx("s2.testnet", 122);
    y.submit_report(1, report(100, root));
    ctx("any.testnet", 125);
    y.finalize(1);
    assert_eq!(y.streak, 0);
    assert_eq!(y.attention_target, 820);
    assert_eq!(y.get_epoch(1).unwrap().emission.0, 100);
    let before = y.reserve;
    ctx("any.testnet", 161);
    y.crank_dead_epoch(2);
    assert_eq!(y.reserve, before - before / 10);
    assert_eq!(y.attention_target, 656);
    assert_eq!(y.get_epoch(2).unwrap().status, EpochStatus::Dead);
    assert!(y.burned_total > 0);
}

#[test]
fn streak_cap_ema_and_claim_burn() {
    let mut y = setup();
    let leaf = merkle::yapper_leaf(0, "alice.testnet", 100, 5, 2);
    propose(&mut y, 0, 3_000, leaf);
    ctx("any.testnet", 115);
    y.finalize(0);
    assert_eq!(y.get_epoch(0).unwrap().emission.0, 3_150);
    assert_eq!(y.attention_target, 1_400);
    ctx("alice.testnet", 116);
    y.claim(0, U128(100), 5, 2, vec![]);
    assert!(y.is_claimed(0, id("alice.testnet")));
    ctx("any.testnet", 251);
    y.burn_unclaimed(0);
    assert!(y.get_epoch(0).unwrap().unclaimed_burned);
}

#[test]
fn challenge_upheld_and_rejected() {
    let mut y = setup();
    y.token
        .internal_transfer(&id("deployer.testnet"), &id("yap.testnet"), 500, None);
    propose(&mut y, 0, 1_000, hex::encode([1; 32]));
    ctx("yap.testnet", 113);
    let _ = y.open_challenge(id("alice.testnet"), 0, "https://reason.test".into(), 50);
    ctx("dao.testnet", 114);
    y.resolve_challenge(0, true);
    assert_eq!(y.get_epoch(0).unwrap().status, EpochStatus::Discarded);
    assert_eq!(y.get_scorer(id("s1.testnet")).slashed.0, 100);
    propose(&mut y, 0, 1_000, hex::encode([4; 32]));
    ctx("yap.testnet", 113);
    let _ = y.open_challenge(id("alice.testnet"), 0, "https://reason.test".into(), 50);
    ctx("dao.testnet", 114);
    y.resolve_challenge(0, false);
    assert_eq!(y.get_epoch(0).unwrap().status, EpochStatus::Proposed);
}

#[test]
fn staking_and_arena_tier_pool() {
    let mut y = setup();
    y.token
        .internal_transfer(&id("deployer.testnet"), &id("yap.testnet"), 1_000, None);
    ctx("yap.testnet", 101);
    y.add_stake(id("alice.testnet"), 100);
    ctx("any.testnet", 111);
    y.distribute_staker(0, 100);
    assert_eq!(y.get_stake(id("alice.testnet")).rewards.0, 0);
    y.distribute_staker(1, 100);
    assert_eq!(y.get_stake(id("alice.testnet")).rewards.0, 100);
    ctx("alice.testnet", 112);
    y.unstake(U128(50));
    ctx("alice.testnet", 182);
    y.withdraw();
    assert_eq!(y.get_stake(id("alice.testnet")).pending_unstake.0, 0);
    ctx("yap.testnet", 101);
    y.open_arena_internal(
        id("alice.testnet"),
        id("yap.testnet"),
        200,
        "#rhea".into(),
        U128(100),
        2,
        2,
        "Rhea".into(),
    );
    assert_eq!(y.get_arena(0).unwrap().budget_left.0, 200);
}

#[test]
fn merkle_shared_vectors() {
    let v: serde_json::Value = serde_json::from_str(include_str!("../tests/vectors.json")).unwrap();
    for x in v["yapper_leaves"].as_array().unwrap() {
        assert_eq!(
            merkle::yapper_leaf(
                x["epoch"].as_u64().unwrap() as u32,
                x["account"].as_str().unwrap(),
                x["amount"].as_str().unwrap().parse().unwrap(),
                x["score"].as_u64().unwrap(),
                x["tier"].as_u64().unwrap() as u8
            ),
            x["expected"].as_str().unwrap()
        );
    }
    for x in v["arena_leaves"].as_array().unwrap() {
        assert_eq!(
            merkle::arena_leaf(
                x["arena_id"].as_u64().unwrap() as u32,
                x["epoch"].as_u64().unwrap() as u32,
                x["account"].as_str().unwrap(),
                x["amount"].as_str().unwrap().parse().unwrap()
            ),
            x["expected"].as_str().unwrap()
        );
    }
    for x in v["nodes"].as_array().unwrap() {
        assert_eq!(
            merkle::node(x["left"].as_str().unwrap(), x["right"].as_str().unwrap()),
            x["expected"].as_str().unwrap()
        );
    }
    for x in v["proofs"].as_array().unwrap() {
        let proof = x["proof"]
            .as_array()
            .unwrap()
            .iter()
            .map(|s| s.as_str().unwrap().to_string())
            .collect::<Vec<_>>();
        assert_eq!(
            merkle::verify(
                x["leaf"].as_str().unwrap(),
                &proof,
                x["root"].as_str().unwrap()
            ),
            x["valid"].as_bool().unwrap()
        );
    }
}

#[test]
fn scorer_quorum_requires_identical_hash_and_streak_caps() {
    let mut y = setup();
    for who in ["s1.testnet", "s2.testnet", "s3.testnet"] {
        y.scorers.insert(
            &id(who),
            &Scorer {
                bond: U128(100),
                slashed: U128(0),
            },
        );
    }
    ctx("s1.testnet", 111);
    y.submit_report(0, report(1_000, hex::encode([1; 32])));
    ctx("s2.testnet", 112);
    y.submit_report(0, report(1_000, hex::encode([2; 32])));
    assert!(y.get_epoch(0).is_none());
    ctx("s3.testnet", 113);
    y.submit_report(0, report(1_000, hex::encode([1; 32])));
    assert_eq!(y.get_epoch(0).unwrap().signers.len(), 2);
    ctx("any.testnet", 116);
    y.finalize(0);
    for e in 1..4 {
        let t = 100 + (e as u64 + 1) * 10;
        ctx("s1.testnet", t + 1);
        y.submit_report(e, report(y.attention_target, hex::encode([1; 32])));
        ctx("s2.testnet", t + 2);
        y.submit_report(e, report(y.attention_target, hex::encode([1; 32])));
        ctx("any.testnet", t + 5);
        y.finalize(e);
    }
    assert_eq!(y.streak, 4);
    assert_eq!(y.best_streak, 4);
    assert_eq!(y.get_epoch(3).unwrap().emission.0, 1_100);
}

#[test]
fn stake_snapshot_survives_late_unstake() {
    let mut y = setup();
    ctx("yap.testnet", 101);
    y.add_stake(id("alice.testnet"), 100);
    ctx("alice.testnet", 121);
    y.unstake(U128(50));
    assert_eq!(y.get_stake(id("alice.testnet")).whole_epoch_amount(1), 100);
    assert_eq!(y.get_stake(id("alice.testnet")).whole_epoch_amount(2), 50);
}

#[test]
fn unbond_tranches_keep_independent_deadlines() {
    let mut y = setup();
    ctx("yap.testnet", 101);
    y.add_stake(id("alice.testnet"), 100);
    ctx("alice.testnet", 111);
    y.unstake(U128(20));
    ctx("alice.testnet", 121);
    y.unstake(U128(30));
    ctx("alice.testnet", 181);
    y.withdraw();
    assert_eq!(y.get_stake(id("alice.testnet")).pending_unstake.0, 30);
    assert_eq!(y.get_stake(id("alice.testnet")).withdraw_at, 9);
    ctx("alice.testnet", 191);
    y.withdraw();
    assert_eq!(y.get_stake(id("alice.testnet")).pending_unstake.0, 0);
}

#[test]
fn dead_epoch_keeps_attention_target_positive() {
    let mut y = setup();
    y.attention_target = 1;
    ctx("any.testnet", 141);
    y.crank_dead_epoch(0);
    assert_eq!(y.attention_target, 1);
}

#[test]
#[should_panic(expected = "tier too low")]
fn arena_tier_gate_rejects_bronze() {
    let mut y = setup();
    let yapper = merkle::yapper_leaf(1, "alice.testnet", 100, 50, 1);
    let arena = merkle::arena_leaf(0, 1, "alice.testnet", 50);
    y.open_arena_internal(
        id("alice.testnet"),
        id("yap.testnet"),
        100,
        "#rhea".into(),
        U128(100),
        1,
        2,
        "Rhea".into(),
    );
    let mut ep = Epoch::new(1);
    ep.status = EpochStatus::Finalized;
    ep.report = Some(EpochReport {
        arenas: vec![ArenaRoot {
            arena_id: 0,
            root: arena,
        }],
        ..report(1_000, yapper)
    });
    y.epochs.insert(&1, &ep);
    ctx("alice.testnet", 121);
    y.claim_arena(0, 1, U128(50), vec![], U128(100), 50, 1, vec![]);
}

#[test]
fn arena_refund_after_claim_window() {
    let mut y = setup();
    y.token
        .internal_transfer(&id("deployer.testnet"), &id("yap.testnet"), 100, None);
    ctx("yap.testnet", 101);
    y.open_arena_internal(
        id("alice.testnet"),
        id("yap.testnet"),
        100,
        "#rhea".into(),
        U128(100),
        1,
        0,
        "Rhea".into(),
    );
    ctx("any.testnet", 271);
    y.close_arena(0);
    assert_eq!(y.get_arena(0).unwrap().budget_left.0, 0);
    assert_eq!(y.token.accounts.get(&id("alice.testnet")), Some(100));
}

#[test]
fn failed_external_arena_payout_restores_claim() {
    let mut y = setup();
    ctx("usdc.testnet", 101);
    y.open_arena_internal(
        id("alice.testnet"),
        id("usdc.testnet"),
        100,
        "#rhea".into(),
        U128(100),
        1,
        2,
        "Rhea".into(),
    );
    let yapper = merkle::yapper_leaf(1, "alice.testnet", 100, 50, 2);
    let arena = merkle::arena_leaf(0, 1, "alice.testnet", 50);
    let mut ep = Epoch::new(1);
    ep.status = EpochStatus::Finalized;
    ep.report = Some(EpochReport {
        arenas: vec![ArenaRoot {
            arena_id: 0,
            root: arena,
        }],
        ..report(1_000, yapper)
    });
    y.epochs.insert(&1, &ep);
    ctx("alice.testnet", 121);
    assert!(y
        .claim_arena(0, 1, U128(50), vec![], U128(100), 50, 2, vec![])
        .is_some());
    assert_eq!(y.get_arena(0).unwrap().budget_left.0, 50);
    let mut b = VMContextBuilder::new();
    b.current_account_id(id("yap.testnet"));
    b.predecessor_account_id(id("yap.testnet"));
    b.block_timestamp(122_000_000_000);
    testing_env!(
        b.build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![PromiseResult::Failed]
    );
    y.on_arena_payout(0, Some(1), Some(id("alice.testnet")), U128(50));
    assert_eq!(y.get_arena(0).unwrap().budget_left.0, 100);
    assert!(!y
        .arena_claims
        .get(&"0:1:alice.testnet".to_string())
        .unwrap_or(false));
}

#[test]
fn rejected_dao_proposal_expires_challenge() {
    let mut y = setup();
    y.token
        .internal_transfer(&id("deployer.testnet"), &id("yap.testnet"), 50, None);
    let mut ep = Epoch::new(0);
    ep.status = EpochStatus::Challenged;
    y.epochs.insert(&0, &ep);
    y.challenges.insert(
        &0,
        &Challenge {
            epoch: 0,
            challenger: id("alice.testnet"),
            bond: U128(50),
            reason_uri: "https://reason.test".into(),
            opened_at: 111_000_000_000,
            proposal_id: Some(1),
            status: ChallengeStatus::Open,
        },
    );
    let mut b = VMContextBuilder::new();
    b.current_account_id(id("yap.testnet"));
    b.predecessor_account_id(id("yap.testnet"));
    b.block_timestamp(121_000_000_000);
    testing_env!(
        b.build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![PromiseResult::Successful(
            serde_json::to_vec(&json!({"status":"Rejected"})).unwrap()
        )]
    );
    y.on_expire_challenge(0);
    assert_eq!(
        y.get_challenge(0).unwrap().status,
        ChallengeStatus::Rejected
    );
    assert_eq!(y.get_epoch(0).unwrap().status, EpochStatus::Proposed);
}
