//! 阶段 1：ncm-cli 执行层。
//! 与 `electron/ncm/runner.ts` + `cli-bin.ts` 等价：路径解析、串行调用、超时、JSON 提取、错误码分类。

use serde::Serialize;
use serde_json::{json, Value};
use std::env;
use std::fs;
use std::io::Read;
use std::os::unix::fs::PermissionsExt;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

const BIN_NAME: &str = "ncm-cli";
pub const DEFAULT_TIMEOUT: Duration = Duration::from_secs(25);
static CLI_LOCK: Mutex<()> = Mutex::new(());

/// 首命令白名单：渲染层只能下发这些子命令，参数一律以数组传递（不经过 shell）。
const ALLOWED: &[&str] = &[
    "search", "recommend", "playlist", "song", "lyric", "state", "play", "pause", "resume", "stop",
    "next", "prev", "seek", "volume", "queue", "user", "login", "config", "commands", "daily", "fm",
    "--version",
];

#[derive(Debug, Clone)]
pub struct CliError {
    pub code: &'static str,
    pub message: String,
}

impl CliError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self { code, message: message.into() }
    }

    pub fn to_value(&self) -> Value {
        json!({ "ok": false, "code": self.code, "message": self.message })
    }
}

pub fn ok<T: Serialize>(data: T) -> Value {
    json!({ "ok": true, "data": data })
}

pub fn validate(args: &[String]) -> Result<(), CliError> {
    let first = args.first().ok_or_else(|| CliError::new("UNSUPPORTED", "缺少命令"))?;
    if !ALLOWED.contains(&first.as_str()) {
        return Err(CliError::new("UNSUPPORTED", format!("命令未在白名单中：{first}")));
    }
    if args.iter().any(|a| a == "--output" || a.starts_with("--output=")) {
        return Err(CliError::new("UNSUPPORTED", "--output 由桥接层统一追加"));
    }
    Ok(())
}

fn is_executable(path: &Path) -> bool {
    fs::metadata(path)
        .map(|m| m.is_file() && (m.permissions().mode() & 0o111 != 0))
        .unwrap_or(false)
}

fn npmrc_prefix(home: &str) -> Option<String> {
    let text = fs::read_to_string(Path::new(home).join(".npmrc")).ok()?;
    let line = text.lines().find(|l| l.trim_start().starts_with("prefix"))?;
    let value = line.split_once('=')?.1.trim();
    if value.is_empty() {
        return None;
    }
    Some(value.replacen('~', home, 1))
}

/// npm / 版本管理器装的全局命令常见位置；图形会话 PATH 通常不含这些目录。
fn global_bin_dirs(home: &str) -> Vec<String> {
    let mut dirs: Vec<String> = Vec::new();
    if let Some(prefix) = env::var("NPM_CONFIG_PREFIX").ok().or_else(|| npmrc_prefix(home)) {
        dirs.push(format!("{prefix}/bin"));
    }
    for suffix in [".npm-global/bin", ".local/bin", ".volta/bin", ".bun/bin"] {
        dirs.push(format!("{home}/{suffix}"));
    }
    dirs.push("/usr/local/bin".into());
    dirs.push("/usr/bin".into());

    for root in [
        format!("{home}/.nvm/versions/node"),
        format!("{home}/.local/share/fnm/node-versions"),
    ] {
        if let Ok(entries) = fs::read_dir(&root) {
            for entry in entries.flatten() {
                if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    let base = entry.path().display().to_string();
                    dirs.push(format!("{base}/bin"));
                    dirs.push(format!("{base}/installation/bin"));
                }
            }
        }
    }
    dirs.sort();
    dirs.dedup();
    dirs
}

/// 返回 (可执行文件, 待并入 PATH 的目录)。找不到时回落裸命令名，沿用 MISSING_CLI 提示。
fn resolve_from(explicit: Option<String>, path: Option<String>, home: &str) -> (String, Option<String>) {
    if let Some(value) = explicit.map(|v| v.trim().to_string()).filter(|v| !v.is_empty()) {
        return (value, None);
    }
    let mut dirs: Vec<String> = path
        .unwrap_or_default()
        .split(':')
        .filter(|s| !s.is_empty())
        .map(String::from)
        .collect();
    dirs.extend(global_bin_dirs(home));
    for dir in dirs {
        let file = Path::new(&dir).join(BIN_NAME);
        if is_executable(&file) {
            return (file.display().to_string(), Some(dir));
        }
    }
    (BIN_NAME.to_string(), None)
}

