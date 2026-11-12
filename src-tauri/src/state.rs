//! 阶段 2 增量 A：播放状态的持久化与统一组装。
//! 前端只持有镜像，真正的队列/模式/音量以这里为准，重启后从用户配置目录恢复。

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

pub const MODES: &[&str] = &["order", "repeat-all", "repeat-one", "shuffle"];

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct PlayState {
    /// Track 的 JSON 数组，形状由渲染层定义，Rust 不解析其字段
    pub queue: Vec<Value>,
    pub index: i32,
    pub play_mode: String,
    pub volume: i32,
}

impl Default for PlayState {
    fn default() -> Self {
        Self {
            queue: Vec::new(),
            index: -1,
            play_mode: "order".into(),
            volume: 70,
        }
    }
}

impl PlayState {
    pub fn sanitize(&mut self) {
        if !MODES.contains(&self.play_mode.as_str()) {
            self.play_mode = "order".into();
        }
        self.volume = self.volume.clamp(0, 100);
        let len = self.queue.len() as i32;
        self.index = if len == 0 { -1 } else { self.index.clamp(0, len - 1) };
    }
}

#[derive(Default)]
pub struct Patch {
    pub queue: Option<Vec<Value>>,
    pub index: Option<i32>,
    pub play_mode: Option<String>,
    pub volume: Option<i32>,
}

fn config_path() -> PathBuf {
    if let Ok(dir) = std::env::var("XDG_CONFIG_HOME") {
        return Path::new(&dir).join("ncm-player-tauri").join("state.json");
    }
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
    Path::new(&home)
        .join(".config")
        .join("ncm-player-tauri")
        .join("state.json")
}

#[derive(Clone)]
pub struct AppState {
    inner: Arc<Mutex<PlayState>>,
    path: PathBuf,
}

impl AppState {
    pub fn load() -> Self {
        Self::load_from(config_path())
    }

    pub fn load_from(path: PathBuf) -> Self {
        let mut play = fs::read_to_string(&path)
            .ok()
            .and_then(|text| serde_json::from_str::<PlayState>(&text).ok())
            .unwrap_or_default();
        play.sanitize();
        let state = Self {
            inner: Arc::new(Mutex::new(play.clone())),
            path,
        };
        state.persist(&play);
        state
    }

    pub fn get(&self) -> PlayState {
        self.inner
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }

    pub fn set(&self, next: PlayState) -> PlayState {
        let mut next = next;
        next.sanitize();
        *self.inner.lock().unwrap_or_else(|e| e.into_inner()) = next.clone();
        self.persist(&next);
        next
    }

    pub fn patch(&self, patch: Patch) -> PlayState {
        let mut next = self.get();
        if let Some(queue) = patch.queue {
            next.queue = queue;
        }
        if let Some(index) = patch.index {
            next.index = index;
        }
        if let Some(play_mode) = patch.play_mode {
            next.play_mode = play_mode;
        }
        if let Some(volume) = patch.volume {
            next.volume = volume;
        }
        self.set(next)
    }

    fn persist(&self, play: &PlayState) {
        if let Some(dir) = self.path.parent() {
            if fs::create_dir_all(dir).is_err() {
                return;
            }
        }
        if let Ok(text) = serde_json::to_string(play) {
            let _ = fs::write(&self.path, text);
        }
    }
}

fn num(value: Option<&Value>) -> f64 {
    match value {
        Some(Value::Number(n)) => n.as_f64().unwrap_or(0.0),
        Some(Value::String(s)) => s.parse().unwrap_or(0.0),
        _ => 0.0,
    }
}

