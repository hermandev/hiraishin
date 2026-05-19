use std::sync::Arc;

use crate::{
    infrastructure::{
        db::connection::ConnectionRepositoryImpl,
        services::{crypto::AesGcmCryptoService, ssh::RusshSshService},
    },
    state::app_state::AppState,
};
use tauri::Manager;

mod commands;
mod domain;
mod infrastructure;
mod state;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;

            let crypto_service = Arc::new(
                AesGcmCryptoService::load_or_create(app_data_dir.join("crypto.key"))
                    .map_err(|e| -> Box<dyn std::error::Error> { e })?,
            );
            let connection_db = Arc::new(tauri::async_runtime::block_on(
                ConnectionRepositoryImpl::new(
                    app_data_dir.join("hiraishin.db"),
                    crypto_service.clone(),
                ),
            )?);
            let ssh_service = Arc::new(RusshSshService::new(app_data_dir.join("known_hosts")));

            app.manage(AppState::new(ssh_service, connection_db, crypto_service));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::connection::save_connection,
            commands::connection::get_connection,
            commands::connection::get_all_connections,
            commands::connection::update_connection,
            commands::connection::delete_connection,
            commands::connection::get_connections_by_group,
            commands::connection::search_connections,
            commands::connection::save_group,
            commands::connection::get_group,
            commands::connection::get_all_groups,
            commands::connection::update_group,
            commands::connection::delete_group,
            commands::crypto::crypto_encrypt,
            commands::crypto::crypto_decrypt,
            commands::crypto::crypto_hash_password,
            commands::crypto::crypto_verify_password,
            commands::ssh::ssh_test_connection,
            commands::ssh::ssh_exec_command,
            commands::ssh::ssh_open_session,
            commands::ssh::ssh_send_data,
            commands::ssh::ssh_read_data,
            commands::ssh::ssh_resize,
            commands::ssh::ssh_close_session,
            commands::ssh::ssh_session_info,
            commands::ssh::ssh_start_local_port_forward,
            commands::ssh::ssh_stop_local_port_forward,
            commands::ssh::ssh_list_local_port_forwards
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