pub fn cli_bin() -> String {
    let home = env::var("HOME").unwrap_or_else(|_| "/root".into());
    let (bin, extra_dir) = resolve_from(
        env::var("NCM_CLI_BIN").ok(),
        env::var("PATH").ok(),
        &home,
    );
    // ncm-cli 自身用 /usr/bin/env node 拉起，子进程也要能找到 node
    if let Some(dir) = extra_dir {
        let mut parts: Vec<String> = env::var("PATH")
            .unwrap_or_default()
            .split(':')
            .filter(|s| !s.is_empty())
            .map(String::from)
            .collect();
        if !parts.contains(&dir) {
            parts.push(dir);
            env::set_var("PATH", parts.join(":"));
        }
    }
    bin
}

/// 从混合 stdout/stderr 中抠出第一段完整 JSON 对象
pub fn extract_json(text: &str) -> Option<Value> {
    let start = text.find('{')?;
    let end = text.rfind('}')?;
    if end <= start {
        return None;
    }
    serde_json::from_str::<Value>(&text[start..=end]).ok().filter(|v| v.is_object())
}

/// 与 runner.ts 的 ERR_PATTERNS 一致
pub fn classify(text: &str) -> Option<(&'static str, String)> {
    let patterns: &[(&[&str], &str, &str)] = &[
        (&["API key 未设置", "API key 未配置", "请先配置"], "CREDENTIALS", "尚未配置 appId / privateKey"),
        (&["未登录", "请先登录", "未授权", "登录已过期"], "UNAUTHORIZED", "尚未登录网易云音乐"),
        (&["请求总量超限", "总量超限", "频率限制", "too many requests"], "QUOTA", "请求总量超限"),
        (&["unknown command", "未知命令"], "UNSUPPORTED", "当前 ncm-cli 未提供该命令"),
        (&["ETIMEDOUT", "timed out", "超时"], "TIMEOUT", "命令执行超时"),
        (&["ENOTFOUND", "ECONNREFUSED", "network", "网络"], "NETWORK", "网络异常"),
    ];
    for (needles, code, hint) in patterns {
        if needles.iter().any(|n| text.contains(n)) {
            return Some((code, (*hint).to_string()));
        }
    }
    None
}

struct Output {
    combined: String,
    code: i32,
}

fn exec(bin: &str, argv: &[String], timeout: Duration) -> Result<Output, CliError> {
    let started = Instant::now();
    let mut child = Command::new(bin)
        .args(argv)
        .env("NCM_CLI_NO_UPDATE_CHECK", "1")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                CliError::new("MISSING_CLI", "未找到 ncm-cli，请先安装：npm install -g @music163/ncm-cli")
            } else {
                CliError::new("UNKNOWN", format!("无法启动 ncm-cli：{e}"))
            }
        })?;

    // 同时排空两个管道，避免大输出阻塞子进程
    let mut stdout = child.stdout.take().expect("piped stdout");
    let mut stderr = child.stderr.take().expect("piped stderr");
    let out_reader = thread::spawn(move || {
        let mut buf = String::new();
        let _ = stdout.read_to_string(&mut buf);
        buf
    });
    let err_reader = thread::spawn(move || {
        let mut buf = String::new();
        let _ = stderr.read_to_string(&mut buf);
        buf
    });

    let deadline = Instant::now() + timeout;
    let timed_out = loop {
        match child.try_wait() {
            Ok(Some(_)) => break false,
            Ok(None) if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                break true;
            }
            Ok(None) => thread::sleep(Duration::from_millis(50)),
            Err(e) => return Err(CliError::new("UNKNOWN", format!("等待 ncm-cli 失败：{e}"))),
        }
    };
    let status = child.wait().map_err(|e| CliError::new("UNKNOWN", e.to_string()))?;
    let combined = format!(
        "{}\n{}",
        out_reader.join().unwrap_or_default(),
        err_reader.join().unwrap_or_default()
    );

    if env::var("NCM_DEBUG").as_deref() == Ok("1") {
        println!("[cli] {} {}ms", argv.join(" "), started.elapsed().as_millis());
    }
    if timed_out {
        return Err(CliError::new("TIMEOUT", format!("ncm-cli {} 执行超时", argv[0])));
    }
    Ok(Output { combined, code: status.code().unwrap_or(1) })
}

