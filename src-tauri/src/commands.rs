//! 阶段 1：Tauri IPC 命令。渲染层只下发语义化参数，CLI 调用一律经过 `cli.rs` 白名单。

use crate::cli::{self, CliError};
use crate::desktop;
use crate::media;
use crate::mpris::Mpris;
use crate::state::{self, AppState, Patch};
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub fn cli_invoke(args: Vec<String>) -> Value {
    match cli::run(&args) {
        Ok(value) => cli::ok(value),
        Err(error) => error.to_value(),
    }
}

#[tauri::command]
pub fn cli_text(args: Vec<String>, timeout_ms: Option<u64>) -> Value {
    match cli::run_text(&args, clamp_timeout(timeout_ms)) {
        Ok(text) => cli::ok(text),
        Err(error) => error.to_value(),
    }
}

/// 渲染层可请求的超时上限，避免长时间占用 CLI 串行锁
fn clamp_timeout(ms: Option<u64>) -> Duration {
    Duration::from_secs(ms.unwrap_or(12).clamp(1, 60))
}

/// 文本命令也做错误码归类（与 Electron 版 runCli 等价）
fn run_checked(args: &[String], timeout: Duration) -> Result<String, CliError> {
    let text = cli::run_text(args, timeout)?;
    if let Some((code, hint)) = cli::classify(&text) {
        return Err(CliError::new(code, hint));
    }
    Ok(text)
}

fn configured_from_text(text: &str) -> bool {
    text.lines().any(|line| {
        let key = line.split(':').next().unwrap_or("").trim();
        key.eq_ignore_ascii_case("appid") && !line.contains("未配置") && !line.trim_end().ends_with(':')
    })
}

/// 与 tauriBridge.session.status 的探测口径一致，用于凭证/登录变化后推送
fn probe_session() -> Value {
    let configured = cli::run_text(&["config".into(), "list".into()], Duration::from_secs(12))
        .map(|text| configured_from_text(&text))
        .unwrap_or(false);
    let logged_in = cli::run(&["login".into(), "--check".into()])
        .map(|value| value.get("success") == Some(&Value::Bool(true)))
        .unwrap_or(false);
    json!({ "configured": configured, "loggedIn": logged_in })
}

fn emit_session(app: &AppHandle) {
    let _ = app.emit("session:changed", probe_session());
}

fn prefs_path() -> PathBuf {
    let base = std::env::var("XDG_CONFIG_HOME").map(PathBuf::from).unwrap_or_else(|_| {
        PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| "/tmp".into())).join(".config")
    });
    base.join("ncm-player-tauri").join("prefs.json")
}

fn login_ticket(text: &str, error: Option<&str>) -> Value {
    let link = cli::extract_login_url(text);
    let message = match error {
        Some(message) => Value::String(message.to_string()),
        None if link.is_some() => Value::Null,
        None => Value::String("未从输出中解析到登录链接".into()),
    };
    json!({ "ok": link.is_some(), "link": link, "raw": text, "message": message })
}

fn version_of(text: &str) -> String {
    for token in text.split_whitespace() {
        let cleaned = token
            .trim_matches(|c: char| !c.is_ascii_alphanumeric() && c != '.')
            .trim_start_matches('v');
        if cleaned.contains('.') && cleaned.chars().next().is_some_and(|c| c.is_ascii_digit()) {
            return cleaned.to_string();
        }
    }
    text.trim().lines().next().unwrap_or("").trim().to_string()
}

fn prompt_support(version: &str) -> bool {
    let parts: Vec<u32> = version.split('.').filter_map(|p| p.parse().ok()).collect();
    match (parts.first(), parts.get(1)) {
        (Some(major), Some(minor)) => *major > 22 || (*major == 22 && *minor >= 12),
        _ => false,
    }
}

fn probe_version(bin: &str) -> (bool, String) {
    match Command::new(bin).arg("--version").output() {
        Ok(out) => (out.status.success(), version_of(&String::from_utf8_lossy(&out.stdout))),
        Err(_) => (false, String::new()),
    }
}

