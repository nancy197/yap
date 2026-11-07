use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::AccountId;

#[derive(Clone, BorshDeserialize, BorshSerialize, Serialize, Deserialize, near_sdk::NearSchema)]
#[abi(borsh, json)]
#[serde(crate = "near_sdk::serde")]
pub struct Arena {
    pub id: u32,
    pub opener: AccountId,
    pub token: AccountId,
    pub topic: String,
    pub title: String,
    pub min_tier: u8,
    pub per_epoch: U128,
    pub start_epoch: u32,
    pub epochs: u32,
    pub budget_left: U128,
    pub closed: bool,
}
