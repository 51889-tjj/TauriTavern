use serde::{Deserialize, Serialize};

pub const REMOTE_CHAT_MAX_INPUT_CHARS: usize = 16_000;
pub const REMOTE_CHAT_MAX_HISTORY_MESSAGES: usize = 100;

/// A chat owned by the desktop TauriTavern instance.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum RemoteChatTarget {
    Character {
        character_name: String,
        file_name: String,
    },
    Group {
        group_id: String,
        chat_id: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum RemoteChatOwner {
    Character { character_name: String },
    Group { group_id: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteChatCharacter {
    pub character_name: String,
    pub display_name: String,
    pub avatar: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteChatGroup {
    pub group_id: String,
    pub name: String,
    pub avatar: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteChatCatalog {
    pub characters: Vec<RemoteChatCharacter>,
    pub groups: Vec<RemoteChatGroup>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteChatSummary {
    pub target: RemoteChatTarget,
    pub title: String,
    pub preview: String,
    pub message_count: usize,
    pub updated_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteChatMessage {
    pub name: String,
    pub is_user: bool,
    pub is_system: bool,
    pub text: String,
    pub sent_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteChatHistory {
    pub target: RemoteChatTarget,
    pub title: String,
    pub messages: Vec<RemoteChatMessage>,
    pub generation_active: bool,
    pub latest_sequence: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteChatSessionStatus {
    pub active: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteChatSubmit {
    /// Client-generated idempotency key. Retrying a request must not send twice.
    pub request_id: String,
    pub target: RemoteChatTarget,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteChatSessionRequest {
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteChatChatsRequest {
    pub session_id: String,
    pub owner: RemoteChatOwner,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteChatHistoryRequest {
    pub session_id: String,
    pub target: RemoteChatTarget,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteChatSubmitRequest {
    pub session_id: String,
    pub request: RemoteChatSubmit,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteChatEventsRequest {
    pub session_id: String,
    pub after_sequence: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteChatStopRequest {
    pub session_id: String,
    pub request_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteChatSubmitResponse {
    pub request_id: String,
    pub accepted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum RemoteChatDesktopCommand {
    SendMessage {
        session_id: String,
        request_id: String,
        target: RemoteChatTarget,
        text: String,
    },
    StopGeneration {
        session_id: String,
        request_id: String,
    },
    EndSession {
        session_id: String,
    },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RemoteChatEventKind {
    Token,
    Completed,
    Stopped,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteChatEvent {
    pub sequence: u64,
    pub request_id: String,
    pub kind: RemoteChatEventKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteChatEventsPage {
    pub events: Vec<RemoteChatEvent>,
    pub next_sequence: u64,
    pub generation_active: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn target_and_event_contracts_round_trip_with_stable_discriminators() {
        let target = RemoteChatTarget::Character {
            character_name: "character".to_string(),
            file_name: "2026-11-21 10:00:00".to_string(),
        };
        let target_value = serde_json::to_value(&target).expect("serialize remote chat target");
        assert_eq!(target_value["kind"], "character");
        assert_eq!(target_value["characterName"], "character");
        assert_eq!(
            serde_json::from_value::<RemoteChatTarget>(target_value).expect("deserialize target"),
            target
        );

        let event = RemoteChatEvent {
            sequence: 4,
            request_id: "request-1".to_string(),
            kind: RemoteChatEventKind::Token,
            text: Some("hello".to_string()),
            error: None,
        };
        let event_value = serde_json::to_value(&event).expect("serialize remote chat event");
        assert_eq!(event_value["requestId"], "request-1");
        assert_eq!(event_value["kind"], "token");
        assert_eq!(
            serde_json::from_value::<RemoteChatEvent>(event_value)
                .expect("deserialize event")
                .sequence,
            4
        );

        let command = RemoteChatDesktopCommand::EndSession {
            session_id: "session-1".to_string(),
        };
        let command_value = serde_json::to_value(&command).expect("serialize desktop command");
        assert_eq!(command_value["kind"], "end_session");
        assert_eq!(command_value["sessionId"], "session-1");
    }
}
