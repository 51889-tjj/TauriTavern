use std::sync::Arc;

use tauri::{AppHandle, Emitter};
use tt_contracts::remote_chat::RemoteChatDesktopCommand;
use tt_domain::errors::DomainError;
use tt_ports::remote_chat::RemoteChatCommandPublisher;

pub(in crate::app::composition) const REMOTE_CHAT_COMMAND_EVENT: &str =
    "tauritavern-remote-chat-command";

pub(in crate::app::composition) fn remote_chat_command_publisher(
    app_handle: &AppHandle,
) -> Arc<dyn RemoteChatCommandPublisher> {
    Arc::new(TauriRemoteChatCommandPublisher {
        app_handle: app_handle.clone(),
    })
}

struct TauriRemoteChatCommandPublisher {
    app_handle: AppHandle,
}

impl RemoteChatCommandPublisher for TauriRemoteChatCommandPublisher {
    fn publish(&self, command: RemoteChatDesktopCommand) -> Result<(), DomainError> {
        self.app_handle
            .emit(REMOTE_CHAT_COMMAND_EVENT, command)
            .map_err(|error| {
                DomainError::InternalError(format!(
                    "Failed to dispatch Remote Chat command to the desktop UI: {error}"
                ))
            })
    }
}