/** 与 electron/ncm/session.ts 的 checkEnv 等价：先探测依赖，再看凭证与登录态 */
#[tauri::command]
pub fn env_check(_force: Option<bool>) -> Value {
    let (ncm_ok, ncm_version) = match cli::run_text(&["--version".into()], Duration::from_secs(8)) {
        Ok(text) => (true, version_of(&text)),
        Err(_) => (false, String::new()),
    };
    let (node_ok, node_version) = probe_version("node");
    let (mpv_ok, mpv_version) = probe_version("mpv");

    let configured = cli::run_text(&["config".into(), "list".into()], Duration::from_secs(12))
        .map(|text| configured_from_text(&text))
        .unwrap_or(false);

    // login --check 未登录时会返回 success:false，cli::run 会把它转成 CliError
    let logged_in = cli::run(&["login".into(), "--check".into()])
        .map(|value| value.get("success") == Some(&Value::Bool(true)))
        .unwrap_or(false);

    let mut report = json!({
        "node": { "ok": node_ok, "version": node_version, "promptSupport": prompt_support(&node_version) },
        "ncmCli": { "ok": ncm_ok, "version": ncm_version },
        "mpv": { "ok": mpv_ok, "version": mpv_version },
        "configured": configured,
        "loggedIn": logged_in,
        "player": if mpv_ok { Value::String("mpv".into()) } else { Value::Null },
    });
    if !ncm_ok {
        report["error"] = Value::String("未检测到 ncm-cli".into());
    }
    cli::ok(report)
}

fn validate_credentials(app_id: &str, private_key: &str) -> Result<(), CliError> {
    if app_id.trim().is_empty() || private_key.trim().is_empty() {
        return Err(CliError::new("CREDENTIALS", "appId 与 privateKey 不能为空"));
    }
    Ok(())
}

/// 写入开放平台凭证：与 Electron 版 setCredentials 等价，参数不经过 shell
#[tauri::command]
pub fn session_save(app: AppHandle, app_id: String, private_key: String) -> Value {
    if let Err(error) = validate_credentials(&app_id, &private_key) {
        return error.to_value();
    }
    let id = app_id.trim();
    let key = private_key.trim();
    for (field, value) in [("appId", id), ("privateKey", key)] {
        let args = vec!["config".into(), "set".into(), field.into(), value.into()];
        if let Err(error) = run_checked(&args, Duration::from_secs(12)) {
            return error.to_value();
        }
    }
    // 播放后端固定为内置 mpv，失败不阻断凭证保存
    let _ = run_checked(
        &["config".into(), "set".into(), "player".into(), "mpv".into()],
        Duration::from_secs(12),
    );
    emit_session(&app);
    cli::ok(true)
}

/// 后台扫码登录：CLI 立即返回链接，真实登录完成由渲染层轮询 status 感知
#[tauri::command]
pub fn session_login_start() -> Value {
    let args = vec!["login".into(), "--background".into()];
    let ticket = match cli::run_text(&args, Duration::from_secs(30)) {
        Ok(text) => login_ticket(&text, None),
        Err(error) => login_ticket(&error.message, Some(&error.message)),
    };
    cli::ok(ticket)
}

#[tauri::command]
pub fn session_logout(app: AppHandle) -> Value {
    if let Err(error) = run_checked(&["logout".into()], Duration::from_secs(12)) {
        return error.to_value();
    }
    emit_session(&app);
    cli::ok(true)
}

/// 向导完成标记独立落盘，避免与播放状态文件互相污染
#[tauri::command]
pub fn onboarded_set(value: bool) -> Value {
    let path = prefs_path();
    let result = (|| -> std::io::Result<()> {
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir)?;
        }
        let mut prefs = fs::read_to_string(&path)
            .ok()
            .and_then(|text| serde_json::from_str::<Value>(&text).ok())
            .filter(Value::is_object)
            .unwrap_or_else(|| json!({}));
        prefs["onboarded"] = Value::Bool(value);
        fs::write(&path, serde_json::to_string_pretty(&prefs).unwrap_or_default())?;
        Ok(())
    })();
    match result {
        Ok(()) => cli::ok(true),
        Err(error) => CliError::new("UNKNOWN", format!("写入向导状态失败：{error}")).to_value(),
    }
}

#[tauri::command]
pub fn app_info() -> Value {
    cli::ok(json!({
        "version": env!("CARGO_PKG_VERSION"),
        "electron": "tauri 2",
        "platform": std::env::consts::OS,
    }))
}

#[tauri::command]
pub fn open_external(url: String) -> Value {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return cli::ok(true);
    }
    match Command::new("xdg-open").arg(&url).spawn() {
        Ok(_) => cli::ok(true),
        Err(error) => CliError::new("UNKNOWN", format!("无法打开链接：{error}")).to_value(),
    }
}

#[tauri::command]
pub fn window_minimize(window: tauri::WebviewWindow) {
    let _ = window.minimize();
}

#[tauri::command]
pub fn window_maximize(window: tauri::WebviewWindow) {
    let _ = window.maximize();
}

#[tauri::command]
pub fn window_close(window: tauri::WebviewWindow) {
    let _ = window.close();
}

#[tauri::command]
pub fn player_state_get(state: State<'_, AppState>) -> Value {
    cli::ok(state.get())
}

#[tauri::command]
pub fn player_state_set(
    state: State<'_, AppState>,
    queue: Option<Vec<Value>>,
    index: Option<i32>,
    play_mode: Option<String>,
    volume: Option<i32>,
) -> Value {
    let next = state.patch(Patch {
        queue,
        index,
        play_mode,
        volume,
    });
    cli::ok(next)
}

