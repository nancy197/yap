// End to end with the real Sputnik DAO v2 wasm and the real $YAP token:
// a finalized epoch proves Alice is Gold -> steward adds her to the DAO's `trusted` role (no council vote) ->
// Alice sends a capped grant from the treasury -> an over-cap grant is refused -> after her season, anyone demotes her.
use anyhow::{Context, Result};
use near_workspaces::types::{Gas, NearToken};
use near_workspaces::{network::Sandbox, Account, Contract, Worker};
use serde_json::{json, Value};
use yap::merkle;

const N: u128 = 1_000_000_000_000_000_000_000_000;
fn h(byte: u8) -> String {
    hex::encode([byte; 32])
}
async fn call(a: &Account, c: &str, method: &str, args: Value, deposit: u128) -> Result<Value> {
    let r = a
        .call(&c.parse()?, method)
        .args_json(args)
        .gas(Gas::from_tgas(300))
        .deposit(NearToken::from_yoctonear(deposit))
        .transact()
        .await
        .with_context(|| format!("{method} transaction"))?;
    let r = r.into_result().with_context(|| format!("{method} execution"))?;
    Ok(r.json().unwrap_or(Value::Null))
}
async fn view(c: &Contract, method: &str, args: Value) -> Result<Value> {
    Ok(c.view(method).args_json(args).await?.json()?)
}
async fn advance_to(worker: &Worker<Sandbox>, target_ns: u64) -> Result<()> {
    while worker.view_block().await?.timestamp() < target_ns {
        let now = worker.view_block().await?.timestamp();
        worker.fast_forward(((target_ns - now) / 500_000_000).clamp(1, 50)).await?;
    }
    Ok(())
}
async fn role_members(dao: &Contract, role: &str) -> Result<Vec<String>> {
    let p = view(dao, "get_policy", json!({})).await?;
    let r = p["roles"].as_array().unwrap().iter().find(|r| r["name"] == role).context("role missing")?;
    Ok(r["kind"]["Group"].as_array().unwrap().iter().map(|x| x.as_str().unwrap().to_string()).collect())
}

