#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod cli;
mod commands;
mod mpris;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::cli_invoke,
            commands::cli_text,
            commands::env_check,
            commands::app_info,
            commands::open_external,
            commands::window_minimize,
            commands::window_maximize,
            commands::window_close,
        ])
        .setup(|_app| {
            match mpris::start() {
                Ok(()) => println!("[mpris] org.mpris.MediaPlayer2.ncm-player 已注册"),
                Err(error) => eprintln!("[mpris] 注册失败: {error}"),
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Tauri 启动失败")
}
