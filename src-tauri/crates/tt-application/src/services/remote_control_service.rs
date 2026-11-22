use std::collections::{BTreeMap, HashMap};
use std::sync::Arc;
use std::time::Duration;

use http::header::{HeaderName, HeaderValue};
use http::{Method, Request};
use tokio::sync::{Mutex, oneshot};
use tt_contracts::client_asset_paths::{
    MAX_MOBILE_THIRD_PARTY_ASSET_BYTES, THIRD_PARTY_EXTENSION_ROUTE_PREFIX,
};
use tt_contracts::remote_control::{
    REMOTE_CONTROL_MAX_CHAT_PAYLOAD_BYTES, REMOTE_CONTROL_MAX_OPERATION_BYTES,
    REMOTE_CONTROL_MAX_PENDING_REQUESTS, REMOTE_CONTROL_MAX_REQUEST_ID_CHARS,
    REMOTE_CONTROL_MAX_RESULT_BYTES, REMOTE_CONTROL_MAX_SETTINGS_BYTES,
    REMOTE_CONTROL_REQUEST_TIMEOUT_SECS, RemoteControlChatPayloadRequest, RemoteControlChatTarget,
    RemoteControlDesktopCommand, RemoteControlInvokeRequest, RemoteControlInvokeResult,
    RemoteControlOutcome, RemoteControlResourceRequest, RemoteControlResourceResponse,
    RemoteControlSessionStatus, RemoteControlValue,
};
use tt_domain::errors::DomainError;
use tt_ports::remote_control::{RemoteControlApi, RemoteControlCommandPublisher};
use tt_ports::repositories::chat_commit_repository::ChatCommitRepository;

use super::settings_service::SettingsService;
use crate::dto::chat_history_dto::ChatHistoryLocator;
use crate::services::chat_commit_service::open_chat_payload_json;
use crate::services::host_resource_service::{
    HostResourceDeliveryCapabilities, HostResourceService,
};

const CHAT_PAYLOAD_READ_CHUNK_BYTES: usize = 4 * 1024 * 1024;
const REMOTE_EXTENSION_DELIVERY: HostResourceDeliveryCapabilities =
    HostResourceDeliveryCapabilities::new(true, false)
        .with_max_third_party_asset_bytes(MAX_MOBILE_THIRD_PARTY_ASSET_BYTES as u64);

type PendingResponse = oneshot::Sender<Result<RemoteControlValue, String>>;

#[derive(Default)]
struct RemoteControlRuntime {
    session_id: Option<String>,
    pending: HashMap<String, PendingResponse>,
}

pub struct RemoteControlService {
    command_publisher: Arc<dyn RemoteControlCommandPublisher>,
    settings_service: Arc<SettingsService>,
    chat_commit_repository: Arc<dyn ChatCommitRepository>,
    host_resources: Arc<HostResourceService>,
    runtime: Mutex<RemoteControlRuntime>,
}

impl RemoteControlService {
    pub fn new(
        command_publisher: Arc<dyn RemoteControlCommandPublisher>,
        settings_service: Arc<SettingsService>,
        chat_commit_repository: Arc<dyn ChatCommitRepository>,
        host_resources: Arc<HostResourceService>,
    ) -> Self {
        Self {
            command_publisher,
            settings_service,
            chat_commit_repository,
            host_resources,
            runtime: Mutex::new(RemoteControlRuntime::default()),
        }
    }

    pub async fn start_session(&self) -> Result<RemoteControlSessionStatus, DomainError> {
        let mut runtime = self.runtime.lock().await;
        if runtime.session_id.is_some() {
            return Err(DomainError::Conflict(
                "Remote Control session is already active".to_string(),
            ));
        }

        let session_id = uuid::Uuid::new_v4().to_string();
        runtime.session_id = Some(session_id.clone());
        runtime.pending.clear();
        Ok(RemoteControlSessionStatus {
            active: true,
            session_id: Some(session_id),
        })
    }

    pub async fn stop_session(&self) -> Result<(), DomainError> {
        let (session_id, pending) = {
            let mut runtime = self.runtime.lock().await;
            let Some(session_id) = runtime.session_id.take() else {
                return Ok(());
            };
            let pending = std::mem::take(&mut runtime.pending);
            (session_id, pending)
        };

        for (_, response) in pending {
            let _ = response.send(Err("Remote Control session ended".to_string()));
        }

        self.command_publisher
            .publish(RemoteControlDesktopCommand::EndSession { session_id })
    }

