//! 阶段 3：MPRIS 服务。
//! 属性从 SharedMedia 实时读取，播控落到真实 CLI / Rust 队列，状态变化时发 PropertiesChanged。

use crate::cli;
use crate::desktop;
use crate::media::{self, MediaSnapshot, SharedMedia};
use crate::state::{AppState, Patch};
use std::collections::HashMap;
use zbus::blocking::{connection::Builder, Connection};
use zbus::interface;
use zbus::zvariant::OwnedValue;

pub struct Mpris {
    pub connection: Connection,
    pub media: SharedMedia,
}

struct MediaPlayer2;

#[interface(name = "org.mpris.MediaPlayer2")]
impl MediaPlayer2 {
    #[zbus(property)]
    fn identity(&self) -> String {
        "黑胶音乐".to_string()
    }

    #[zbus(property)]
    fn desktop_entry(&self) -> String {
        desktop::desktop_id()
    }

    #[zbus(property)]
    fn can_quit(&self) -> bool {
        true
    }

    #[zbus(property)]
    fn can_raise(&self) -> bool {
        true
    }

    fn quit(&self) {
        println!("[mpris] Quit() — 窗口退出尚未接入")
    }

    fn raise(&self) {
        println!("[mpris] Raise() — 窗口前置尚未接入")
    }
}

struct Player {
    media: SharedMedia,
    state: AppState,
}

impl Player {
    fn run(&self, args: &[&str]) {
        let argv: Vec<String> = args.iter().map(|s| s.to_string()).collect();
        let _ = cli::run(&argv);
    }

    /// 与 Electron 版 player.step 等价：Rust 侧队列推进后下发 play
    fn step(&self, delta: i32) {
        let play = self.state.get();
        let len = play.queue.len() as i32;
        if len == 0 {
            return;
        }
        let next = (play.index + delta).rem_euclid(len);
        self.state.patch(Patch {
            index: Some(next),
            ..Default::default()
        });
        let Some(track) = play.queue.get(next as usize) else {
            return;
        };
        let id = track.get("id").and_then(|v| v.as_str()).unwrap_or("");
        if id.is_empty() {
            return;
        }
        let mut argv = vec![
            "play".to_string(),
            "--song".to_string(),
            "--encrypted-id".to_string(),
            id.to_string(),
        ];
        if let Some(original) = track.get("originalId").and_then(|v| v.as_str()) {
            argv.push("--original-id".to_string());
            argv.push(original.to_string());
        }
        let _ = cli::run(&argv);
    }
}

#[interface(name = "org.mpris.MediaPlayer2.Player")]
impl Player {
    #[zbus(property)]
    fn playback_status(&self) -> String {
        self.media.get().status
    }

    #[zbus(property)]
    fn metadata(&self) -> HashMap<String, OwnedValue> {
        media::metadata(&self.media.get())
    }

    #[zbus(property)]
    fn position(&self) -> i64 {
        self.media.get().position_us
    }

    #[zbus(property)]
    fn can_go_next(&self) -> bool {
        true
    }

    #[zbus(property)]
    fn can_go_previous(&self) -> bool {
        true
    }

    #[zbus(property)]
    fn can_play(&self) -> bool {
        true
    }

    #[zbus(property)]
    fn can_pause(&self) -> bool {
        true
    }

    #[zbus(property)]
    fn can_seek(&self) -> bool {
        false
    }

    fn play(&self) {
        self.run(&["resume"]);
    }

    fn pause(&self) {
        self.run(&["pause"]);
    }

    fn play_pause(&self) {
        if self.media.get().status == "Playing" {
            self.run(&["pause"]);
        } else {
            self.run(&["resume"]);
        }
    }

    fn stop(&self) {
        self.run(&["stop"]);
    }

    fn next(&self) {
        self.step(1);
    }

    fn previous(&self) {
        self.step(-1);
    }
}

impl Mpris {
    /// 通知客户端重新读取 Metadata 等属性
    pub fn publish_changes(&self, snapshot: &MediaSnapshot) {
        let body = (
            "org.mpris.MediaPlayer2.Player",
            media::changed_properties(snapshot),
            Vec::<&str>::new(),
        );
        match self.connection.emit_signal(
            None::<()>,
            "/org/mpris/MediaPlayer2",
            "org.freedesktop.DBus.Properties",
            "PropertiesChanged",
            &body,
        ) {
            Ok(()) => {
                if std::env::var("NCM_DEBUG").as_deref() == Ok("1") {
                    println!("[mpris] PropertiesChanged: {}", snapshot.status);
                }
            }
            Err(error) => eprintln!("[mpris] PropertiesChanged 失败: {error}"),
        }
    }
}

/// 返回 Connection 供状态循环复用；调用方必须持有它，否则 D-Bus 名称会被释放
pub fn start(state: AppState) -> zbus::Result<Mpris> {
    let media = SharedMedia::default();
    let connection = Builder::session()?
        .name("org.mpris.MediaPlayer2.ncm-player")?
        .serve_at("/org/mpris/MediaPlayer2", MediaPlayer2)?
        .serve_at(
            "/org/mpris/MediaPlayer2",
            Player {
                media: media.clone(),
                state,
            },
        )?
        .build()?;
    Ok(Mpris { connection, media })
}
