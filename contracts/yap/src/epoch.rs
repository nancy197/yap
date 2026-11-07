use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};

#[derive(
    Clone,
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
pub struct ArenaRoot {
    pub arena_id: u32,
    pub root: String,
}

#[derive(
    Clone,
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
pub struct EpochReport {
    pub attention: U128,
    pub yappers_root: String,
    pub arenas: Vec<ArenaRoot>,
    pub labels_hash: String,
    #[serde(default)]
    pub prompt_hash: Option<String>,
    #[serde(default)]
    pub attestation_hash: Option<String>,
    pub data_hash: String,
    pub uri: String,
}

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
pub enum EpochStatus {
    Proposed,
    Challenged,
    Discarded,
    Finalized,
    Dead,
}

#[derive(Clone, BorshDeserialize, BorshSerialize, Serialize, Deserialize, near_sdk::NearSchema)]
#[abi(borsh, json)]
#[serde(crate = "near_sdk::serde")]
pub struct Epoch {
    pub number: u32,
    pub status: EpochStatus,
    pub report: Option<EpochReport>,
    pub report_hash: Option<String>,
    pub signers: Vec<near_sdk::AccountId>,
    pub proposed_at: u64,
    pub emission: U128,
    pub yapper_pool: U128,
    pub staker_pool: U128,
    pub dao_pool: U128,
    pub claimed: U128,
    pub unclaimed_burned: bool,
}

impl Epoch {
    pub fn new(number: u32) -> Self {
        Self {
            number,
            status: EpochStatus::Discarded,
            report: None,
            report_hash: None,
            signers: vec![],
            proposed_at: 0,
            emission: U128(0),
            yapper_pool: U128(0),
            staker_pool: U128(0),
            dao_pool: U128(0),
            claimed: U128(0),
            unclaimed_burned: false,
        }
    }
}
