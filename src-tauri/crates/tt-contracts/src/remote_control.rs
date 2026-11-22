use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const REMOTE_CONTROL_MAX_REQUEST_ID_CHARS: usize = 128;
pub const REMOTE_CONTROL_MAX_OPERATION_BYTES: usize = 256 * 1024;
pub const REMOTE_CONTROL_MAX_RESULT_BYTES: usize = 8 * 1024 * 1024;
pub const REMOTE_CONTROL_MAX_SETTINGS_BYTES: usize = 32 * 1024 * 1024;
pub const REMOTE_CONTROL_MAX_PENDING_REQUESTS: usize = 16;
pub const REMOTE_CONTROL_REQUEST_TIMEOUT_SECS: u64 = 60;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteControlSessionStatus {
    pub active: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
}

/// The mobile client can request only these first-phase configuration operations.
/// Adding an operation is an explicit capability change, not a generic Tauri invoke.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum RemoteControlOperation {
    WaitForBackendReady,
    BackendErrorBridgeReady,
    GetClientVersion,
    GetTauriTavernSettings,
    UpdateTauriTavernSettings {
        dto: Value,
    },
    GetPersonas,
    GetBootstrapMetadata,
    GetExtensions,
    GetAllBackgrounds,
    GetAllBackgroundMetadata {
        prefix: Option<String>,
    },
    GetBackgroundFolders,
    GetChatCompletionsStatus,
    ListActiveAgentRuns,
    ReadFrontendTemplate {
        name: String,
    },
    ReadFrontendExtensionTemplate {
        extension: String,
        name: String,
    },
    SaveTheme {
        dto: Value,
    },
    DeleteTheme {
        dto: Value,
    },
    SaveQuickReplySet {
        payload: Value,
    },
    DeleteQuickReplySet {
        payload: Value,
    },
    SavePreset {
        dto: Value,
    },
    DeletePreset {
        dto: Value,
    },
    RestorePreset {
        dto: Value,
    },
    ReadSecretState,
    ReadSecretSettings,
    WriteSecret {
        dto: Value,
    },
    DeleteSecret {
        dto: Value,
    },
    ListLlmConnections,
    LoadLlmConnection {
        dto: Value,
    },
    SaveLlmConnection {
        dto: Value,
    },
    DeleteLlmConnection {
        dto: Value,
    },
    BeginSettingsCommit {
        expected_revision: Option<Value>,
    },
    AppendSettingsCommitChunk {
        data: Vec<u8>,
        headers: std::collections::BTreeMap<String, String>,
    },
    FinishSettingsCommit {
        session_id: String,
        expected_size: u64,
    },
    AbortSettingsCommit {
        session_id: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteControlInvokeRequest {
    pub session_id: String,
    pub request_id: String,
    pub operation: RemoteControlOperation,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteControlSettingsRequest {
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum RemoteControlValue {
    Json(Value),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum RemoteControlOutcome {
    Success(RemoteControlValue),
    Failure(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteControlInvokeResult {
    pub session_id: String,
    pub request_id: String,
    pub outcome: RemoteControlOutcome,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum RemoteControlDesktopCommand {
    Invoke {
        session_id: String,
        request_id: String,
        operation: RemoteControlOperation,
    },
    EndSession {
        session_id: String,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn remote_control_operations_use_explicit_discriminators() {
        let operation = RemoteControlOperation::UpdateTauriTavernSettings {
            dto: serde_json::json!({ "close_to_tray_on_close": true }),
        };
        let value = serde_json::to_value(&operation).expect("serialize operation");
        assert_eq!(value["kind"], "update_tauri_tavern_settings");
        assert_eq!(value["dto"]["close_to_tray_on_close"], true);
        assert_eq!(
            serde_json::to_value(RemoteControlOperation::GetTauriTavernSettings)
                .expect("serialize TauriTavern settings read")["kind"],
            "get_tauri_tavern_settings"
        );

        let unsupported = serde_json::from_value::<RemoteControlOperation>(serde_json::json!({
            "kind": "execute_arbitrary_command",
            "command": "anything"
        }));
        assert!(unsupported.is_err());
    }
}
