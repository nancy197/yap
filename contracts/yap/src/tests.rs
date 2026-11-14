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
        max_ratio_bps: 30_000,
        jackpot_bps: 2_000,
        vault_release_bps: 1_000,
        initial_block_threshold: U128(2_500),
        difficulty_bps: 12_500,
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
            vault_bps: 6_000,
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
fn genesis_emission_split_and_dead_tick_burn_nothing() {
    let mut y = setup();
    assert_eq!(y.token.total_supply, 100_000);
    assert_eq!(y.vault, 60_000);
    assert_eq!(y.token.accounts.get(&id("dao.testnet")), Some(25_000));
    let root = hex::encode([1; 32]);
    propose(&mut y, 0, 1_000, root.clone());
    ctx("any.testnet", 115);
    y.finalize(0);
    let e0 = y.get_epoch(0).unwrap();
    // 1_000 minted: 20% to the jackpot, the remaining 800 split 80/10/10.
    assert_eq!(e0.emission.0, 1_000);
    assert_eq!(
        (e0.yapper_pool.0, e0.staker_pool.0, e0.dao_pool.0),
        (640, 80, 80)
    );
    assert_eq!(y.jackpot_pot, 200);
    assert_eq!(
        e0.yapper_pool.0 + e0.staker_pool.0 + e0.dao_pool.0 + y.jackpot_pot,
        e0.emission.0
    );
    assert_eq!((e0.block, e0.jackpot.0), (1, 0));
    assert_eq!(y.block_progress, 1_000);
    assert_eq!(y.attention_target, 1_000);
    ctx("s1.testnet", 121);
    y.submit_report(1, report(100, root.clone()));
    ctx("s2.testnet", 122);
    y.submit_report(1, report(100, root));
    ctx("any.testnet", 125);
    y.finalize(1);
    assert_eq!(y.get_epoch(1).unwrap().emission.0, 100);
    assert_eq!(y.jackpot_pot, 220);
    assert_eq!(y.attention_target, 820);
    assert_eq!(y.block_progress, 1_100);
    // A tick nobody reported burns nothing and adds no progress.
    ctx("any.testnet", 161);
    y.crank_dead_epoch(2);
    assert_eq!(y.get_epoch(2).unwrap().status, EpochStatus::Dead);
    assert_eq!(y.attention_target, 656);
    assert_eq!(
        (y.vault, y.burned_total, y.block_progress),
        (60_000, 0, 1_100)
    );
}

#[test]
fn block_pays_jackpot_raises_difficulty_and_recycles_unclaimed() {
    let mut y = setup();
    let leaf = merkle::yapper_leaf(0, "alice.testnet", 8_000, 5, 2);
    propose(&mut y, 0, 3_000, leaf);
    ctx("any.testnet", 115);
    y.finalize(0);
    // 3_000 attention crosses the 2_500 threshold: pot (600) + 10% of the vault (6_000) pays out in this tick.
    let e0 = y.get_epoch(0).unwrap();
    assert_eq!(e0.emission.0, 3_000);
    assert_eq!(e0.jackpot.0, 6_600);
    assert_eq!(e0.yapper_pool.0, 1_920 + 6_600);
    assert_eq!((y.jackpot_pot, y.vault), (0, 54_000));
    let b = y.get_block(1).unwrap();
    assert_eq!(
        (
            b.start_epoch,
            b.end_epoch,
            b.progress.0,
            b.threshold.0,
            b.payout.0
        ),
        (0, 0, 3_000, 2_500, 6_600)
    );
    assert_eq!(
        (
            y.block_number,
            y.block_start_epoch,
            y.block_progress,
            y.block_threshold
        ),
        (2, 1, 0, 3_125)
    );
    // A leaf that includes a jackpot share is claimed like any other.
    ctx("alice.testnet", 116);
    y.claim(0, U128(8_000), 5, 2, vec![]);
    assert_eq!(y.token.accounts.get(&id("alice.testnet")), Some(8_000));
    // After the claim window the unclaimed 520 goes back into the jackpot instead of burning.
    ctx("any.testnet", 251);
    y.recycle_unclaimed(0);
    assert!(y.get_epoch(0).unwrap().unclaimed_recycled);
    assert_eq!((y.jackpot_pot, y.burned_total), (520, 0));
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
fn resubmitted_report_finalizes_after_upheld_challenge() {
    let mut y = setup();
    y.token
        .internal_transfer(&id("deployer.testnet"), &id("yap.testnet"), 500, None);
    propose(&mut y, 0, 1_000, hex::encode([1; 32]));
    ctx("yap.testnet", 113);
    let _ = y.open_challenge(id("alice.testnet"), 0, "https://reason.test".into(), 50);
    ctx("dao.testnet", 114);
    y.resolve_challenge(0, true);
    // The slashed scorers re-bond (propose re-inserts bonds) and resubmit the honest report.
    propose(&mut y, 0, 1_000, hex::encode([4; 32]));
    ctx("any.testnet", 130);
    y.finalize(0);
    assert_eq!(y.get_epoch(0).unwrap().status, EpochStatus::Finalized);
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
fn scorer_quorum_requires_identical_hash_and_blocks_advance() {
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
    // No streak bonus any more; the first block (2_500) completes in tick 2.
    assert_eq!(y.get_epoch(3).unwrap().emission.0, 1_000);
    assert_eq!(y.get_block(1).unwrap().end_epoch, 2);
    assert_eq!(y.block_number, 2);
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
