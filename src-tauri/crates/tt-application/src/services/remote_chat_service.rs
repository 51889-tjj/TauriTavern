use std::collections::VecDeque;
use std::sync::Arc;

use async_trait::async_trait;
use tokio::sync::Mutex;
use tt_contracts::remote_chat::{
    REMOTE_CHAT_MAX_HISTORY_MESSAGES, REMOTE_CHAT_MAX_INPUT_CHARS, RemoteChatCatalog,
    RemoteChatCharacter, RemoteChatDesktopCommand, RemoteChatEvent, RemoteChatEventKind,
    RemoteChatEventsPage, RemoteChatGroup, RemoteChatHistory, RemoteChatMessage, RemoteChatOwner,
    RemoteChatSessionStatus, RemoteChatSubmit, RemoteChatSubmitResponse, RemoteChatSummary,
    RemoteChatTarget,
};
use tt_domain::errors::DomainError;
use tt_ports::remote_chat::{RemoteChatApi, RemoteChatCommandPublisher, RemoteChatEventSink};

use crate::dto::character_dto::GetCharacterChatsDto;
use crate::services::character_service::CharacterService;
use crate::services::chat_service::ChatService;
use crate::services::group_chat_service::GroupChatService;
use crate::services::group_service::GroupService;

const MAX_RETAINED_EVENTS: usize = 512;
const MAX_RECENT_REQUEST_IDS: usize = 64;
const MAX_REQUEST_ID_CHARS: usize = 128;
const MAX_EVENT_TEXT_CHARS: usize = 8_192;

#[derive(Default)]
struct RemoteChatRuntime {
    session_id: Option<String>,
    active_request: Option<ActiveRequest>,
    next_sequence: u64,
    events: VecDeque<RemoteChatEvent>,
    recent_request_ids: VecDeque<String>,
}

struct ActiveRequest {
    request_id: String,
    target: RemoteChatTarget,
}

pub struct RemoteChatService {
    characters: Arc<CharacterService>,
    chats: Arc<ChatService>,
    groups: Arc<GroupService>,
    group_chats: Arc<GroupChatService>,
    command_publisher: Arc<dyn RemoteChatCommandPublisher>,
    runtime: Mutex<RemoteChatRuntime>,
}

impl RemoteChatService {
    pub fn new(
        characters: Arc<CharacterService>,
        chats: Arc<ChatService>,
        groups: Arc<GroupService>,
        group_chats: Arc<GroupChatService>,
        command_publisher: Arc<dyn RemoteChatCommandPublisher>,
    ) -> Self {
        Self {
            characters,
            chats,
            groups,
            group_chats,
            command_publisher,
            runtime: Mutex::new(RemoteChatRuntime::default()),
        }
    }

    pub async fn start_session(&self) -> Result<RemoteChatSessionStatus, DomainError> {
        let mut runtime = self.runtime.lock().await;
        if runtime.session_id.is_some() {
            return Err(DomainError::Conflict(
                "Remote Chat session is already active".to_string(),
            ));
        }

        let session_id = uuid::Uuid::new_v4().to_string();
        runtime.session_id = Some(session_id.clone());
        runtime.active_request = None;
        runtime.next_sequence = 0;
        runtime.events.clear();
        runtime.recent_request_ids.clear();

        Ok(RemoteChatSessionStatus {
            active: true,
            session_id: Some(session_id),
        })
    }

    pub async fn stop_session(&self) -> Result<(), DomainError> {
        let (session_id, stop_command) = {
            let mut runtime = self.runtime.lock().await;
            let Some(session_id) = runtime.session_id.take() else {
                return Ok(());
            };
            let stop_command = runtime.active_request.take().map(|active| {
                RemoteChatDesktopCommand::StopGeneration {
                    session_id: session_id.clone(),
                    request_id: active.request_id,
                }
            });
            (session_id, stop_command)
        };

        let stop_error = if let Some(command) = stop_command {
            self.command_publisher.publish(command).err()
        } else {
            None
        };
        self.command_publisher
            .publish(RemoteChatDesktopCommand::EndSession { session_id })?;
        if let Some(error) = stop_error {
            return Err(error);
        }
        Ok(())
    }

