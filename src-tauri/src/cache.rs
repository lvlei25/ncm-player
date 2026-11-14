//! 阶段 2 增量 C：发现页落盘缓存。
//! 与 `electron/ncm/catalog.ts` 的策略对齐：30 min TTL、空结果不落盘、key 白名单。

use crate::cli::CliError;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub const TTL_MS: u64 = 30 * 60 * 1000;
const ALLOWED_KEYS: &[&str] = &["daily", "playlists"];

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheEntry {
    pub data: Value,
    pub updated_at: u64,
}

/** Tauri 侧应用配置目录，供播放状态、prefs 与发现页缓存共用 */
pub fn config_dir() -> PathBuf {
    let base = std::env::var("XDG_CONFIG_HOME").map(PathBuf::from).unwrap_or_else(|_| {
        PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| "/tmp".into())).join(".config")
    });
    base.join("ncm-player-tauri")
}

fn cache_path() -> PathBuf {
    config_dir().join("discover.json")
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub fn is_fresh(entry: &CacheEntry, now: u64) -> bool {
    now.saturating_sub(entry.updated_at) < TTL_MS
}

/** 文件损坏或字段不合法时回退为空缓存，不影响首屏 */
pub fn all() -> BTreeMap<String, CacheEntry> {
    fs::read_to_string(cache_path())
        .ok()
        .and_then(|text| serde_json::from_str::<BTreeMap<String, CacheEntry>>(&text).ok())
        .unwrap_or_default()
}

/** 只把未过期的条目交给渲染层，过期数据留给下一次 CLI 刷新覆盖 */
pub fn fresh_all() -> BTreeMap<String, CacheEntry> {
    let now = now_ms();
    all().into_iter().filter(|(_, entry)| is_fresh(entry, now)).collect()
}

pub fn write(key: &str, data: Value) -> Result<CacheEntry, CliError> {
    if !ALLOWED_KEYS.contains(&key) {
        return Err(CliError::new("UNSUPPORTED", format!("缓存键未在白名单中：{key}")));
    }
    if data.as_array().is_some_and(|items| items.is_empty()) {
        return Err(CliError::new("UNKNOWN", "空结果不写入缓存"));
    }

    let mut map = all();
    let entry = CacheEntry {
        data,
        updated_at: now_ms(),
    };
    map.insert(key.to_string(), entry.clone());
    let path = cache_path();
    fs::create_dir_all(path.parent().unwrap_or(Path::new("/tmp")))
        .map_err(|e| CliError::new("UNKNOWN", format!("创建缓存目录失败：{e}")))?;
    fs::write(&path, serde_json::to_string_pretty(&map).unwrap_or_default())
        .map_err(|e| CliError::new("UNKNOWN", format!("写入缓存失败：{e}")))?;
    Ok(entry)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::Mutex;

    static TEST_LOCK: Mutex<()> = Mutex::new(());

    fn with_temp_dir<T>(test: impl FnOnce() -> T) -> T {
        let _guard = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let tmp = std::env::temp_dir().join(format!("ncm-discover-{}", std::process::id()));
        fs::remove_dir_all(&tmp).ok();
        std::env::set_var("XDG_CONFIG_HOME", &tmp);
        let result = test();
        fs::remove_dir_all(&tmp).ok();
        std::env::remove_var("XDG_CONFIG_HOME");
        result
    }

    #[test]
    fn freshness_uses_30_minute_ttl() {
        let now = now_ms();
        let fresh = CacheEntry { data: json!([1]), updated_at: now };
        let stale = CacheEntry { data: json!([1]), updated_at: now.saturating_sub(TTL_MS) };
        assert!(is_fresh(&fresh, now));
        assert!(!is_fresh(&stale, now));
        // 时钟回拨时不应把未来时间戳判成过期
        assert!(is_fresh(&CacheEntry { updated_at: now + 60_000, ..fresh }, now));
    }

    #[test]
    fn writes_and_reads_back_daily_entries() {
        with_temp_dir(|| {
            let tracks = json!([{ "id": "ENC_A", "name": "歌一" }]);
            let entry = write("daily", tracks.clone()).unwrap();
            assert_eq!(entry.data, tracks);

            let stored = all();
            assert_eq!(stored.len(), 1);
            assert_eq!(stored["daily"].data, tracks);
            assert!(is_fresh(&stored["daily"], now_ms()));
        })
    }

    #[test]
    fn rejects_unknown_keys_and_empty_arrays() {
        with_temp_dir(|| {
            assert_eq!(write("arbitrary", json!([1])).unwrap_err().code, "UNSUPPORTED");
            assert!(write("daily", json!([])).is_err());
            assert!(all().is_empty());
        })
    }

    #[test]
    fn corrupt_file_falls_back_to_empty_cache() {
        with_temp_dir(|| {
            fs::create_dir_all(config_dir()).unwrap();
            fs::write(cache_path(), "not json").unwrap();
            assert!(all().is_empty());
        })
    }
}
