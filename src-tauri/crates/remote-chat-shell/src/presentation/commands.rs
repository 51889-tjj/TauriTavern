use std::sync::Arc;

use tauri::State;
use tt_contracts::remote_chat::{
    RemoteChatCatalog, RemoteChatEventsPage, RemoteChatHistory, RemoteChatOwner,
    RemoteChatSessionStatus, RemoteChatSubmit, RemoteChatSubmitResponse, RemoteChatSummary,
    RemoteChatTarget,
};
use tt_contracts::remote_control::{
    RemoteControlOperation, RemoteControlSessionStatus, RemoteControlValue,
};

use crate::app::composition::ShellServices;

const SHELL_DEVICE_NAME: &str = "TauriTavern Remote";

#[tauri::command]
pub(crate) fn get_window_snapshot() -> Option<tt_contracts::window_layout::WindowSnapshot> {
    None
}

#[tauri::command]
pub(crate) async fn lan_sync_list_devices(
    services: State<'_, Arc<ShellServices>>,
) -> Result<Vec<tt_domain::models::lan_sync::LanSyncPairedDeviceSummary>, String> {
    services
        .lan_sync
        .list_paired_devices()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn lan_sync_request_pairing(
    services: State<'_, Arc<ShellServices>>,
    pair_uri: String,
) -> Result<tt_domain::models::lan_sync::LanSyncPairedDeviceSummary, String> {
    let paired_device =
        if let Err(error) = services.lan_sync.set_device_name(SHELL_DEVICE_NAME).await {
            Err(error.to_string())
        } else {
            services
                .lan_sync
                .request_pairing(&pair_uri)
                .await
                .map_err(|error| error.to_string())
        };
    let stop_result = services.lan_sync.shutdown().await;
    match paired_device {
        Ok(device) => {
            stop_result.map_err(|error| error.to_string())?;
            Ok(device)
        }
        Err(error) => {
            if let Err(stop_error) = stop_result {
                return Err(format!(
                    "{error}; failed to stop temporary pairing server: {stop_error}"
                ));
            }
            Err(error)
        }
    }
}

#[tauri::command]
pub(crate) async fn remote_chat_client_connect(
    services: State<'_, Arc<ShellServices>>,
    device_id: String,
) -> Result<RemoteChatSessionStatus, String> {
    services
        .remote_chat_client
        .connect(&device_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn remote_chat_client_disconnect(
    services: State<'_, Arc<ShellServices>>,
    device_id: String,
) -> Result<(), String> {
    services.remote_chat_client.disconnect(&device_id).await;
    Ok(())
}

#[tauri::command]
pub(crate) async fn remote_chat_client_status(
    services: State<'_, Arc<ShellServices>>,
    device_id: String,
) -> Result<RemoteChatSessionStatus, String> {
    services
        .remote_chat_client
        .session_status(&device_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn remote_chat_client_list_catalog(
    services: State<'_, Arc<ShellServices>>,
    device_id: String,
    session_id: String,
) -> Result<RemoteChatCatalog, String> {
    services
        .remote_chat_client
        .list_catalog(&device_id, &session_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn remote_chat_client_list_chats(
    services: State<'_, Arc<ShellServices>>,
    device_id: String,
    session_id: String,
    owner: RemoteChatOwner,
) -> Result<Vec<RemoteChatSummary>, String> {
    services
        .remote_chat_client
        .list_chats(&device_id, &session_id, owner)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn remote_chat_client_get_history(
    services: State<'_, Arc<ShellServices>>,
    device_id: String,
    session_id: String,
    target: RemoteChatTarget,
) -> Result<RemoteChatHistory, String> {
    services
        .remote_chat_client
        .get_history(&device_id, &session_id, target)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn remote_chat_client_submit(
    services: State<'_, Arc<ShellServices>>,
    device_id: String,
    session_id: String,
    request: RemoteChatSubmit,
) -> Result<RemoteChatSubmitResponse, String> {
    services
        .remote_chat_client
        .submit(&device_id, &session_id, request)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn remote_chat_client_read_events(
    services: State<'_, Arc<ShellServices>>,
    device_id: String,
    session_id: String,
    after_sequence: u64,
) -> Result<RemoteChatEventsPage, String> {
    services
        .remote_chat_client
        .read_events(&device_id, &session_id, after_sequence)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn remote_chat_client_stop_generation(
    services: State<'_, Arc<ShellServices>>,
    device_id: String,
    session_id: String,
    request_id: String,
) -> Result<(), String> {
    services
        .remote_chat_client
        .stop_generation(&device_id, &session_id, &request_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn remote_control_client_connect(
    services: State<'_, Arc<ShellServices>>,
    device_id: String,
) -> Result<RemoteControlSessionStatus, String> {
    services
        .remote_control_client
        .connect(&device_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn remote_control_client_disconnect(
    services: State<'_, Arc<ShellServices>>,
    device_id: String,
) -> Result<(), String> {
    services.remote_control_client.disconnect(&device_id).await;
    Ok(())
}

#[tauri::command]
pub(crate) async fn remote_control_client_status(
    services: State<'_, Arc<ShellServices>>,
    device_id: String,
) -> Result<RemoteControlSessionStatus, String> {
    services
        .remote_control_client
        .session_status(&device_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn remote_control_client_invoke(
    services: State<'_, Arc<ShellServices>>,
    device_id: String,
    session_id: String,
    request_id: String,
    operation: RemoteControlOperation,
) -> Result<RemoteControlValue, String> {
    services
        .remote_control_client
        .invoke(&device_id, &session_id, &request_id, operation)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn remote_control_client_get_sillytavern_settings(
    services: State<'_, Arc<ShellServices>>,
    device_id: String,
    session_id: String,
) -> Result<tauri::ipc::Response, String> {
    let bytes = services
        .remote_control_client
        .get_sillytavern_settings(&device_id, &session_id)
        .await
        .map_err(|error| error.to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
}