    pub async fn publish_event(&self, mut event: RemoteChatEvent) -> Result<(), DomainError> {
        if event.request_id.trim().is_empty() || event.request_id.len() > MAX_REQUEST_ID_CHARS {
            return Err(DomainError::InvalidData(
                "Invalid Remote Chat request id".to_string(),
            ));
        }
        if event
            .text
            .as_deref()
            .is_some_and(|text| text.chars().count() > MAX_EVENT_TEXT_CHARS)
        {
            return Err(DomainError::InvalidData(
                "Remote Chat event text exceeds the allowed size".to_string(),
            ));
        }
        if event
            .error
            .as_deref()
            .is_some_and(|message| message.chars().count() > MAX_EVENT_TEXT_CHARS)
        {
            return Err(DomainError::InvalidData(
                "Remote Chat error text exceeds the allowed size".to_string(),
            ));
        }

        let mut runtime = self.runtime.lock().await;
        if runtime.session_id.is_none() {
            return Err(DomainError::Conflict(
                "Remote Chat session is not active".to_string(),
            ));
        }
        let Some(active) = runtime.active_request.as_ref() else {
            return Err(DomainError::Conflict(
                "There is no active Remote Chat request".to_string(),
            ));
        };
        if active.request_id != event.request_id {
            return Err(DomainError::Conflict(
                "Remote Chat event does not match the active request".to_string(),
            ));
        }

        runtime.next_sequence = runtime.next_sequence.checked_add(1).ok_or_else(|| {
            DomainError::InternalError("Remote Chat sequence overflow".to_string())
        })?;
        event.sequence = runtime.next_sequence;
        runtime.events.push_back(event.clone());
        while runtime.events.len() > MAX_RETAINED_EVENTS {
            runtime.events.pop_front();
        }
        if matches!(
            event.kind,
            RemoteChatEventKind::Completed
                | RemoteChatEventKind::Stopped
                | RemoteChatEventKind::Failed
        ) {
            runtime.active_request = None;
        }
        Ok(())
    }

    async fn list_character_chats(
        &self,
        character_name: String,
    ) -> Result<Vec<RemoteChatSummary>, DomainError> {
        let chats = self
            .characters
            .get_character_chats(GetCharacterChatsDto {
                name: character_name.clone(),
                simple: true,
            })
            .await
            .map_err(DomainError::from)?;

        Ok(chats
            .into_iter()
            .map(|chat| RemoteChatSummary {
                target: RemoteChatTarget::Character {
                    character_name: character_name.clone(),
                    file_name: chat.file_name.clone(),
                },
                title: chat.file_name,
                preview: chat.last_message,
                message_count: chat.chat_items,
                updated_at_ms: chat.last_message_date,
            })
            .collect())
    }

    async fn list_group_chats(
        &self,
        group_id: String,
    ) -> Result<Vec<RemoteChatSummary>, DomainError> {
        let group = self
            .groups
            .get_group(&group_id)
            .await?
            .ok_or_else(|| DomainError::NotFound(format!("Group not found: {group_id}")))?;
        let mut chat_ids = group.chats.clone();
        if chat_ids.is_empty() && !group.chat_id.is_empty() {
            chat_ids.push(group.chat_id.clone());
        }
        let results = self
            .group_chats
            .list_group_chat_summaries(Some(&chat_ids), false)
            .await
            .map_err(DomainError::from)?;

        Ok(results
            .into_iter()
            .filter_map(|chat| {
                let chat_id = chat.chat_id.clone()?;
                Some(RemoteChatSummary {
                    target: RemoteChatTarget::Group {
                        group_id: group_id.clone(),
                        chat_id,
                    },
                    title: chat.file_name,
                    preview: chat.preview,
                    message_count: chat.message_count,
                    updated_at_ms: chat.date,
                })
            })
            .collect())
    }

    async fn read_character_history(
        &self,
        character_name: String,
        file_name: String,
    ) -> Result<RemoteChatHistory, DomainError> {
        let tail = self
            .chats
            .get_chat_payload_tail_lines(
                &character_name,
                &file_name,
                REMOTE_CHAT_MAX_HISTORY_MESSAGES,
            )
            .await
            .map_err(DomainError::from)?;
        let target = RemoteChatTarget::Character {
            character_name,
            file_name: file_name.clone(),
        };
        let messages = tail
            .lines
            .into_iter()
            .map(|line| parse_remote_chat_message(&line, &file_name))
            .collect::<Result<Vec<_>, _>>()?;
        let runtime = self.runtime.lock().await;
        Ok(RemoteChatHistory {
            target: target.clone(),
            title: file_name,
            messages,
            generation_active: runtime
                .active_request
                .as_ref()
                .is_some_and(|active| active.target == target),
            latest_sequence: runtime.next_sequence,
        })
    }

