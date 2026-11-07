use near_sdk::{env, require};

pub fn hash_hex(bytes: &[u8]) -> String {
    hex::encode(env::sha256(bytes))
}

fn decode(hash: &str) -> [u8; 32] {
    let bytes = hex::decode(hash).expect("invalid hex hash");
    bytes.try_into().expect("hash must have 32 bytes")
}

pub fn yapper_leaf(epoch: u32, account: &str, amount: u128, score: u64, tier: u8) -> String {
    let mut raw = vec![0];
    raw.extend(epoch.to_le_bytes());
    raw.extend((account.len() as u32).to_le_bytes());
    raw.extend(account.as_bytes());
    raw.extend(amount.to_le_bytes());
    raw.extend(score.to_le_bytes());
    raw.push(tier);
    hash_hex(&raw)
}

pub fn arena_leaf(arena_id: u32, epoch: u32, account: &str, amount: u128) -> String {
    let mut raw = vec![1];
    raw.extend(arena_id.to_le_bytes());
    raw.extend(epoch.to_le_bytes());
    raw.extend((account.len() as u32).to_le_bytes());
    raw.extend(account.as_bytes());
    raw.extend(amount.to_le_bytes());
    hash_hex(&raw)
}

pub fn node(a: &str, b: &str) -> String {
    let mut parts = [decode(a), decode(b)];
    parts.sort();
    let mut raw = vec![2];
    raw.extend(parts[0]);
    raw.extend(parts[1]);
    hash_hex(&raw)
}

pub fn verify(leaf: &str, proof: &[String], root: &str) -> bool {
    require!(proof.len() <= 32, "proof too long");
    let mut hash = leaf.to_string();
    for sibling in proof {
        hash = node(&hash, sibling);
    }
    hash == root
}
