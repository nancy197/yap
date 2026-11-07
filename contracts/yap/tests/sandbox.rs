use anyhow::{Context, Result};
use base64::Engine;
use near_workspaces::types::{Gas, NearToken};
use near_workspaces::{network::Sandbox, Account, Contract, Worker};
use serde_json::{json, Value};
use yap::merkle;

const N: u128 = 1_000_000_000_000_000_000_000_000;
fn h(byte: u8) -> String {
    hex::encode([byte; 32])
}
async fn call(
    a: &Account,
    c: &Contract,
    method: &str,
    args: Value,
    deposit: u128,
) -> Result<Value> {
    let result = a
        .call(c.id(), method)
        .args_json(args)
        .gas(Gas::from_tgas(250))
        .deposit(NearToken::from_yoctonear(deposit))
        .transact()
        .await
        .with_context(|| format!("{method} transaction"))?
        .into_result()
        .with_context(|| format!("{method} execution"))?;
    Ok(result.json().unwrap_or(Value::Null))
}
async fn view(c: &Contract, method: &str, args: Value) -> Result<Value> {
    Ok(c.view(method).args_json(args).await?.json()?)
}
async fn advance_to(worker: &Worker<Sandbox>, target_ns: u64) -> Result<()> {
    while worker.view_block().await?.timestamp() < target_ns {
        let now = worker.view_block().await?.timestamp();
        worker
            .fast_forward(((target_ns - now) / 500_000_000).clamp(1, 50))
            .await?;
    }
    Ok(())
}
fn cfg(dao: &Contract, scorers: &[Account], genesis_ts: u64) -> Value {
    json!({"epoch_secs":5,"genesis_ts":genesis_ts,"base_emission":"1000","initial_attention_target":"1000",
        "ema_bps":2000,"loud_bps":8000,"max_ratio_bps":30000,"streak_cap":10,"streak_step_bps":500,
        "quiet_burn_bps":300,"dead_burn_bps":1000,"report_deadline_epochs":10,
        "yapper_bps":8000,"staker_bps":1000,"dao_bps":1000,"claim_epochs":14,
        "scorers":scorers.iter().map(|a|a.id().as_str()).collect::<Vec<_>>(),"scorer_quorum":2,
        "scorer_bond":"100","challenge_secs":2,"challenge_bond":"50","unbond_epochs":7,
        "dao":dao.id(),"dao_proposal_bond":N.to_string(),"accepted_arena_tokens":[],
        "initial_supply":"100000","genesis_split":{"reserve_bps":6000,"dao_bps":2500,"deployer_bps":1500}})
}
async fn register(owner: &Account, c: &Contract, target: &Account) -> Result<()> {
    call(
        owner,
        c,
        "storage_deposit",
        json!({"account_id":target.id()}),
        N / 100,
    )
    .await?;
    Ok(())
}
async fn ft(
    owner: &Account,
    c: &Contract,
    receiver: &str,
    amount: u128,
    msg: Option<Value>,
) -> Result<()> {
    if let Some(msg) = msg {
        call(
            owner,
            c,
            "ft_transfer_call",
            json!({"receiver_id":receiver,"amount":amount.to_string(),"msg":msg.to_string()}),
            1,
        )
        .await?;
    } else {
        call(
            owner,
            c,
            "ft_transfer",
            json!({"receiver_id":receiver,"amount":amount.to_string()}),
            1,
        )
        .await?;
    }
    Ok(())
}
async fn proposal_vote(member: &Account, dao: &Contract, kind: Value, id: u64) -> Result<()> {
    call(
        member,
        dao,
        "act_proposal",
        json!({"id":id,"action":"VoteApprove","proposal":kind,"memo":null}),
        0,
    )
    .await?;
    Ok(())
}