/// CLI `state` 返回 `{success, state:{...}}`；与 Rust 侧队列拼成渲染层的 PlaybackState
pub fn build_playback(cli: Option<&Value>, play: &PlayState) -> Value {
    let state = cli
        .and_then(|v| v.get("state"))
        .filter(|v| v.is_object())
        .or(cli)
        .cloned()
        .unwrap_or(Value::Null);
    let raw_status = state.get("status").and_then(Value::as_str).unwrap_or("stopped");
    let status = match raw_status {
        "playing" => "playing",
        "paused" => "paused",
        _ => "stopped",
    };
    let duration = num(state.get("duration"));
    let mut position = num(state.get("position"));
    if position > 100_000.0 || (duration > 0.0 && position > duration * 10.0) {
        position /= 1000.0;
    }
    let volume = state
        .get("volume")
        .filter(|v| v.is_number())
        .cloned()
        .unwrap_or_else(|| json!(play.volume));
    let index = if play.index >= 0 {
        Some(play.index as usize)
    } else {
        None
    };
    let current = index
        .and_then(|i| play.queue.get(i))
        .cloned()
        .unwrap_or(Value::Null);

    json!({
        "status": status,
        "position": position.max(0.0),
        "duration": duration,
        "volume": volume,
        "currentIndex": play.index,
        "queueLength": play.queue.len(),
        "current": current,
        "playMode": play.play_mode,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_path(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("ncm-tauri-state-{name}.json"))
    }

    #[test]
    fn sanitize_clamps_index_mode_and_volume() {
        let mut play = PlayState {
            queue: vec![json!({"id": "a"}), json!({"id": "b"})],
            index: 99,
            play_mode: "loop".into(),
            volume: 180,
        };
        play.sanitize();
        assert_eq!(play.index, 1);
        assert_eq!(play.play_mode, "order");
        assert_eq!(play.volume, 100);

        play.queue.clear();
        play.sanitize();
        assert_eq!(play.index, -1);
    }

    #[test]
    fn state_round_trips_through_disk() {
        let path = temp_path("roundtrip");
        let _ = fs::remove_file(&path);
        let state = AppState::load_from(path.clone());
        let saved = state.set(PlayState {
            queue: vec![json!({"id": "ENC_A", "name": "歌一"})],
            index: 0,
            play_mode: "shuffle".into(),
            volume: 42,
        });

        let reloaded = AppState::load_from(path.clone());
        assert_eq!(reloaded.get(), saved);
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn patch_only_changes_provided_fields() {
        let path = temp_path("patch");
        let _ = fs::remove_file(&path);
        let state = AppState::load_from(path.clone());
        state.set(PlayState {
            queue: vec![json!({"id": "a"})],
            index: 0,
            play_mode: "order".into(),
            volume: 70,
        });
        let next = state.patch(Patch {
            play_mode: Some("repeat-one".into()),
            ..Default::default()
        });
        assert_eq!(next.play_mode, "repeat-one");
        assert_eq!(next.queue.len(), 1);
        assert_eq!(next.volume, 70);
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn build_playback_merges_cli_state_and_local_queue() {
        let play = PlayState {
            queue: vec![json!({"id": "ENC_A", "name": "歌一"})],
            index: 0,
            play_mode: "repeat-all".into(),
            volume: 70,
        };
        let cli = json!({
            "success": true,
            "state": { "status": "playing", "position": 46000, "duration": 200, "volume": 60 }
        });
        let snapshot = build_playback(Some(&cli), &play);
        assert_eq!(snapshot["status"], "playing");
        assert_eq!(snapshot["position"], 46.0);
        assert_eq!(snapshot["volume"], 60);
        assert_eq!(snapshot["current"]["name"], "歌一");
        assert_eq!(snapshot["queueLength"], 1);
        assert_eq!(snapshot["playMode"], "repeat-all");
    }

    #[test]
    fn build_playback_falls_back_when_cli_missing() {
        let play = PlayState::default();
        let snapshot = build_playback(None, &play);
        assert_eq!(snapshot["status"], "stopped");
        assert_eq!(snapshot["current"], Value::Null);
        assert_eq!(snapshot["volume"], 70);
    }
}
