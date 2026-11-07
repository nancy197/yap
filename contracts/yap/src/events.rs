use near_sdk::env;
use serde_json::{json, Value};

pub fn emit(name: &str, data: Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({
            "standard": "yap", "version": "1.0.0", "event": name, "data": [data]
        })
    ));
}
