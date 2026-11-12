//! 阶段 3：Dock LauncherEntry、桌面通知与托盘。
//! Ubuntu Dock 只支持 count / progress / urgent / quicklist，图标位图本身不能动态替换。

use serde_json::Value;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::menu::Menu;
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Runtime};
use zbus::blocking::Connection;
use zbus::zvariant::Value as ZValue;

pub const DEFAULT_DESKTOP_ID: &str = "com.ncm.player.tauri";
pub const TRAY_ID: &str = "main";

/// 必须与 Dock 中实际运行的 .desktop 文件名一致；dev/打包不同环境可覆盖
pub fn desktop_id() -> String {
    std::env::var("NCM_DOCK_DESKTOP_ID")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_DESKTOP_ID.to_string())
}

/// 播放中显示进度条与「第几首」角标，暂停/停止隐藏
pub fn launcher_props(playback: &Value) -> HashMap<String, ZValue<'static>> {
    let playing = playback.get("status").and_then(Value::as_str) == Some("playing");
    let duration = playback.get("duration").and_then(Value::as_f64).unwrap_or(0.0);
    let position = playback.get("position").and_then(Value::as_f64).unwrap_or(0.0);
    let progress = if duration > 0.0 {
        (position / duration).clamp(0.0, 1.0)
    } else {
        0.0
    };
    let index = playback.get("currentIndex").and_then(Value::as_i64).unwrap_or(-1);
    let count = if index >= 0 { index + 1 } else { 0 };

    let mut props: HashMap<String, ZValue<'static>> = HashMap::new();
    props.insert("progress".into(), ZValue::from(progress));
    props.insert("progress-visible".into(), ZValue::from(playing));
    props.insert("count".into(), ZValue::from(count));
    props.insert("count-visible".into(), ZValue::from(playing && count > 0));
    props
}

static LAUNCHER_ANNOUNCED: AtomicBool = AtomicBool::new(false);

fn debug() -> bool {
    std::env::var("NCM_DEBUG").as_deref() == Ok("1")
}

pub fn publish_launcher(connection: &Connection, playback: &Value) {
    let body = (
        format!("application://{}.desktop", desktop_id()),
        launcher_props(playback),
    );
    match connection.emit_signal(
        None::<()>,
        "/com/canonical/Unity/LauncherEntry",
        "com.canonical.Unity.LauncherEntry",
        "Update",
        &body,
    ) {
        Ok(()) => {
            if debug() && !LAUNCHER_ANNOUNCED.swap(true, Ordering::Relaxed) {
                println!("[desktop] LauncherEntry 已启用 ({})", desktop_id());
            }
        }
        Err(error) => {
            if debug() {
                eprintln!("[desktop] LauncherEntry 信号失败: {error}");
            }
        }
    }
}

pub fn tooltip_text(playback: &Value) -> String {
    let Some((title, artist)) = notification_text(playback) else {
        return "黑胶 · 网易云音乐".to_string();
    };
    if artist.is_empty() {
        format!("正在播放：{title}")
    } else {
        format!("正在播放：{title} - {artist}")
    }
}

pub fn notification_text(playback: &Value) -> Option<(String, String)> {
    let current = playback.get("current")?;
    if !current.is_object() {
        return None;
    }
    let title = current.get("name")?.as_str()?;
    if title.is_empty() {
        return None;
    }
    let artist = current
        .get("artists")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .collect::<Vec<_>>()
                .join(" / ")
        })
        .unwrap_or_default();
    Some((title.to_string(), artist))
}

/// 切歌时发一条通知；调用方按 current.id 去重
pub fn notify_track(connection: &Connection, playback: &Value) -> bool {
    let Some((title, artist)) = notification_text(playback) else {
        return false;
    };
    let actions: Vec<&str> = Vec::new();
    let hints: HashMap<&str, ZValue<'static>> = HashMap::new();
    let body = (
        "黑胶音乐",
        0u32,
        "ncm-player",
        title.as_str(),
        artist.as_str(),
        actions,
        hints,
        5000i32,
    );
    match connection.call_method(
        Some("org.freedesktop.Notifications"),
        "/org/freedesktop/Notifications",
        Some("org.freedesktop.Notifications"),
        "Notify",
        &body,
    ) {
        Ok(_) => {
            if debug() {
                println!("[desktop] 通知已发送：{title} - {artist}");
            }
        }
        Err(error) => {
            if debug() {
                eprintln!("[desktop] 通知失败: {error}");
            }
        }
    }
    true
}

/// Linux 下托盘图标有时需要挂一个（哪怕是空的）菜单才会显示
pub fn create_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let menu = Menu::new(app)?;
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .tooltip("黑胶 · 网易云音乐")
        .show_menu_on_left_click(false);
    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }
    builder.build(app)?;
    Ok(())
}

pub fn set_tray_tooltip<R: Runtime>(app: &AppHandle<R>, playback: &Value) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_tooltip(Some(tooltip_text(playback)));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn playback(status: &str, position: f64) -> Value {
        json!({
            "status": status,
            "position": position,
            "duration": 200.0,
            "currentIndex": 2,
            "current": { "id": "ENC_A", "name": "歌一", "artists": ["歌手A", "歌手B"] }
        })
    }

    #[test]
    fn playing_shows_progress_and_count() {
        let props = launcher_props(&playback("playing", 50.0));
        assert_eq!(props["progress"], ZValue::from(0.25));
        assert_eq!(props["progress-visible"], ZValue::from(true));
        assert_eq!(props["count"], ZValue::from(3i64));
        assert_eq!(props["count-visible"], ZValue::from(true));
    }

    #[test]
    fn paused_hides_indicators() {
        let props = launcher_props(&playback("paused", 50.0));
        assert_eq!(props["progress-visible"], ZValue::from(false));
        assert_eq!(props["count-visible"], ZValue::from(false));
    }

    #[test]
    fn progress_is_clamped_to_unit_range() {
        let props = launcher_props(&playback("playing", 999.0));
        assert_eq!(props["progress"], ZValue::from(1.0));
    }

    #[test]
    fn tooltip_and_notification_carry_track_info() {
        let value = playback("playing", 10.0);
        assert_eq!(tooltip_text(&value), "正在播放：歌一 - 歌手A / 歌手B");
        assert_eq!(
            notification_text(&value),
            Some(("歌一".to_string(), "歌手A / 歌手B".to_string()))
        );
        assert_eq!(tooltip_text(&json!({"status": "stopped"})), "黑胶 · 网易云音乐");
    }
}
