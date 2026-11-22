use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const REMOTE_CONTROL_MAX_REQUEST_ID_CHARS: usize = 128;
pub const REMOTE_CONTROL_MAX_OPERATION_BYTES: usize = 256 * 1024;
pub const REMOTE_CONTROL_MAX_RESULT_BYTES: usize = 8 * 1024 * 1024;
pub const REMOTE_CONTROL_MAX_SETTINGS_BYTES: usize = 32 * 1024 * 1024;
pub const REMOTE_CONTROL_MAX_CHAT_PAYLOAD_BYTES: usize = 64 * 1024 * 1024;
pub const REMOTE_CONTROL_MAX_PENDING_REQUESTS: usize = 16;
pub const REMOTE_CONTROL_REQUEST_TIMEOUT_SECS: u64 = 60;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteControlSessionStatus {
    pub active: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RemoteControlSettingsPage {
    Chat,
    Backups,
    Appearance,
    Network,
    Privacy,
    Models,
    Agent,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RemoteControlSillyTavernSettingsPage {
    Generation,
    Interface,
}

/// The mobile client can request only explicitly supported Remote Control operations.
/// Adding an operation is an explicit capability change, not a generic Tauri invoke.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum RemoteControlOperation {
    GetTauriTavernSettingsPage {
        page: RemoteControlSettingsPage,
    },
    UpdateTauriTavernSettingsPage {
        page: RemoteControlSettingsPage,
        dto: Value,
    },
    GetSillyTavernSettingsPage {
        page: RemoteControlSillyTavernSettingsPage,
    },
    UpdateSillyTavernSettingsPage {
        page: RemoteControlSillyTavernSettingsPage,
        dto: Value,
    },
    GetChatCompletionSettings {
        source: Option<String>,
    },
    UpdateChatCompletionSettings {
        dto: Value,
    },
    SetChatCompletionApiKey {
        source: String,
        value: String,
        label: Option<String>,
    },
    DeleteChatCompletionApiKey {
        source: String,
    },
    GetExtensions,
    SetExtensionEnabled {
        extension_name: String,
        enabled: bool,
    },
    InstallExtension {
        url: String,
        branch: Option<String>,
    },
    UpdateExtension {
        extension_name: String,
    },
    DeleteExtension {
        extension_name: String,
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
#[serde(rename_all = "camelCase")]
pub struct RemoteControlChatPayloadRequest {
    pub session_id: String,
    pub target: RemoteControlChatTarget,
    pub allow_not_found: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum RemoteControlChatTarget {
    Character {
        character_id: String,
        file_name: String,
    },
    Group {
        chat_id: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteControlResourceRequest {
    pub session_id: String,
    pub method: String,
    pub path: String,
    #[serde(default)]
    pub headers: std::collections::BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteControlResourceResponse {
    pub status: u16,
    pub headers: std::collections::BTreeMap<String, String>,
    pub body: Vec<u8>,
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
        let operation = RemoteControlOperation::UpdateTauriTavernSettingsPage {
            page: RemoteControlSettingsPage::Chat,
            dto: serde_json::json!({ "chat_virtualization_enabled": true }),
        };
        let value = serde_json::to_value(&operation).expect("serialize operation");
        assert_eq!(value["kind"], "update_tauri_tavern_settings_page");
        assert_eq!(value["page"], "chat");
        assert_eq!(value["dto"]["chat_virtualization_enabled"], true);
        assert_eq!(
            serde_json::to_value(RemoteControlOperation::GetTauriTavernSettingsPage {
                page: RemoteControlSettingsPage::Chat,
            })
            .expect("serialize page-scoped TauriTavern settings read"),
            serde_json::json!({
                "kind": "get_tauri_tavern_settings_page",
                "page": "chat",
            })
        );
        assert_eq!(
            serde_json::to_value(RemoteControlOperation::GetSillyTavernSettingsPage {
                page: RemoteControlSillyTavernSettingsPage::Generation,
            })
            .expect("serialize page-scoped SillyTavern settings read"),
            serde_json::json!({
                "kind": "get_silly_tavern_settings_page",
                "page": "generation",
            })
        );
        assert_eq!(
            serde_json::to_value(RemoteControlOperation::UpdateTauriTavernSettingsPage {
                page: RemoteControlSettingsPage::Chat,
                dto: serde_json::json!({ "chat_virtualization_enabled": true }),
            })
            .expect("serialize page-scoped TauriTavern settings update"),
            serde_json::json!({
                "kind": "update_tauri_tavern_settings_page",
                "page": "chat",
                "dto": { "chat_virtualization_enabled": true },
            })
        );
        assert_eq!(
            serde_json::to_value(RemoteControlOperation::SetExtensionEnabled {
                extension_name: "third-party/example".to_string(),
                enabled: false,
            })
            .expect("serialize extension enable state"),
            serde_json::json!({
                "kind": "set_extension_enabled",
                "extensionName": "third-party/example",
                "enabled": false,
            })
        );
        assert_eq!(
            serde_json::to_value(RemoteControlOperation::GetChatCompletionSettings {
                source: Some("openai".to_string()),
            })
            .expect("serialize page-scoped Chat Completion read"),
            serde_json::json!({
                "kind": "get_chat_completion_settings",
                "source": "openai",
            })
        );
        assert_eq!(
            serde_json::to_value(RemoteControlOperation::InstallExtension {
                url: "https://example.test/repo.git".to_string(),
                branch: Some("main".to_string()),
            })
            .expect("serialize extension installation"),
            serde_json::json!({
                "kind": "install_extension",
                "url": "https://example.test/repo.git",
                "branch": "main",
            })
        );
        let unsupported = serde_json::from_value::<RemoteControlOperation>(serde_json::json!({
            "kind": "execute_arbitrary_command",
            "command": "anything"
        }));
        assert!(unsupported.is_err());
    }
}