    async fn read_group_history(
        &self,
        group_id: String,
        chat_id: String,
    ) -> Result<RemoteChatHistory, DomainError> {
        let group = self
            .groups
            .get_group(&group_id)
            .await?
            .ok_or_else(|| DomainError::NotFound(format!("Group not found: {group_id}")))?;
        if !group.chats.contains(&chat_id) && group.chat_id != chat_id {
            return Err(DomainError::NotFound(format!(
                "Chat {chat_id} does not belong to group {group_id}"
            )));
        }
        let tail = self
            .group_chats
            .get_group_chat_payload_tail_lines(&chat_id, REMOTE_CHAT_MAX_HISTORY_MESSAGES)
            .await
            .map_err(DomainError::from)?;
        let messages = tail
            .lines
            .into_iter()
            .map(|line| parse_remote_chat_message(&line, &chat_id))
            .collect::<Result<Vec<_>, DomainError>>()?;
        let runtime = self.runtime.lock().await;
        Ok(RemoteChatHistory {
            target: RemoteChatTarget::Group {
                group_id: group_id.clone(),
                chat_id: chat_id.clone(),
            },
            title: group.name,
            messages,
            generation_active: runtime.active_request.as_ref().is_some_and(|active| {
                active.target == (RemoteChatTarget::Group { group_id, chat_id })
            }),
            latest_sequence: runtime.next_sequence,
        })
    }

    fn require_session<'a>(
        runtime: &'a RemoteChatRuntime,
        session_id: &str,
    ) -> Result<&'a str, DomainError> {
        let active_session = runtime.session_id.as_deref().ok_or_else(|| {
            DomainError::Conflict("Remote Chat session is not active".to_string())
        })?;
        if active_session != session_id {
            return Err(DomainError::AuthenticationError(
                "Remote Chat session id does not match".to_string(),
            ));
        }
        Ok(active_session)
    }
}

#[async_trait]
impl RemoteChatApi for RemoteChatService {
    async fn stop_host_session(&self) -> Result<(), DomainError> {
        self.stop_session().await
    }

    async fn session_status(&self) -> Result<RemoteChatSessionStatus, DomainError> {
        let runtime = self.runtime.lock().await;
        Ok(RemoteChatSessionStatus {
            active: runtime.session_id.is_some(),
            session_id: runtime.session_id.clone(),
        })
    }

    async fn list_catalog(&self, session_id: &str) -> Result<RemoteChatCatalog, DomainError> {
        {
            let runtime = self.runtime.lock().await;
            Self::require_session(&runtime, session_id)?;
        }
        let characters = self
            .characters
            .get_all_characters(true)
            .await
            .map_err(DomainError::from)?
            .into_iter()
            .map(|character| RemoteChatCharacter {
                character_name: character.name.clone(),
                display_name: character.name,
                avatar: character.avatar,
            })
            .collect();
        let groups = self
            .groups
            .get_all_groups()
            .await?
            .into_iter()
            .map(|group| RemoteChatGroup {
                group_id: group.id,
                name: group.name,
                avatar: group.avatar_url.unwrap_or_default(),
            })
            .collect();
        let runtime = self.runtime.lock().await;
        Self::require_session(&runtime, session_id)?;
        Ok(RemoteChatCatalog { characters, groups })
    }

    async fn list_chats(
        &self,
        session_id: &str,
        owner: RemoteChatOwner,
    ) -> Result<Vec<RemoteChatSummary>, DomainError> {
        {
            let runtime = self.runtime.lock().await;
            Self::require_session(&runtime, session_id)?;
        }
        let chats = match owner {
            RemoteChatOwner::Character { character_name } => {
                self.list_character_chats(character_name).await
            }
            RemoteChatOwner::Group { group_id } => self.list_group_chats(group_id).await,
        }?;
        let runtime = self.runtime.lock().await;
        Self::require_session(&runtime, session_id)?;
        Ok(chats)
    }

