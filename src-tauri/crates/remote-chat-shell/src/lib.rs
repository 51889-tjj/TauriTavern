mod app;
mod platform;
mod presentation;

use std::sync::Arc;

use tauri::Manager;

use crate::app::composition::build_services;
use crate::presentation::commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().plugin(
        tauri::plugin::Builder::<tauri::Wry>::new("remote_shell_identity")
            .js_init_script(crate::platform::identity::initialization_script())
            .build(),
    );

    #[cfg(target_os = "ios")]
    let builder = builder.plugin(tauri_plugin_barcode_scanner::init());

    builder
        .setup(|app| {
            let data_dir = app.path().app_local_data_dir()?;
            app.manage(Arc::new(build_services(data_dir)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_window_snapshot,
            commands::lan_sync_list_devices,
            commands::lan_sync_request_pairing,
            commands::remote_chat_client_connect,
            commands::remote_chat_client_disconnect,
            commands::remote_chat_client_status,
            commands::remote_chat_client_list_catalog,
            commands::remote_chat_client_list_chats,
            commands::remote_chat_client_get_history,
            commands::remote_chat_client_submit,
            commands::remote_chat_client_read_events,
            commands::remote_chat_client_stop_generation,
            commands::remote_control_client_connect,
            commands::remote_control_client_disconnect,
            commands::remote_control_client_status,
            commands::remote_control_client_invoke,
            commands::remote_control_client_get_sillytavern_settings,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run TauriTavern Remote");
}