    async fn read_sillytavern_settings(&self, session_id: &str) -> Result<Vec<u8>, DomainError> {
        self.ensure_active_session(session_id).await?;
        let settings = self
            .settings_service
            .get_sillytavern_settings()
            .await
            .map_err(|error| {
                DomainError::InternalError(format!(
                    "Failed to read SillyTavern settings for Remote Control: {error}"
                ))
            })?;
        if settings.bytes.len() > REMOTE_CONTROL_MAX_SETTINGS_BYTES {
            return Err(DomainError::InvalidData(
                "SillyTavern settings exceed the Remote Control transfer limit".to_string(),
            ));
        }
        Ok(settings.bytes.as_ref().clone())
    }

    async fn read_chat_payload(
        &self,
        request: RemoteControlChatPayloadRequest,
    ) -> Result<Vec<u8>, DomainError> {
        self.ensure_active_session(&request.session_id).await?;
        let locator = match request.target {
            RemoteControlChatTarget::Character {
                character_id,
                file_name,
            } => ChatHistoryLocator::Character {
                character_id,
                file_name,
            },
            RemoteControlChatTarget::Group { chat_id } => ChatHistoryLocator::Group { chat_id },
        };
        let Some(mut reader) = open_chat_payload_json(
            self.chat_commit_repository.as_ref(),
            locator,
            request.allow_not_found,
        )
        .await
        .map_err(DomainError::from)?
        else {
            return Ok(b"[]".to_vec());
        };

        let mut payload = Vec::new();
        let mut buffer = vec![0; CHAT_PAYLOAD_READ_CHUNK_BYTES];
        loop {
            let bytes_read = reader.read(&mut buffer).await?;
            if bytes_read == 0 {
                break;
            }
            if bytes_read > buffer.len() {
                return Err(DomainError::InvalidData(
                    "Chat payload reader returned an invalid byte count".to_string(),
                ));
            }
            if payload.len().saturating_add(bytes_read) > REMOTE_CONTROL_MAX_CHAT_PAYLOAD_BYTES {
                return Err(DomainError::InvalidData(
                    "Chat payload exceeds the Remote Control transfer limit".to_string(),
                ));
            }
            payload.extend_from_slice(&buffer[..bytes_read]);
        }
        Ok(payload)
    }

    async fn read_extension_resource(
        &self,
        request: RemoteControlResourceRequest,
    ) -> Result<RemoteControlResourceResponse, DomainError> {
        self.ensure_active_session(&request.session_id).await?;
        if !request.path.starts_with(THIRD_PARTY_EXTENSION_ROUTE_PREFIX) {
            return Err(DomainError::InvalidData(
                "Remote Control can read only third-party extension assets".to_string(),
            ));
        }
        if request.path.len() > 8 * 1024 {
            return Err(DomainError::InvalidData(
                "Remote extension resource path exceeds the allowed size".to_string(),
            ));
        }

        let method = Method::from_bytes(request.method.as_bytes()).map_err(|error| {
            DomainError::InvalidData(format!("Invalid remote resource method: {error}"))
        })?;
        let mut builder = Request::builder().method(method).uri(&request.path);
        for (name, value) in request.headers {
            if !is_forwardable_resource_header(&name) {
                continue;
            }
            let name = HeaderName::from_bytes(name.as_bytes()).map_err(|error| {
                DomainError::InvalidData(format!("Invalid remote resource header: {error}"))
            })?;
            let value = HeaderValue::from_str(&value).map_err(|error| {
                DomainError::InvalidData(format!("Invalid remote resource header value: {error}"))
            })?;
            builder = builder.header(name, value);
        }
        let request = builder.body(Vec::new()).map_err(|error| {
            DomainError::InvalidData(format!(
                "Invalid remote extension resource request: {error}"
            ))
        })?;
        let response = self
            .host_resources
            .serve(&request, REMOTE_EXTENSION_DELIVERY);
        let status = response.status().as_u16();
        let mut headers = BTreeMap::new();
        for name in [
            http::header::ACCEPT_RANGES,
            http::header::ALLOW,
            http::header::CACHE_CONTROL,
            http::header::CONTENT_LENGTH,
            http::header::CONTENT_RANGE,
            http::header::CONTENT_TYPE,
            http::header::ETAG,
            http::header::LAST_MODIFIED,
        ] {
            if let Some(value) = response.headers().get(&name)
                && let Ok(value) = value.to_str()
            {
                headers.insert(name.as_str().to_string(), value.to_string());
            }
        }
        Ok(RemoteControlResourceResponse {
            status,
            headers,
            body: response.into_body(),
        })
    }

