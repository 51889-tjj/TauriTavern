use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::{Mutex, oneshot};
use tt_contracts::remote_control::{
    REMOTE_CONTROL_MAX_OPERATION_BYTES, REMOTE_CONTROL_MAX_PENDING_REQUESTS,
    REMOTE_CONTROL_MAX_REQUEST_ID_CHARS, REMOTE_CONTROL_MAX_RESULT_BYTES,
    REMOTE_CONTROL_REQUEST_TIMEOUT_SECS, RemoteControlDesktopCommand, RemoteControlInvokeRequest,
    RemoteControlInvokeResult, RemoteControlOutcome, RemoteControlSessionStatus,
    RemoteControlValue,
};
use tt_domain::errors::DomainError;
use tt_ports::remote_control::{RemoteControlApi, RemoteControlCommandPublisher};

type PendingResponse = oneshot::Sender<Result<RemoteControlValue, String>>;

#[derive(Default)]
struct RemoteControlRuntime {
    session_id: Option<String>,
    pending: HashMap<String, PendingResponse>,
}

pub struct RemoteControlService {
    command_publisher: Arc<dyn RemoteControlCommandPublisher>,
    runtime: Mutex<RemoteControlRuntime>,
}

impl RemoteControlService {
    pub fn new(command_publisher: Arc<dyn RemoteControlCommandPublisher>) -> Self {
        Self {
            command_publisher,
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
        RemoteControlOutcome::Success(RemoteControlValue::BytesBase64(bytes)) => Ok(bytes.len()),
        RemoteControlOutcome::Failure(message) => Ok(message.len()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::sync::mpsc;

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

    #[tokio::test]
    async fn invoke_waits_for_the_matching_desktop_response() {
        let (command_sender, mut command_receiver) = mpsc::unbounded_channel();
        let service = Arc::new(RemoteControlService::new(Arc::new(RecordingPublisher {
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
    async fn oversized_response_fails_the_waiting_invoke_instead_of_leaking_it_until_timeout() {
        let (command_sender, mut command_receiver) = mpsc::unbounded_channel();
        let service = Arc::new(RemoteControlService::new(Arc::new(RecordingPublisher {
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
