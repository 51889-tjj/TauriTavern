use std::sync::Arc;

use tauri::State;

use crate::app::AppState;
use crate::platform::identity::HOST_IDENTITY;
use crate::presentation::commands::helpers::{
    ensure_ios_policy_allows, log_command, map_command_error,
};
use crate::presentation::errors::CommandError;
use tt_contracts::host::HostKind;
use tt_contracts::remote_chat::{
    RemoteChatEvent, RemoteChatEventsPage, RemoteChatHistory, RemoteChatOwner,
    RemoteChatSessionStatus, RemoteChatSubmit, RemoteChatSubmitResponse, RemoteChatSummary,
    RemoteChatTarget,
};
use tt_ports::remote_chat::RemoteChatApi;

fn ensure_remote_chat_desktop() -> Result<(), CommandError> {
    if HOST_IDENTITY.kind != HostKind::Desktop {
        return Err(CommandError::BadRequest(
            "Remote Chat hosting is available only on desktop".to_string(),
        ));
    }
    Ok(())
}

fn ensure_remote_chat_client_allowed(app_state: &AppState) -> Result<(), CommandError> {
    ensure_ios_policy_allows(
        &app_state.ios_policy,
        app_state.ios_policy.capabilities.sync.lan,
        "sync.lan",
    )
}

#[tauri::command]
pub async fn remote_chat_start_session(
    app_state: State<'_, Arc<AppState>>,
) -> Result<RemoteChatSessionStatus, CommandError> {
    log_command("remote_chat_start_session");
    ensure_remote_chat_desktop()?;

    let lan_status = app_state
        .services
        .lan_sync_service
        .get_status()
        .await
        .map_err(map_command_error("Failed to check LAN server status"))?;
    if !lan_status.running {
        return Err(CommandError::BadRequest(
            "Start the LAN Sync server before enabling Remote Chat".to_string(),
        ));
    }

    app_state
        .services
        .remote_chat_service
        .start_session()
        .await
        .map_err(map_command_error("Failed to start Remote Chat session"))
}

#[tauri::command]
pub async fn remote_chat_get_host_status(
    app_state: State<'_, Arc<AppState>>,
) -> Result<RemoteChatSessionStatus, CommandError> {
    log_command("remote_chat_get_host_status");
    ensure_remote_chat_desktop()?;
    app_state
        .services
        .remote_chat_service
        .session_status()
        .await
        .map_err(map_command_error("Failed to read Remote Chat host status"))
}

#[tauri::command]
pub async fn remote_chat_stop_session(
    app_state: State<'_, Arc<AppState>>,
) -> Result<(), CommandError> {
    log_command("remote_chat_stop_session");
    ensure_remote_chat_desktop()?;
    app_state
        .services
        .remote_chat_service
        .stop_session()
        .await
        .map_err(map_command_error("Failed to stop Remote Chat session"))
}

#[tauri::command]
pub async fn remote_chat_publish_event(
    app_state: State<'_, Arc<AppState>>,
    event: RemoteChatEvent,
) -> Result<(), CommandError> {
    log_command("remote_chat_publish_event");
    ensure_remote_chat_desktop()?;
    app_state
        .services
        .remote_chat_service
        .publish_event(event)
        .await
        .map_err(map_command_error("Failed to publish Remote Chat event"))
}

#[tauri::command]
pub async fn remote_chat_client_connect(
    app_state: State<'_, Arc<AppState>>,
    device_id: String,
) -> Result<RemoteChatSessionStatus, CommandError> {
    log_command("remote_chat_client_connect");
    ensure_remote_chat_client_allowed(&app_state)?;
    app_state
        .services
        .remote_chat_client_service
        .connect(&device_id)
        .await
        .map_err(map_command_error("Failed to connect to Remote Chat host"))
}

#[tauri::command]
pub async fn remote_chat_client_disconnect(
    app_state: State<'_, Arc<AppState>>,
    device_id: String,
) -> Result<(), CommandError> {
    log_command("remote_chat_client_disconnect");
    ensure_remote_chat_client_allowed(&app_state)?;
    app_state
        .services
        .remote_chat_client_service
        .disconnect(&device_id)
        .await;
    Ok(())
}

