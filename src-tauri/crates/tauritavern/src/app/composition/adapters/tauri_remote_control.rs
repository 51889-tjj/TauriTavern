use std::sync::Arc;

use tauri::{AppHandle, Emitter};
use tt_contracts::remote_control::RemoteControlDesktopCommand;
use tt_domain::errors::DomainError;
use tt_ports::remote_control::RemoteControlCommandPublisher;

pub(in crate::app::composition) const REMOTE_CONTROL_COMMAND_EVENT: &str =
    "tauritavern-remote-control-command";

pub(in crate::app::composition) fn remote_control_command_publisher(
    app_handle: &AppHandle,
) -> Arc<dyn RemoteControlCommandPublisher> {
    Arc::new(TauriRemoteControlCommandPublisher {
        app_handle: app_handle.clone(),
    })
}

struct TauriRemoteControlCommandPublisher {
    app_handle: AppHandle,
}

impl RemoteControlCommandPublisher for TauriRemoteControlCommandPublisher {
    fn publish(&self, command: RemoteControlDesktopCommand) -> Result<(), DomainError> {
        self.app_handle
            .emit(REMOTE_CONTROL_COMMAND_EVENT, command)
            .map_err(|error| {
                DomainError::InternalError(format!(
                    "Failed to dispatch Remote Control command to the desktop WebView: {error}"
                ))
            })
    }
}