    async fn ensure_active_session(&self, session_id: &str) -> Result<(), DomainError> {
        if self.runtime.lock().await.session_id.as_deref() != Some(session_id) {
            return Err(DomainError::AuthenticationError(
                "Remote Control session is not active".to_string(),
            ));
        }
        Ok(())
    }

    async fn invoke_operation(
        &self,
        request: RemoteControlInvokeRequest,
    ) -> Result<RemoteControlValue, DomainError> {
        validate_request(&request)?;
        let operation_size = serde_json::to_vec(&request.operation)
            .map_err(|error| DomainError::InvalidData(error.to_string()))?
            .len();
        if operation_size > REMOTE_CONTROL_MAX_OPERATION_BYTES {
            return Err(DomainError::InvalidData(
                "Remote Control operation exceeds the allowed size".to_string(),
            ));
        }

        let request_id = request.request_id.clone();
        let (response_sender, response_receiver) = oneshot::channel();
        {
            let mut runtime = self.runtime.lock().await;
            if runtime.session_id.as_deref() != Some(request.session_id.as_str()) {
                return Err(DomainError::AuthenticationError(
                    "Remote Control session is not active".to_string(),
                ));
            }
            if runtime.pending.len() >= REMOTE_CONTROL_MAX_PENDING_REQUESTS {
                return Err(DomainError::RateLimited {
                    message: "Too many Remote Control requests are in progress".to_string(),
                });
            }
            if runtime.pending.contains_key(&request_id) {
                return Err(DomainError::Conflict(
                    "Remote Control request id is already in use".to_string(),
                ));
            }
            runtime.pending.insert(request_id.clone(), response_sender);
        }

        let command = RemoteControlDesktopCommand::Invoke {
            session_id: request.session_id,
            request_id: request_id.clone(),
            operation: request.operation,
        };
        if let Err(error) = self.command_publisher.publish(command) {
            self.runtime.lock().await.pending.remove(&request_id);
            return Err(error);
        }

        match tokio::time::timeout(
            Duration::from_secs(REMOTE_CONTROL_REQUEST_TIMEOUT_SECS),
            response_receiver,
        )
        .await
        {
            Ok(Ok(Ok(value))) => Ok(value),
            Ok(Ok(Err(message))) => Err(DomainError::InternalError(message)),
            Ok(Err(_)) => Err(DomainError::Transient(
                "Remote Control response channel closed".to_string(),
            )),
            Err(_) => {
                self.runtime.lock().await.pending.remove(&request_id);
                Err(DomainError::Transient(
                    "Remote Control command timed out".to_string(),
                ))
            }
        }
    }

    async fn publish_invoke_result(
        &self,
        result: RemoteControlInvokeResult,
    ) -> Result<(), DomainError> {
        validate_result_identity(&result)?;
        let too_large = result_size(&result)? > REMOTE_CONTROL_MAX_RESULT_BYTES;
        let response = {
            let mut runtime = self.runtime.lock().await;
            if runtime.session_id.as_deref() != Some(result.session_id.as_str()) {
                return Err(DomainError::AuthenticationError(
                    "Remote Control session is not active".to_string(),
                ));
            }
            runtime.pending.remove(&result.request_id).ok_or_else(|| {
                DomainError::Conflict(
                    "Remote Control request is no longer awaiting a response".to_string(),
                )
            })?
        };

        let outcome = if too_large {
            Err("Remote Control response exceeds the allowed size".to_string())
        } else {
            match result.outcome {
                RemoteControlOutcome::Success(value) => Ok(value),
                RemoteControlOutcome::Failure(message) => Err(message),
            }
        };
        response.send(outcome).map_err(|_| {
            DomainError::Conflict(
                "Remote Control request was cancelled before its response arrived".to_string(),
            )
        })
    }
}