#[tokio::test]
async fn reputation_becomes_dao_membership_and_grants() -> Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/near");
    let yap_wasm = std::fs::read(format!("{root}/yap/yap.wasm")).context("build yap first")?;
    let st_wasm = std::fs::read(format!("{root}/steward/steward.wasm")).context("cargo near build the steward first")?;
    let dao_wasm = include_bytes!("../../tests/fixtures/sputnikdao2.wasm");
    let token = worker.dev_deploy(&yap_wasm).await?;
    let dao = worker.dev_deploy(dao_wasm).await?;
    let steward = worker.dev_deploy(&st_wasm).await?;
    let council = worker.dev_create_account().await?;
    let deployer = worker.dev_create_account().await?;
    let alice = worker.dev_create_account().await?;
    let bob = worker.dev_create_account().await?;
    let scorers = [worker.dev_create_account().await?, worker.dev_create_account().await?];

    // DAO: council can do everything; the steward role may file and approve member and transfer proposals;
    // the trusted role starts empty and can vote on polls.
    let vp = json!({"weight_kind":"RoleWeight","quorum":"0","threshold":[1,2]});
    let policy = json!({
        "roles":[
            {"name":"all","kind":"Everyone","permissions":["*:AddProposal"],"vote_policy":{}},
            {"name":"council","kind":{"Group":[council.id()]},"permissions":["*:*"],"vote_policy":{}},
            {"name":"steward","kind":{"Group":[steward.id()]},"permissions":["add_member_to_role:AddProposal","add_member_to_role:VoteApprove","remove_member_from_role:AddProposal","remove_member_from_role:VoteApprove","transfer:AddProposal","transfer:VoteApprove"],"vote_policy":{}},
            {"name":"trusted","kind":{"Group":[]},"permissions":["vote:AddProposal","vote:VoteApprove","vote:VoteReject"],"vote_policy":{}}
        ],
        "default_vote_policy":vp,"proposal_bond":(N / 10).to_string(),"proposal_period":"3600000000000",
        "bounty_bond":(N / 10).to_string(),"bounty_forgiveness_period":"86400000000000"});
    call(&council, dao.id().as_str(), "new", json!({"config":{"name":"yap","purpose":"t","metadata":""},"policy":policy}), 0).await?;

    let genesis_ts = worker.view_block().await?.timestamp() / 1_000_000_000;
    let cfg = json!({"epoch_secs":5,"genesis_ts":genesis_ts,"base_emission":"1000","initial_attention_target":"1000",
        "ema_bps":2000,"loud_bps":8000,"max_ratio_bps":30000,"streak_cap":10,"streak_step_bps":500,
        "quiet_burn_bps":300,"dead_burn_bps":1000,"report_deadline_epochs":10,"yapper_bps":8000,"staker_bps":1000,"dao_bps":1000,
        "claim_epochs":14,"scorers":[scorers[0].id(),scorers[1].id()],"scorer_quorum":2,"scorer_bond":"100","challenge_secs":2,
        "challenge_bond":"50","unbond_epochs":7,"dao":dao.id(),"dao_proposal_bond":(N / 10).to_string(),"accepted_arena_tokens":[],
        "initial_supply":"100000","genesis_split":{"reserve_bps":6000,"dao_bps":2500,"deployer_bps":1500}});
    call(&deployer, token.id().as_str(), "new", json!({"config":cfg,"metadata":null}), 0).await?;
    call(&council, steward.id().as_str(), "new", json!({"config":{"yap":token.id(),"dao":dao.id(),"role":"trusted","min_tier":3,
        "season_epochs":4,"genesis_ts":genesis_ts,"epoch_secs":5,"grant_cap":"100","period_budget":"150","proposal_bond":(N / 10).to_string()}}), 0).await?;
    for s in &scorers {
        call(&deployer, token.id().as_str(), "storage_deposit", json!({"account_id":s.id()}), N / 100).await?;
        call(&deployer, token.id().as_str(), "ft_transfer", json!({"receiver_id":s.id(),"amount":"100"}), 1).await?;
        call(s, token.id().as_str(), "ft_transfer_call", json!({"receiver_id":token.id(),"amount":"100","msg":"{\"scorer_bond\":{}}"}), 1).await?;
    }

    // Epoch 0: Alice's leaf says tier 3 (Gold).
    advance_to(&worker, (genesis_ts + 5) * 1_000_000_000).await?;
    let leaf = merkle::yapper_leaf(0, alice.id().as_str(), 100, 42, 3);
    let report = json!({"attention":"1000","yappers_root":leaf,"arenas":[],"labels_hash":h(2),"data_hash":h(3),"uri":"https://x.test/0"});
    for s in &scorers {
        call(s, token.id().as_str(), "submit_report", json!({"e":0,"report":report}), 0).await?;
    }
    let proposed_at = view(&token, "get_epoch", json!({"e":0})).await?["proposed_at"].as_u64().unwrap();
    advance_to(&worker, proposed_at + 2_100_000_000).await?;
    call(&bob, token.id().as_str(), "finalize", json!({"e":0}), 0).await?;

    // A wrong tier fails the proof; the right leaf promotes her with no council vote.
    assert!(call(&bob, steward.id().as_str(), "promote", json!({"account":alice.id(),"e":0,"amount":"100","score":42,"tier":4,"proof":[]}), 0).await.is_err() || !role_members(&dao, "trusted").await?.contains(&alice.id().to_string()));
    call(&bob, steward.id().as_str(), "promote", json!({"account":alice.id(),"e":0,"amount":"100","score":42,"tier":3,"proof":[]}), 0).await?;
    assert!(role_members(&dao, "trusted").await?.contains(&alice.id().to_string()), "alice should be trusted");
    assert_eq!(view(&steward, "is_active", json!({"account":alice.id()})).await?, json!(true));

    // Alice grants 80 YAP to Bob from the DAO treasury; a second 80 breaks the 150 season budget; 101 breaks the cap.
    call(&alice, steward.id().as_str(), "grant", json!({"receiver":bob.id(),"amount":"80","memo":"great thread"}), 1_250_000_000_000_000_000_000).await?;
    assert_eq!(view(&token, "ft_balance_of", json!({"account_id":bob.id()})).await?, json!("80"));
    let grants = view(&steward, "get_grants", json!({"from":0,"limit":10})).await?;
    assert_eq!(grants[0]["status"], "Approved", "{grants}");
    assert!(call(&alice, steward.id().as_str(), "grant", json!({"receiver":bob.id(),"amount":"80","memo":"again"}), 1_250_000_000_000_000_000_000).await.is_err());
    assert!(call(&alice, steward.id().as_str(), "grant", json!({"receiver":bob.id(),"amount":"101","memo":"big"}), 1_250_000_000_000_000_000_000).await.is_err());
    // Bob is not trusted.
    assert!(call(&bob, steward.id().as_str(), "grant", json!({"receiver":alice.id(),"amount":"10","memo":"x"}), 1_250_000_000_000_000_000_000).await.is_err());

    // After the season (proof epoch 0 + 4), anyone can demote her.
    assert!(call(&bob, steward.id().as_str(), "demote", json!({"account":alice.id()}), 0).await.is_err());
    advance_to(&worker, (genesis_ts + 6 * 5 + 1) * 1_000_000_000).await?;
    call(&bob, steward.id().as_str(), "demote", json!({"account":alice.id()}), 0).await?;
    assert!(!role_members(&dao, "trusted").await?.contains(&alice.id().to_string()), "alice should be removed");
    Ok(())
}
