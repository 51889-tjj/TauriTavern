use async_trait::async_trait;
use std::sync::Arc;
use tt_contracts::remote_control::{
    RemoteControlChatPayloadRequest, RemoteControlDesktopCommand, RemoteControlInvokeRequest,
    RemoteControlInvokeResult, RemoteControlResourceRequest, RemoteControlResourceResponse,
    RemoteControlSessionStatus, RemoteControlValue,
};
use tt_domain::errors::DomainError;
use tt_domain::models::lan_sync::{LanSyncIdentity, LanSyncPairedDevice};

/// Desktop application boundary for the authenticated LAN Remote Control protocol.
#[async_trait]
pub trait RemoteControlApi: Send + Sync {
    async fn stop_host_session(&self) -> Result<(), DomainError>;
    async fn session_status(&self) -> Result<RemoteControlSessionStatus, DomainError>;
    async fn get_sillytavern_settings(&self, session_id: &str) -> Result<Vec<u8>, DomainError>;
    async fn get_chat_payload(
        &self,
        request: RemoteControlChatPayloadRequest,
    ) -> Result<Vec<u8>, DomainError>;
    async fn get_extension_resource(
        &self,
        request: RemoteControlResourceRequest,
    ) -> Result<RemoteControlResourceResponse, DomainError>;
    async fn invoke(
        &self,
        request: RemoteControlInvokeRequest,
    ) -> Result<RemoteControlValue, DomainError>;
    async fn publish_result(&self, result: RemoteControlInvokeResult) -> Result<(), DomainError>;
}

pub trait RemoteControlCommandPublisher: Send + Sync {
    fn publish(&self, command: RemoteControlDesktopCommand) -> Result<(), DomainError>;
}

#[async_trait]
pub trait RemoteControlClientSession: Send + Sync {
    async fn session_status(&self) -> Result<RemoteControlSessionStatus, DomainError>;
    async fn get_sillytavern_settings(&self, session_id: &str) -> Result<Vec<u8>, DomainError>;
    async fn get_chat_payload(
        &self,
        request: RemoteControlChatPayloadRequest,
    ) -> Result<Vec<u8>, DomainError>;
    async fn get_extension_resource(
        &self,
        request: RemoteControlResourceRequest,
    ) -> Result<RemoteControlResourceResponse, DomainError>;
    async fn invoke(
        &self,
        request: RemoteControlInvokeRequest,
    ) -> Result<RemoteControlValue, DomainError>;
}

#[async_trait]
pub trait RemoteControlClientConnector: Send + Sync {
    async fn connect(
        &self,
        peer: LanSyncPairedDevice,
        identity: LanSyncIdentity,
    ) -> Result<Arc<dyn RemoteControlClientSession>, DomainError>;
}