    async fn get_history(
        &self,
        session_id: &str,
        target: RemoteChatTarget,
    ) -> Result<RemoteChatHistory, DomainError> {
        {
            let runtime = self.runtime.lock().await;
            Self::require_session(&runtime, session_id)?;
        }
        let history = match target {
            RemoteChatTarget::Character {
                character_name,
                file_name,
            } => self.read_character_history(character_name, file_name).await,
            RemoteChatTarget::Group { group_id, chat_id } => {
                self.read_group_history(group_id, chat_id).await
            }
        }?;
        let runtime = self.runtime.lock().await;
        Self::require_session(&runtime, session_id)?;
        Ok(history)
    }

    async fn submit(
        &self,
        session_id: &str,
        request: RemoteChatSubmit,
    ) -> Result<RemoteChatSubmitResponse, DomainError> {
        validate_request(&request)?;
        {
            let runtime = self.runtime.lock().await;
            Self::require_session(&runtime, session_id)?;
            if runtime
                .recent_request_ids
                .iter()
                .any(|request_id| request_id == &request.request_id)
            {
                return Ok(RemoteChatSubmitResponse {
                    request_id: request.request_id,
                    accepted: true,
                });
            }
            if runtime.active_request.is_some() {
                return Err(DomainError::Conflict(
                    "A Remote Chat generation is already active".to_string(),
                ));
            }
        }
        ensure_target_is_listed(
            &self.groups,
            &self.chats,
            &self.group_chats,
            &request.target,
        )
        .await?;

        let command = {
            let mut runtime = self.runtime.lock().await;
            Self::require_session(&runtime, session_id)?;
            if runtime
                .recent_request_ids
                .iter()
                .any(|request_id| request_id == &request.request_id)
            {
                return Ok(RemoteChatSubmitResponse {
                    request_id: request.request_id,
                    accepted: true,
                });
            }
            if runtime.active_request.is_some() {
                return Err(DomainError::Conflict(
                    "A Remote Chat generation is already active".to_string(),
                ));
            }
            runtime.active_request = Some(ActiveRequest {
                request_id: request.request_id.clone(),
                target: request.target.clone(),
            });
            runtime
                .recent_request_ids
                .push_back(request.request_id.clone());
            while runtime.recent_request_ids.len() > MAX_RECENT_REQUEST_IDS {
                runtime.recent_request_ids.pop_front();
            }
            RemoteChatDesktopCommand::SendMessage {
                session_id: session_id.to_string(),
                request_id: request.request_id.clone(),
                target: request.target.clone(),
                text: request.text.clone(),
            }
        };
        if let Err(error) = self.command_publisher.publish(command) {
            let mut runtime = self.runtime.lock().await;
            if runtime
                .active_request
                .as_ref()
                .is_some_and(|active| active.request_id == request.request_id)
            {
                runtime.active_request = None;
            }
            runtime
                .recent_request_ids
                .retain(|request_id| request_id != &request.request_id);
            return Err(error);
        }
        Ok(RemoteChatSubmitResponse {
            request_id: request.request_id,
            accepted: true,
        })
    }

    async fn read_events(
        &self,
        session_id: &str,
        after_sequence: u64,
    ) -> Result<RemoteChatEventsPage, DomainError> {
        let runtime = self.runtime.lock().await;
        Self::require_session(&runtime, session_id)?;
        let events = runtime
            .events
            .iter()
            .filter(|event| event.sequence > after_sequence)
            .cloned()
            .collect();
        Ok(RemoteChatEventsPage {
            events,
            next_sequence: runtime.next_sequence,
            generation_active: runtime.active_request.is_some(),
        })
    }

    async fn stop_generation(&self, session_id: &str, request_id: &str) -> Result<(), DomainError> {
        let command = {
            let runtime = self.runtime.lock().await;
            Self::require_session(&runtime, session_id)?;
            let Some(active) = runtime.active_request.as_ref() else {
                return Ok(());
            };
            if active.request_id != request_id {
                return Err(DomainError::Conflict(
                    "Remote Chat request id does not match the active generation".to_string(),
                ));
            }
            RemoteChatDesktopCommand::StopGeneration {
                session_id: session_id.to_string(),
                request_id: request_id.to_string(),
            }
        };
        self.command_publisher.publish(command)
    }
}