/// 合并 CLI 播放态与 Rust 侧队列，供渲染层 player.state() 使用。
/// Tauri 要求带引用入参的 async 命令返回 Result，Ok 内仍是统一 IpcResult。
#[tauri::command]
pub async fn player_snapshot(state: State<'_, AppState>) -> Result<Value, ()> {
    let play = state.get();
    let cli = cli::run(&["state".into()]).ok();
    Ok(cli::ok(state::build_playback(cli.as_ref(), &play)))
}

/// 唯一状态循环：一次组装，分发到前端、MPRIS、Dock、托盘与通知
pub fn spawn_publisher(app: tauri::AppHandle, state: AppState, mpris: Mpris) {
    thread::spawn(move || {
        let debug = std::env::var("NCM_DEBUG").as_deref() == Ok("1");
        let mut announced = false;
        let mut last_track_id = String::new();
        loop {
            let play = state.get();
            let cli = cli::run(&["state".into()]).ok();
            let payload = state::build_playback(cli.as_ref(), &play);

            match app.emit("player:state-changed", payload.clone()) {
                Ok(()) if debug && !announced => {
                    println!("[state] player:state-changed 已启用");
                    announced = true;
                }
                Err(error) if debug => eprintln!("[state] 推送失败: {error}"),
                _ => {}
            }

            let snapshot = media::from_playback(&payload);
            if mpris.media.update_if_changed(snapshot.clone()) {
                mpris.publish_changes(&snapshot);
            }
            desktop::publish_launcher(&mpris.connection, &payload);
            desktop::set_tray_tooltip(&app, &payload);

            let track_id = payload
                .get("current")
                .and_then(|current| current.get("id"))
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            if !track_id.is_empty() && track_id != last_track_id {
                desktop::notify_track(&mpris.connection, &payload);
            }
            last_track_id = track_id;

            thread::sleep(Duration::from_millis(1500));
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_versions_with_or_without_v_prefix() {
        assert_eq!(version_of("v22.22.1\n"), "22.22.1");
        assert_eq!(version_of("0.1.7"), "0.1.7");
        assert_eq!(version_of("mpv v0.41.0 Copyright"), "0.41.0");
    }

    #[test]
    fn node_22_12_is_the_prompt_support_boundary() {
        assert!(prompt_support("22.12.0"));
        assert!(prompt_support("23.1.0"));
        assert!(!prompt_support("22.11.0"));
        assert!(!prompt_support(""));
    }

    #[test]
    fn detects_configured_app_id() {
        assert!(configured_from_text("appId: abc123\nprivateKey: ****"));
        assert!(!configured_from_text("appId: 未配置\nprivateKey: 未配置"));
        assert!(!configured_from_text("appId: \n"));
    }

    #[test]
    fn clamps_requested_timeout() {
        assert_eq!(clamp_timeout(None), Duration::from_secs(12));
        assert_eq!(clamp_timeout(Some(30)), Duration::from_secs(30));
        assert_eq!(clamp_timeout(Some(999)), Duration::from_secs(60));
    }

    #[test]
    fn login_ticket_exposes_link_or_message() {
        let ok = login_ticket("请打开 https://music.163.com/login?code=abc 扫码", None);
        assert_eq!(ok["ok"], true);
        assert_eq!(ok["link"], "https://music.163.com/login?code=abc");
        assert!(ok["message"].is_null());

        let fail = login_ticket("启动失败", Some("登录启动失败"));
        assert_eq!(fail["ok"], false);
        assert_eq!(fail["message"], "登录启动失败");
    }

    #[test]
    fn rejects_blank_credentials() {
        assert!(validate_credentials("app", "key").is_ok());
        assert_eq!(validate_credentials("", "key").unwrap_err().code, "CREDENTIALS");
        assert_eq!(validate_credentials(" ", "").unwrap_err().code, "CREDENTIALS");
    }

    #[test]
    fn onboarded_set_persists_prefs_without_touching_play_state() {
        let tmp = std::env::temp_dir().join(format!("ncm-prefs-{}", std::process::id()));
        std::env::set_var("XDG_CONFIG_HOME", &tmp);

        assert_eq!(onboarded_set(true)["ok"], true);
        let path = prefs_path();
        assert!(fs::read_to_string(&path).unwrap().contains("\"onboarded\": true"));
        assert_eq!(onboarded_set(false)["ok"], true);
        assert!(fs::read_to_string(&path).unwrap().contains("\"onboarded\": false"));

        fs::remove_dir_all(&tmp).ok();
        std::env::remove_var("XDG_CONFIG_HOME");
    }
}