#[tauri::command]
pub async fn remote_chat_client_status(
    app_state: State<'_, Arc<AppState>>,
    device_id: String,
) -> Result<RemoteChatSessionStatus, CommandError> {
    log_command("remote_chat_client_status");
    ensure_remote_chat_client_allowed(&app_state)?;
    app_state
        .services
        .remote_chat_client_service
        .session_status(&device_id)
        .await
        .map_err(map_command_error("Failed to read Remote Chat host status"))
}

#[tauri::command]
pub async fn remote_chat_client_list_catalog(
    app_state: State<'_, Arc<AppState>>,
    device_id: String,
    session_id: String,
) -> Result<tt_contracts::remote_chat::RemoteChatCatalog, CommandError> {
    log_command("remote_chat_client_list_catalog");
    ensure_remote_chat_client_allowed(&app_state)?;
    app_state
        .services
        .remote_chat_client_service
        .list_catalog(&device_id, &session_id)
        .await
        .map_err(map_command_error("Failed to list Remote Chat characters"))
}

#[tauri::command]
pub async fn remote_chat_client_list_chats(
    app_state: State<'_, Arc<AppState>>,
    device_id: String,
    session_id: String,
    owner: RemoteChatOwner,
) -> Result<Vec<RemoteChatSummary>, CommandError> {
    log_command("remote_chat_client_list_chats");
    ensure_remote_chat_client_allowed(&app_state)?;
    app_state
        .services
        .remote_chat_client_service
        .list_chats(&device_id, &session_id, owner)
        .await
        .map_err(map_command_error(
            "Failed to list Remote Chat conversations",
        ))
}

#[tauri::command]
pub async fn remote_chat_client_get_history(
    app_state: State<'_, Arc<AppState>>,
    device_id: String,
    session_id: String,
    target: RemoteChatTarget,
) -> Result<RemoteChatHistory, CommandError> {
    log_command("remote_chat_client_get_history");
    ensure_remote_chat_client_allowed(&app_state)?;
    app_state
        .services
        .remote_chat_client_service
        .get_history(&device_id, &session_id, target)
        .await
        .map_err(map_command_error("Failed to read Remote Chat history"))
}

#[tauri::command]
pub async fn remote_chat_client_submit(
    app_state: State<'_, Arc<AppState>>,
    device_id: String,
    session_id: String,
    request: RemoteChatSubmit,
) -> Result<RemoteChatSubmitResponse, CommandError> {
    log_command("remote_chat_client_submit");
    ensure_remote_chat_client_allowed(&app_state)?;
    app_state
        .services
        .remote_chat_client_service
        .submit(&device_id, &session_id, request)
        .await
        .map_err(map_command_error("Failed to send Remote Chat message"))
}

#[tauri::command]
pub async fn remote_chat_client_read_events(
    app_state: State<'_, Arc<AppState>>,
    device_id: String,
    session_id: String,
    after_sequence: u64,
) -> Result<RemoteChatEventsPage, CommandError> {
    log_command("remote_chat_client_read_events");
    ensure_remote_chat_client_allowed(&app_state)?;
    app_state
        .services
        .remote_chat_client_service
        .read_events(&device_id, &session_id, after_sequence)
        .await
        .map_err(map_command_error("Failed to read Remote Chat events"))
}

#[tauri::command]
pub async fn remote_chat_client_stop_generation(
    app_state: State<'_, Arc<AppState>>,
    device_id: String,
    session_id: String,
    request_id: String,
) -> Result<(), CommandError> {
    log_command("remote_chat_client_stop_generation");
    ensure_remote_chat_client_allowed(&app_state)?;
    app_state
        .services
        .remote_chat_client_service
        .stop_generation(&device_id, &session_id, &request_id)
        .await
        .map_err(map_command_error("Failed to stop Remote Chat generation"))
}
