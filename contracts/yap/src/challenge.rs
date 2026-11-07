use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::AccountId;

#[derive(
    Clone,
    Debug,
    BorshDeserialize,
    BorshSerialize,
    Serialize,
    Deserialize,
    PartialEq,
    Eq,
    near_sdk::NearSchema,
)]
#[abi(borsh, json)]
#[serde(crate = "near_sdk::serde")]
pub enum ChallengeStatus {
    ProposalPending,
    Open,
    Upheld,
    Rejected,
}

#[derive(Clone, BorshDeserialize, BorshSerialize, Serialize, Deserialize, near_sdk::NearSchema)]
#[abi(borsh, json)]
#[serde(crate = "near_sdk::serde")]
pub struct Challenge {
    pub epoch: u32,
    pub challenger: AccountId,
    pub bond: U128,
    pub reason_uri: String,
    pub opened_at: u64,
    pub proposal_id: Option<u64>,
    pub status: ChallengeStatus,
}
