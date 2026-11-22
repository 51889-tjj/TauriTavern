use std::sync::Arc;

use tauri::State;
use tt_contracts::host::HostKind;
use tt_contracts::remote_control::{RemoteControlInvokeResult, RemoteControlSessionStatus};

use crate::app::AppState;
use crate::platform::identity::HOST_IDENTITY;
use crate::presentation::commands::helpers::{log_command, map_command_error};
use crate::presentation::errors::CommandError;
use tt_ports::remote_control::RemoteControlApi;

fn ensure_remote_control_desktop() -> Result<(), CommandError> {
    if HOST_IDENTITY.kind != HostKind::Desktop {
        return Err(CommandError::BadRequest(
            "Remote Control hosting is available only on desktop".to_string(),
        ));
    }
    Ok(())
}

#[tauri::command]
pub async fn remote_control_start_session(
    app_state: State<'_, Arc<AppState>>,
) -> Result<RemoteControlSessionStatus, CommandError> {
    log_command("remote_control_start_session");
    ensure_remote_control_desktop()?;

    let lan_status = app_state
        .services
        .lan_sync_service
        .get_status()
        .await
        .map_err(map_command_error("Failed to check LAN server status"))?;
    if !lan_status.running {
        return Err(CommandError::BadRequest(
            "Start the LAN Sync server before enabling Remote Control".to_string(),
        ));
    }

    app_state
        .services
        .remote_control_service
        .start_session()
        .await
        .map_err(map_command_error("Failed to start Remote Control session"))
}

#[tauri::command]
pub async fn remote_control_get_host_status(
    app_state: State<'_, Arc<AppState>>,
) -> Result<RemoteControlSessionStatus, CommandError> {
    log_command("remote_control_get_host_status");
    ensure_remote_control_desktop()?;
    app_state
        .services
        .remote_control_service
        .session_status()
        .await
        .map_err(map_command_error(
            "Failed to read Remote Control host status",
        ))
}

#[tauri::command]
pub async fn remote_control_stop_session(
    app_state: State<'_, Arc<AppState>>,
) -> Result<(), CommandError> {
    log_command("remote_control_stop_session");
    ensure_remote_control_desktop()?;
    app_state
        .services
        .remote_control_service
        .stop_session()
        .await
        .map_err(map_command_error("Failed to stop Remote Control session"))
}

#[tauri::command]
pub async fn remote_control_publish_result(
    app_state: State<'_, Arc<AppState>>,
    result: RemoteControlInvokeResult,
) -> Result<(), CommandError> {
    log_command("remote_control_publish_result");
    ensure_remote_control_desktop()?;
    app_state
        .services
        .remote_control_service
        .publish_result(result)
        .await
        .map_err(map_command_error("Failed to publish Remote Control result"))
}
