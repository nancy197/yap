use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};

#[derive(
    Clone, BorshDeserialize, BorshSerialize, Serialize, Deserialize, Default, near_sdk::NearSchema,
)]
#[abi(borsh, json)]
#[serde(crate = "near_sdk::serde")]
pub struct StakePosition {
    pub epoch: u32,
    pub amount: U128,
}

#[derive(Clone, BorshDeserialize, BorshSerialize, Serialize, Deserialize, near_sdk::NearSchema)]
#[abi(borsh, json)]
#[serde(crate = "near_sdk::serde")]
pub struct Unbond {
    pub amount: U128,
    pub withdraw_at: u32,
}

#[derive(
    Clone, BorshDeserialize, BorshSerialize, Serialize, Deserialize, Default, near_sdk::NearSchema,
)]
#[abi(borsh, json)]
#[serde(crate = "near_sdk::serde")]
pub struct Stake {
    pub amount: U128,
    pub eligible_from: u32,
    pub pending_unstake: U128,
    pub withdraw_at: u32,
    pub rewards: U128,
    pub positions: Vec<StakePosition>,
    pub unbonds: Vec<Unbond>,
}

impl Stake {
    pub fn whole_epoch_amount(&self, epoch: u32) -> u128 {
        let mut at_start = 0;
        for position in &self.positions {
            if position.epoch < epoch {
                at_start = position.amount.0;
            } else {
                break;
            }
        }
        let mut eligible = at_start;
        for position in &self.positions {
            if position.epoch == epoch {
                eligible = eligible.min(position.amount.0);
            }
        }
        eligible
    }
}