#[async_trait]
impl RemoteChatEventSink for RemoteChatService {
    async fn publish(&self, event: RemoteChatEvent) -> Result<(), DomainError> {
        self.publish_event(event).await
    }
}

fn parse_remote_chat_message(line: &str, chat_id: &str) -> Result<RemoteChatMessage, DomainError> {
    let value: serde_json::Value = serde_json::from_str(line).map_err(|error| {
        DomainError::InvalidData(format!(
            "Invalid message in Remote Chat payload {chat_id}: {error}"
        ))
    })?;
    Ok(RemoteChatMessage {
        name: value
            .get("name")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
            .to_string(),
        is_user: value
            .get("is_user")
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(false),
        is_system: value
            .get("is_system")
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(false),
        text: value
            .get("mes")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
            .to_string(),
        sent_at: value
            .get("send_date")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
            .to_string(),
    })
}

fn validate_request(request: &RemoteChatSubmit) -> Result<(), DomainError> {
    if request.request_id.trim().is_empty()
        || request.request_id.chars().count() > MAX_REQUEST_ID_CHARS
        || request.request_id.chars().any(char::is_control)
    {
        return Err(DomainError::InvalidData(
            "Remote Chat request id is invalid".to_string(),
        ));
    }
    if request.text.trim().is_empty() {
        return Err(DomainError::InvalidData(
            "Remote Chat message cannot be empty".to_string(),
        ));
    }
    if request.text.chars().count() > REMOTE_CHAT_MAX_INPUT_CHARS {
        return Err(DomainError::InvalidData(format!(
            "Remote Chat message exceeds {REMOTE_CHAT_MAX_INPUT_CHARS} characters"
        )));
    }
    if request.text.trim_start().starts_with('/') {
        return Err(DomainError::InvalidData(
            "Remote Chat accepts plain text messages, not slash commands".to_string(),
        ));
    }
    match &request.target {
        RemoteChatTarget::Character {
            character_name,
            file_name,
        } if character_name.trim().is_empty() || file_name.trim().is_empty() => Err(
            DomainError::InvalidData("Remote Chat character target is incomplete".to_string()),
        ),
        RemoteChatTarget::Group { group_id, chat_id }
            if group_id.trim().is_empty() || chat_id.trim().is_empty() =>
        {
            Err(DomainError::InvalidData(
                "Remote Chat group target is incomplete".to_string(),
            ))
        }
        _ => Ok(()),
    }
}

async fn ensure_target_is_listed(
    groups: &GroupService,
    chats: &ChatService,
    group_chats: &GroupChatService,
    target: &RemoteChatTarget,
) -> Result<(), DomainError> {
    match target {
        RemoteChatTarget::Character {
            character_name,
            file_name,
        } => {
            chats
                .get_chat_payload_tail_lines(character_name, file_name, 1)
                .await
                .map_err(DomainError::from)?;
            Ok(())
        }
        RemoteChatTarget::Group { group_id, chat_id } => {
            let group = groups
                .get_group(group_id)
                .await?
                .ok_or_else(|| DomainError::NotFound(format!("Group not found: {group_id}")))?;
            if !group.chats.contains(chat_id) && group.chat_id != *chat_id {
                return Err(DomainError::NotFound(format!(
                    "Chat {chat_id} does not belong to group {group_id}"
                )));
            }
            group_chats
                .get_group_chat_summary(chat_id, false)
                .await
                .map_err(DomainError::from)?;
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(text: String) -> RemoteChatSubmit {
        RemoteChatSubmit {
            request_id: "request-1".to_string(),
            target: RemoteChatTarget::Character {
                character_name: "character".to_string(),
                file_name: "chat".to_string(),
            },
            text,
        }
    }

    #[test]
    fn remote_chat_submission_accepts_plain_text_and_rejects_commands_or_oversized_input() {
        assert!(validate_request(&request("hello\nthere".to_string())).is_ok());
        assert!(validate_request(&request(" /help".to_string())).is_err());
        assert!(validate_request(&request("x".repeat(REMOTE_CHAT_MAX_INPUT_CHARS + 1))).is_err());
        assert!(validate_request(&request("  ".to_string())).is_err());
    }
}