/** 返回原始文本输出（--version / config list / login --check 等非 JSON 命令） */
pub fn run_text(args: &[String], timeout: Duration) -> Result<String, CliError> {
    validate(args)?;
    let _guard = CLI_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    Ok(exec(&cli_bin(), args, timeout)?.combined)
}

/** 执行子命令并返回解析后的 JSON；自动追加 --output json */
pub fn run(args: &[String]) -> Result<Value, CliError> {
    validate(args)?;
    let mut argv = args.to_vec();
    argv.push("--output".into());
    argv.push("json".into());
    let _guard = CLI_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let output = exec(&cli_bin(), &argv, DEFAULT_TIMEOUT)?;
    let parsed = extract_json(&output.combined);

    if let Some(value) = &parsed {
        if value.get("success") == Some(&Value::Bool(false)) {
            let message = value
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("ncm-cli 返回失败");
            let (code, hint) = classify(message).unwrap_or(("UNKNOWN", message.to_string()));
            return Err(CliError::new(code, hint));
        }
        return Ok(value.clone());
    }
    if output.code != 0 {
        let (code, hint) = classify(&output.combined)
            .unwrap_or(("UNKNOWN", format!("ncm-cli 执行失败 ({})", args.join(" "))));
        return Err(CliError::new(code, hint));
    }
    if let Some((code, hint)) = classify(&output.combined) {
        return Err(CliError::new(code, hint));
    }
    Ok(Value::Null)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_first_json_object_from_mixed_output() {
        let text = "warn: something\n{\"success\":true,\"data\":{\"a\":1}}\ntrailing";
        assert_eq!(extract_json(text).unwrap()["data"]["a"], 1);
        assert!(extract_json("no json here").is_none());
    }

    #[test]
    fn classifies_known_cli_errors() {
        assert_eq!(classify("未登录，请先扫码").unwrap().0, "UNAUTHORIZED");
        assert_eq!(classify("请求总量超限").unwrap().0, "QUOTA");
        assert_eq!(classify("unknown command: foo").unwrap().0, "UNSUPPORTED");
        assert!(classify("一切正常").is_none());
    }

    #[test]
    fn rejects_commands_outside_whitelist() {
        assert!(validate(&["state".into()]).is_ok());
        let err = validate(&["rm".into(), "-rf".into(), "/".into()]).unwrap_err();
        assert_eq!(err.code, "UNSUPPORTED");
        assert!(validate(&["--version".into()]).is_ok());
        assert!(validate(&["state".into(), "--output".into()]).is_err());
    }

    #[test]
    fn global_dirs_cover_npm_prefix_and_version_managers() {
        let dirs = global_bin_dirs("/home/tester");
        assert!(dirs.contains(&"/home/tester/.npm-global/bin".to_string()));
        assert!(dirs.contains(&"/home/tester/.volta/bin".to_string()));
        assert!(dirs.contains(&"/usr/local/bin".to_string()));
    }

    #[test]
    fn explicit_override_wins() {
        let (bin, extra) = resolve_from(Some(" /opt/bin/ncm-cli ".into()), None, "/home/tester");
        assert_eq!(bin, "/opt/bin/ncm-cli");
        assert!(extra.is_none());
    }

    #[test]
    fn graphical_path_falls_back_to_npm_global_bin() {
        // 本机的 NPM_CONFIG_PREFIX 也指向真实全局目录，先隔离掉，只验证 HOME 回落
        let saved_prefix = env::var("NPM_CONFIG_PREFIX").ok();
        env::remove_var("NPM_CONFIG_PREFIX");
        let tmp = env::temp_dir().join("ncm-cli-path-test");
        let bin_dir = tmp.join(".npm-global/bin");
        fs::create_dir_all(&bin_dir).unwrap();
        let file = bin_dir.join(BIN_NAME);
        fs::write(&file, "#!/bin/sh\n").unwrap();
        fs::set_permissions(&file, fs::Permissions::from_mode(0o755)).unwrap();

        let (bin, extra) = resolve_from(
            None,
            Some("/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin".into()),
            &tmp.display().to_string(),
        );
        assert_eq!(bin, file.display().to_string());
        assert_eq!(extra, Some(bin_dir.display().to_string()));
        fs::remove_dir_all(&tmp).ok();
        if let Some(value) = saved_prefix {
            env::set_var("NPM_CONFIG_PREFIX", value);
        }
    }
}