#[tokio::test]
async fn real_dao_challenge_and_funded_arena() -> Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let wasm = std::fs::read(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../target/near/yap/yap.wasm"
    ))
    .context("run cargo near build non-reproducible-wasm first")?;
    let dao_wasm = include_bytes!("../../tests/fixtures/sputnikdao2.wasm");
    let token = worker.dev_deploy(&wasm).await?;
    let dao = worker.dev_deploy(dao_wasm).await?;
    let deployer = worker.dev_create_account().await?;
    let member = worker.dev_create_account().await?;
    let alice = worker.dev_create_account().await?;
    let scorers = vec![
        worker.dev_create_account().await?,
        worker.dev_create_account().await?,
        worker.dev_create_account().await?,
    ];
    call(&member,&dao,"new",json!({"config":{"name":"YAP DAO","purpose":"Resolve challenges","metadata":""},"policy":[member.id()]}),0).await?;
    let genesis_ts = worker.view_block().await?.timestamp() / 1_000_000_000;
    call(
        &deployer,
        &token,
        "new",
        json!({"config":cfg(&dao,&scorers,genesis_ts),"metadata":null}),
        0,
    )
    .await?;
    for a in [&alice, &scorers[0], &scorers[1], &scorers[2]] {
        register(&deployer, &token, a).await?;
    }
    for scorer in &scorers {
        ft(&deployer, &token, scorer.id().as_str(), 200, None).await?;
        ft(
            scorer,
            &token,
            token.id().as_str(),
            100,
            Some(json!({"scorer_bond":{}})),
        )
        .await?;
    }
    ft(&deployer, &token, alice.id().as_str(), 100, None).await?;
    let start = (genesis_ts + 5) * 1_000_000_000;
    advance_to(&worker, start).await?;
    let first = json!({"attention":"1000","yappers_root":h(1),"arenas":[],"labels_hash":h(2),"data_hash":h(3),"uri":"https://example.test/0"});
    for scorer in scorers.iter().take(2) {
        call(
            scorer,
            &token,
            "submit_report",
            json!({"e":0,"report":first}),
            0,
        )
        .await?;
    }
    ft(
        &alice,
        &token,
        token.id().as_str(),
        50,
        Some(json!({"challenge":{"epoch":0,"reason_uri":"https://example.test/reason"}})),
    )
    .await?;
    let challenge = view(&token, "get_challenge", json!({"e":0})).await?;
    let proposal_id = challenge["proposal_id"]
        .as_u64()
        .context(format!("challenge proposal missing: {challenge}"))?;
    let proposal = view(&dao, "get_proposal", json!({"id":proposal_id})).await?;
    proposal_vote(&member, &dao, proposal["kind"].clone(), proposal_id).await?;
    let epoch = view(&token, "get_epoch", json!({"e":0})).await?;
    assert_eq!(epoch["status"], "Discarded");
    for scorer in scorers.iter().take(2) {
        ft(
            scorer,
            &token,
            token.id().as_str(),
            100,
            Some(json!({"scorer_bond":{}})),
        )
        .await?;
    }
    // The re-bonded scorers resubmit an honest report for the discarded epoch, and it finalizes.
    let honest = json!({"attention":"900","yappers_root":h(5),"arenas":[],"labels_hash":h(2),"data_hash":h(3),"uri":"https://example.test/0b"});
    for scorer in scorers.iter().take(2) {
        call(scorer, &token, "submit_report", json!({"e":0,"report":honest}), 0).await?;
    }
    let resubmitted_at = view(&token, "get_epoch", json!({"e":0})).await?["proposed_at"].as_u64().unwrap();
    advance_to(&worker, resubmitted_at + 2_100_000_000).await?;
    call(&alice, &token, "finalize", json!({"e":0}), 0).await?;
    assert_eq!(view(&token, "get_epoch", json!({"e":0})).await?["status"], "Finalized");
    // The DAO funds an arena by approving a FunctionCall proposal that invokes its YAP balance.
    let arena_msg = json!({"open_arena":{"topic":"#rhea","per_epoch":"100","epochs":2,"min_tier":2,"title":"Rhea"}});
    let args = base64::engine::general_purpose::STANDARD.encode(serde_json::to_vec(&json!({
        "receiver_id":token.id(),"amount":"200","msg":arena_msg.to_string()}))?);
    let kind = json!({"FunctionCall":{"receiver_id":token.id(),"actions":[{
        "method_name":"ft_transfer_call","args":args,"deposit":"1","gas":"100000000000000"}]}});
    let arena_proposal_id: u64 = call(
        &member,
        &dao,
        "add_proposal",
        json!({"proposal":{"description":"Fund Rhea arena","kind":kind}}),
        N,
    )
    .await?
    .as_u64()
    .context("arena proposal id")?;
    proposal_vote(&member, &dao, kind, arena_proposal_id).await?;
    let arena = view(&token, "get_arena", json!({"id":0})).await?;
    let e = arena["start_epoch"]
        .as_u64()
        .context(format!("arena not opened: {arena}"))? as u32;
    advance_to(&worker, (genesis_ts + (e as u64 + 1) * 5) * 1_000_000_000).await?;
    let yapper_leaf = merkle::yapper_leaf(e, alice.id().as_str(), 100, 42, 2);
    let arena_leaf = merkle::arena_leaf(0, e, alice.id().as_str(), 50);
    let report = json!({"attention":"1000","yappers_root":yapper_leaf,"arenas":[{"arena_id":0,"root":arena_leaf}],
        "labels_hash":h(2),"data_hash":h(3),"uri":"https://example.test/final"});
    for scorer in scorers.iter().take(2) {
        call(
            scorer,
            &token,
            "submit_report",
            json!({"e":e,"report":report}),
            0,
        )
        .await?;
    }
    let proposed_at = view(&token, "get_epoch", json!({"e":e})).await?["proposed_at"]
        .as_u64()
        .unwrap();
    advance_to(&worker, proposed_at + 2_000_000_000).await?;
    call(&alice, &token, "finalize", json!({"e":e}), 0).await?;
    call(
        &alice,
        &token,
        "claim",
        json!({"e":e,"amount":"100","score":42,"tier":2,"proof":[]}),
        0,
    )
    .await?;
    call(
        &alice,
        &token,
        "claim_arena",
        json!({"arena_id":0,"e":e,"amount":"50","proof":[],
        "yapper_amount":"100","score":42,"tier":2,"yapper_proof":[]}),
        0,
    )
    .await?;
    assert_eq!(
        view(&token, "get_arena", json!({"id":0})).await?["budget_left"],
        "150"
    );
    Ok(())
}
