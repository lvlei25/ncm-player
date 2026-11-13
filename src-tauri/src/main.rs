#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod cli;
mod commands;
mod desktop;
mod media;
mod mpris;
mod state;

fn main() {
    let shared = state::AppState::load();
    let publisher_state = shared.clone();
    let mpris_state = shared.clone();

    tauri::Builder::default()
        .manage(shared)
        .invoke_handler(tauri::generate_handler![
            commands::cli_invoke,
            commands::cli_text,
            commands::env_check,
            commands::session_save,
            commands::session_login_start,
            commands::session_logout,
            commands::onboarded_set,
            commands::app_info,
            commands::open_external,
            commands::window_minimize,
            commands::window_maximize,
            commands::window_close,
            commands::player_state_get,
            commands::player_state_set,
            commands::player_snapshot,
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            match mpris::start(mpris_state) {
                Ok(service) => {
                    println!("[mpris] org.mpris.MediaPlayer2.ncm-player 已注册");
                    commands::spawn_publisher(handle.clone(), publisher_state, service);
                }
                Err(error) => eprintln!("[mpris] 注册失败: {error}"),
            }
            if let Err(error) = desktop::create_tray(&handle) {
                eprintln!("[tray] 创建失败: {error}");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Tauri 启动失败")
}
