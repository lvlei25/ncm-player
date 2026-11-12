//! 阶段 3：MPRIS 元数据的共享快照。
//! 由状态循环写入，MPRIS 属性 getter 与 PropertiesChanged 从这里读，避免两边状态不一致。

use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use zbus::zvariant::{Array, OwnedValue, Value as ZValue};

#[derive(Clone, Debug, Default, PartialEq)]
pub struct MediaSnapshot {
    /// MPRIS 取值：Playing / Paused / Stopped
    pub status: String,
    pub title: String,
    pub artists: Vec<String>,
    pub album: String,
    pub art_url: String,
    /// 微秒
    pub length_us: i64,
    pub position_us: i64,
    pub track_id: String,
}

fn string_field(current: Option<&Value>, key: &str) -> String {
    current
        .and_then(|v| v.get(key))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

/// 从阶段 2 的 PlaybackState JSON 生成 MPRIS 快照
pub fn from_playback(playback: &Value) -> MediaSnapshot {
    let status = match playback.get("status").and_then(Value::as_str) {
        Some("playing") => "Playing",
        Some("paused") => "Paused",
        _ => "Stopped",
    }
    .to_string();
    let current = playback.get("current").filter(|v| v.is_object());

    let artists = current
        .and_then(|v| v.get("artists"))
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(String::from)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let duration_ms = current
        .and_then(|v| v.get("durationMs"))
        .and_then(Value::as_f64)
        .unwrap_or_else(|| playback.get("duration").and_then(Value::as_f64).unwrap_or(0.0) * 1000.0);
    let id = string_field(current, "id");
    let track_id = if id.is_empty() {
        String::new()
    } else {
        format!("/org/mpris/MediaPlayer2/Track/{id}")
    };

    MediaSnapshot {
        status,
        title: string_field(current, "name"),
        artists,
        album: string_field(current, "album"),
        art_url: string_field(current, "coverUrl"),
        length_us: (duration_ms * 1000.0) as i64,
        position_us: (playback.get("position").and_then(Value::as_f64).unwrap_or(0.0)
            * 1_000_000.0) as i64,
        track_id,
    }
}

fn owned(value: ZValue<'_>) -> OwnedValue {
    value.try_to_owned().unwrap_or_else(|_| OwnedValue::from(0i64))
}

/// MPRIS Metadata：a{sv}，客户端据此显示歌名、歌手与封面
pub fn metadata(snapshot: &MediaSnapshot) -> HashMap<String, OwnedValue> {
    let mut map: HashMap<String, OwnedValue> = HashMap::new();
    map.insert("mpris:trackid".into(), owned(ZValue::from(snapshot.track_id.as_str())));
    map.insert("mpris:length".into(), OwnedValue::from(snapshot.length_us));
    map.insert("mpris:artUrl".into(), owned(ZValue::from(snapshot.art_url.as_str())));
    map.insert("xesam:title".into(), owned(ZValue::from(snapshot.title.as_str())));
    map.insert("xesam:album".into(), owned(ZValue::from(snapshot.album.as_str())));

    let artists: Vec<&str> = snapshot.artists.iter().map(String::as_str).collect();
    map.insert("xesam:artist".into(), owned(ZValue::Array(Array::from(artists))));
    map
}

/// 只宣告 PlaybackStatus 变化：客户端收到 PropertiesChanged 后会重新读取 Metadata，
/// 避免把嵌套 a{sv} 塞进 variant 带来的类型复杂度。
pub fn changed_properties(snapshot: &MediaSnapshot) -> HashMap<String, OwnedValue> {
    let mut map = HashMap::new();
    map.insert("PlaybackStatus".into(), owned(ZValue::from(snapshot.status.as_str())));
    map
}

#[derive(Clone, Default)]
pub struct SharedMedia {
    inner: Arc<Mutex<MediaSnapshot>>,
}

impl SharedMedia {
    pub fn get(&self) -> MediaSnapshot {
        self.inner
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }

    /// 只有播放状态或曲目变化才返回 true，进度推进不触发 PropertiesChanged
    pub fn update_if_changed(&self, next: MediaSnapshot) -> bool {
        let mut guard = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        let changed = guard.status != next.status || guard.track_id != next.track_id;
        *guard = next;
        changed
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn playback(status: &str, id: &str) -> Value {
        json!({
            "status": status,
            "position": 12.5,
            "duration": 200.0,
            "current": {
                "id": id,
                "name": "歌一",
                "artists": ["歌手A", "歌手B"],
                "album": "专辑",
                "durationMs": 200000,
                "coverUrl": "https://example.com/a.jpg"
            }
        })
    }

    #[test]
    fn snapshot_maps_status_and_track_fields() {
        let s = from_playback(&playback("playing", "ENC_A"));
        assert_eq!(s.status, "Playing");
        assert_eq!(s.title, "歌一");
        assert_eq!(s.artists, vec!["歌手A", "歌手B"]);
        assert_eq!(s.length_us, 200_000_000);
        assert_eq!(s.position_us, 12_500_000);
        assert_eq!(s.track_id, "/org/mpris/MediaPlayer2/Track/ENC_A");
        assert_eq!(from_playback(&playback("paused", "ENC_A")).status, "Paused");
        assert_eq!(from_playback(&json!({"status": "stopped"})).status, "Stopped");
    }

    #[test]
    fn metadata_contains_mpris_keys() {
        let m = metadata(&from_playback(&playback("playing", "ENC_A")));
        assert!(m.contains_key("xesam:title"));
        assert!(m.contains_key("xesam:artist"));
        assert!(m.contains_key("mpris:length"));
        assert!(m.contains_key("mpris:artUrl"));
    }

    #[test]
    fn only_status_or_track_changes_trigger_notification() {
        let shared = SharedMedia::default();
        assert!(shared.update_if_changed(from_playback(&playback("playing", "ENC_A"))));
        let mut same = from_playback(&playback("playing", "ENC_A"));
        same.position_us = 20_000_000;
        assert!(!shared.update_if_changed(same));
        assert!(shared.update_if_changed(from_playback(&playback("paused", "ENC_A"))));
        assert!(shared.update_if_changed(from_playback(&playback("paused", "ENC_B"))));
    }
}