#[async_trait::async_trait]
impl RemoteControlApi for RemoteControlService {
    async fn stop_host_session(&self) -> Result<(), DomainError> {
        self.stop_session().await
    }

    async fn session_status(&self) -> Result<RemoteControlSessionStatus, DomainError> {
        let runtime = self.runtime.lock().await;
        Ok(RemoteControlSessionStatus {
            active: runtime.session_id.is_some(),
            session_id: runtime.session_id.clone(),
        })
    }

    async fn get_sillytavern_settings(&self, session_id: &str) -> Result<Vec<u8>, DomainError> {
        self.read_sillytavern_settings(session_id).await
    }

    async fn get_chat_payload(
        &self,
        request: RemoteControlChatPayloadRequest,
    ) -> Result<Vec<u8>, DomainError> {
        self.read_chat_payload(request).await
    }

    async fn get_extension_resource(
        &self,
        request: RemoteControlResourceRequest,
    ) -> Result<RemoteControlResourceResponse, DomainError> {
        self.read_extension_resource(request).await
    }

    async fn invoke(
        &self,
        request: RemoteControlInvokeRequest,
    ) -> Result<RemoteControlValue, DomainError> {
        self.invoke_operation(request).await
    }

    async fn publish_result(&self, result: RemoteControlInvokeResult) -> Result<(), DomainError> {
        self.publish_invoke_result(result).await
    }
}

fn validate_request(request: &RemoteControlInvokeRequest) -> Result<(), DomainError> {
    if request.session_id.trim().is_empty() {
        return Err(DomainError::InvalidData(
            "Remote Control session id is required".to_string(),
        ));
    }
    let request_id = request.request_id.trim();
    if request_id.is_empty() || request_id.chars().count() > REMOTE_CONTROL_MAX_REQUEST_ID_CHARS {
        return Err(DomainError::InvalidData(
            "Invalid Remote Control request id".to_string(),
        ));
    }
    Ok(())
}

fn is_forwardable_resource_header(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "if-none-match" | "if-modified-since" | "if-range" | "range"
    )
}

fn validate_result_identity(result: &RemoteControlInvokeResult) -> Result<(), DomainError> {
    if result.session_id.trim().is_empty() {
        return Err(DomainError::InvalidData(
            "Remote Control session id is required".to_string(),
        ));
    }
    let request_id = result.request_id.trim();
    if request_id.is_empty() || request_id.chars().count() > REMOTE_CONTROL_MAX_REQUEST_ID_CHARS {
        return Err(DomainError::InvalidData(
            "Invalid Remote Control request id".to_string(),
        ));
    }
    Ok(())
}

