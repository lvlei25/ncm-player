//! 阶段 1：Tauri IPC 命令。渲染层只下发语义化参数，CLI 调用一律经过 `cli.rs` 白名单。

use crate::cli::{self, CliError};
use serde_json::{json, Value};
use std::process::Command;
use std::time::Duration;

#[tauri::command]
pub fn cli_invoke(args: Vec<String>) -> Value {
    match cli::run(&args) {
        Ok(value) => cli::ok(value),
        Err(error) => error.to_value(),
    }
}

#[tauri::command]
pub fn cli_text(args: Vec<String>) -> Value {
    match cli::run_text(&args, Duration::from_secs(12)) {
        Ok(text) => cli::ok(text),
        Err(error) => error.to_value(),
    }
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
        .map(|text| {
            text.lines().any(|line| {
                let key = line.split(':').next().unwrap_or("").trim();
                key.eq_ignore_ascii_case("appid") && !line.contains("未配置") && !line.trim_end().ends_with(':')
            })
        })
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
}
