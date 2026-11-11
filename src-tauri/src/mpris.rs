//! 阶段 0：最小 MPRIS 服务骨架。
//! 只注册服务名与两个接口的基本属性/方法，命令先打印日志；
//! 阶段 3 再接入 player 状态（PropertiesChanged / Seeked）与真实播控动作。

use std::sync::OnceLock;
use zbus::blocking::{connection::Builder, Connection};
use zbus::interface;

static CONNECTION: OnceLock<Connection> = OnceLock::new();

struct MediaPlayer2;

#[interface(name = "org.mpris.MediaPlayer2")]
impl MediaPlayer2 {
    #[zbus(property)]
    fn identity(&self) -> String {
        "黑胶音乐".to_string()
    }

    #[zbus(property)]
    fn desktop_entry(&self) -> String {
        "ncm-player".to_string()
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
        println!("[mpris] Quit() — 阶段 3 接入 app.exit")
    }

    fn raise(&self) {
        println!("[mpris] Raise() — 阶段 3 接入窗口前置")
    }
}

struct Player;

#[interface(name = "org.mpris.MediaPlayer2.Player")]
impl Player {
    #[zbus(property)]
    fn playback_status(&self) -> String {
        "Stopped".to_string()
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
        println!("[mpris] Play() — 阶段 3 接入 player.toggle")
    }

    fn pause(&self) {
        println!("[mpris] Pause() — 阶段 3 接入 player.toggle")
    }

    fn play_pause(&self) {
        println!("[mpris] PlayPause() — 阶段 3 接入 player.toggle")
    }

    fn stop(&self) {
        println!("[mpris] Stop() — 阶段 3 接入 player.stop（只停播、不退出）")
    }

    fn next(&self) {
        println!("[mpris] Next() — 阶段 3 接入 player.step(1)")
    }

    fn previous(&self) {
        println!("[mpris] Previous() — 阶段 3 接入 player.step(-1)")
    }
}

pub fn start() -> zbus::Result<()> {
    let connection = Builder::session()?
        .name("org.mpris.MediaPlayer2.ncm-player")?
        .serve_at("/org/mpris/MediaPlayer2", MediaPlayer2)?
        .serve_at("/org/mpris/MediaPlayer2", Player)?
        .build()?;
    // Connection 必须保持存活，否则 D-Bus 名称会被释放
    let _ = CONNECTION.set(connection);
    Ok(())
}