fn result_size(result: &RemoteControlInvokeResult) -> Result<usize, DomainError> {
    match &result.outcome {
        RemoteControlOutcome::Success(RemoteControlValue::Json(value)) => {
            Ok(serde_json::to_vec(value)
                .map_err(|error| DomainError::InvalidData(error.to_string()))?
                .len())
        }
        RemoteControlOutcome::Failure(message) => Ok(message.len()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use tokio::sync::mpsc;
    use tt_contracts::byte_commit::CommitBegin;
    use tt_contracts::remote_control::RemoteControlChatPayloadRequest;
    use tt_ports::byte_reader::ByteReader;
    use tt_ports::host_resource::{
        HostResourceAssetStore, HostResourceSourceRequest, HostResourceStoreError,
        OpenedHostResource,
    };
    use tt_ports::repositories::chat_commit_repository::{
        ChatCommitOperation, ChatCommitRepository, ChatCommitTarget, ChatSwipeSource,
    };

    struct RecordingPublisher {
        commands: mpsc::UnboundedSender<RemoteControlDesktopCommand>,
    }

    impl RemoteControlCommandPublisher for RecordingPublisher {
        fn publish(&self, command: RemoteControlDesktopCommand) -> Result<(), DomainError> {
            self.commands
                .send(command)
                .map_err(|error| DomainError::InternalError(error.to_string()))
        }
    }

    struct TestChatCommitRepository;

    #[async_trait::async_trait]
    impl ChatCommitRepository for TestChatCommitRepository {
        async fn open_payload_json(
            &self,
            _target: ChatCommitTarget,
        ) -> Result<Box<dyn ByteReader>, DomainError> {
            Ok(Box::new(TestByteReader {
                bytes: br#"[{"file_name":"remote-chat"}]"#.to_vec(),
                offset: 0,
            }))
        }

        async fn open_swipe_source(
            &self,
            _target: ChatCommitTarget,
        ) -> Result<Arc<dyn ChatSwipeSource>, DomainError> {
            Err(DomainError::Conflict("Not used in this test".to_string()))
        }

        async fn begin(
            &self,
            _target: ChatCommitTarget,
            _operation: ChatCommitOperation,
        ) -> Result<CommitBegin, DomainError> {
            Err(DomainError::Conflict("Not used in this test".to_string()))
        }

        async fn append(
            &self,
            _session_id: &str,
            _offset: u64,
            _bytes: &[u8],
        ) -> Result<u64, DomainError> {
            Err(DomainError::Conflict("Not used in this test".to_string()))
        }

        async fn finish(
            &self,
            _session_id: &str,
            _expected_size: u64,
        ) -> Result<ChatCommitTarget, DomainError> {
            Err(DomainError::Conflict("Not used in this test".to_string()))
        }

        async fn abort(&self, _session_id: &str) -> Result<(), DomainError> {
            Err(DomainError::Conflict("Not used in this test".to_string()))
        }
    }

    struct TestByteReader {
        bytes: Vec<u8>,
        offset: usize,
    }

    #[async_trait::async_trait]
    impl ByteReader for TestByteReader {
        async fn read(&mut self, buffer: &mut [u8]) -> Result<usize, DomainError> {
            let bytes_read = buffer
                .len()
                .min(self.bytes.len().saturating_sub(self.offset));
            buffer[..bytes_read]
                .copy_from_slice(&self.bytes[self.offset..self.offset + bytes_read]);
            self.offset += bytes_read;
            Ok(bytes_read)
        }
    }

    struct TestHostResourceStore;

    impl HostResourceAssetStore for TestHostResourceStore {
        fn open(
            &self,
            _request: HostResourceSourceRequest<'_>,
        ) -> Result<OpenedHostResource, HostResourceStoreError> {
            Err(HostResourceStoreError::not_found("Test asset not found"))
        }
    }

    fn create_service(publisher: Arc<dyn RemoteControlCommandPublisher>) -> RemoteControlService {
        RemoteControlService::new(
            publisher,
            super::super::settings_service::tests::remote_control_test_settings_service(),
            Arc::new(TestChatCommitRepository),
            Arc::new(HostResourceService::new(
                false,
                Arc::new(TestHostResourceStore),
            )),
        )
    }

    #[tokio::test]
    async fn invoke_waits_for_the_matching_desktop_response() {
        let (command_sender, mut command_receiver) = mpsc::unbounded_channel();
        let service = Arc::new(create_service(Arc::new(RecordingPublisher {
            commands: command_sender,
        })));
        let status = service.start_session().await.expect("start session");
        let session_id = status.session_id.expect("active session id");

        let invoking_service = service.clone();
        let request_session_id = session_id.clone();
        let invoke = tokio::spawn(async move {
            invoking_service
                .invoke(RemoteControlInvokeRequest {
                    session_id: request_session_id,
                    request_id: "request-1".to_string(),
                    operation:
                        tt_contracts::remote_control::RemoteControlOperation::GetClientVersion,
                })
                .await
        });
        let command = command_receiver
            .recv()
            .await
            .expect("desktop invoke command");
        let RemoteControlDesktopCommand::Invoke {
            session_id,
            request_id,
            ..
        } = command
        else {
            panic!("expected invoke command");
        };
        service
            .publish_result(RemoteControlInvokeResult {
                session_id,
                request_id,
                outcome: RemoteControlOutcome::Success(RemoteControlValue::Json(
                    serde_json::json!({ "version": "test" }),
                )),
            })
            .await
            .expect("publish matching response");

        let result = invoke.await.expect("invoke task");
        assert!(matches!(
            result,
            Ok(RemoteControlValue::Json(value)) if value["version"] == "test"
        ));
    }

    #[tokio::test]
    async fn settings_bytes_are_available_only_during_the_remote_control_session() {
        let (command_sender, _command_receiver) = mpsc::unbounded_channel();
        let service = create_service(Arc::new(RecordingPublisher {
            commands: command_sender,
        }));
        let status = service.start_session().await.expect("start session");
        let session_id = status.session_id.expect("active session id");

        let bytes = service
            .get_sillytavern_settings(&session_id)
            .await
            .expect("read computer settings");
        let settings: serde_json::Value =
            serde_json::from_slice(&bytes).expect("settings response is JSON");
        assert!(settings["settings"].is_string());

        service.stop_session().await.expect("stop session");
        assert!(service.get_sillytavern_settings(&session_id).await.is_err());
    }

    #[tokio::test]
    async fn chat_payload_is_read_from_the_desktop_only_during_the_remote_session() {
        let (command_sender, _command_receiver) = mpsc::unbounded_channel();
        let service = create_service(Arc::new(RecordingPublisher {
            commands: command_sender,
        }));
        let status = service.start_session().await.expect("start session");
        let session_id = status.session_id.expect("active session id");

        let payload = service
            .get_chat_payload(RemoteControlChatPayloadRequest {
                session_id: session_id.clone(),
                target: RemoteControlChatTarget::Character {
                    character_id: "character".to_string(),
                    file_name: "remote-chat".to_string(),
                },
                allow_not_found: false,
            })
            .await
            .expect("read desktop chat payload");
        assert_eq!(payload, br#"[{"file_name":"remote-chat"}]"#);

        service.stop_session().await.expect("stop session");
        assert!(
            service
                .get_chat_payload(RemoteControlChatPayloadRequest {
                    session_id,
                    target: RemoteControlChatTarget::Character {
                        character_id: "character".to_string(),
                        file_name: "remote-chat".to_string(),
                    },
                    allow_not_found: false,
                })
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn remote_extension_resources_reject_paths_outside_the_extension_store() {
        let (command_sender, _command_receiver) = mpsc::unbounded_channel();
        let service = create_service(Arc::new(RecordingPublisher {
            commands: command_sender,
        }));
        let status = service.start_session().await.expect("start session");
        let session_id = status.session_id.expect("active session id");

        let error = service
            .get_extension_resource(RemoteControlResourceRequest {
                session_id,
                method: "GET".to_string(),
                path: "/backgrounds/private.png".to_string(),
                headers: BTreeMap::new(),
            })
            .await
            .expect_err("Remote Control must not expose arbitrary host resources");
        assert!(error.to_string().contains("third-party extension assets"));
    }

    #[tokio::test]
    async fn oversized_response_fails_the_waiting_invoke_instead_of_leaking_it_until_timeout() {
        let (command_sender, mut command_receiver) = mpsc::unbounded_channel();
        let service = Arc::new(create_service(Arc::new(RecordingPublisher {
            commands: command_sender,
        })));
        let status = service.start_session().await.expect("start session");
        let session_id = status.session_id.expect("active session id");

        let invoking_service = service.clone();
        let request_session_id = session_id.clone();
        let invoke = tokio::spawn(async move {
            invoking_service
                .invoke(RemoteControlInvokeRequest {
                    session_id: request_session_id,
                    request_id: "request-large".to_string(),
                    operation:
                        tt_contracts::remote_control::RemoteControlOperation::GetClientVersion,
                })
                .await
        });
        let _command = command_receiver
            .recv()
            .await
            .expect("desktop invoke command");
        service
            .publish_result(RemoteControlInvokeResult {
                session_id,
                request_id: "request-large".to_string(),
                outcome: RemoteControlOutcome::Success(RemoteControlValue::Json(
                    serde_json::json!({
                        "payload": "x".repeat(REMOTE_CONTROL_MAX_RESULT_BYTES + 1)
                    }),
                )),
            })
            .await
            .expect("oversized response is returned as a command error");

        let error = invoke
            .await
            .expect("invoke task")
            .expect_err("oversized response must fail");
        assert!(
            error
                .to_string()
                .contains("Remote Control response exceeds")
        );
    }
}
