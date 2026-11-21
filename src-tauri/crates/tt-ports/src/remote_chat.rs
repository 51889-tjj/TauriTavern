use async_trait::async_trait;
use std::sync::Arc;
use tt_contracts::remote_chat::{
    RemoteChatCatalog, RemoteChatEvent, RemoteChatEventsPage, RemoteChatHistory, RemoteChatOwner,
    RemoteChatSessionStatus, RemoteChatSubmit, RemoteChatSubmitResponse, RemoteChatSummary,
    RemoteChatTarget,
};
use tt_domain::errors::DomainError;
use tt_domain::models::lan_sync::{LanSyncIdentity, LanSyncPairedDevice};

/// Application boundary used by the LAN transport for authenticated remote-chat requests.
#[async_trait]
pub trait RemoteChatApi: Send + Sync {
    async fn stop_host_session(&self) -> Result<(), DomainError>;
    async fn session_status(&self) -> Result<RemoteChatSessionStatus, DomainError>;
    async fn list_catalog(&self, session_id: &str) -> Result<RemoteChatCatalog, DomainError>;
    async fn list_chats(
        &self,
        session_id: &str,
        owner: RemoteChatOwner,
    ) -> Result<Vec<RemoteChatSummary>, DomainError>;
    async fn get_history(
        &self,
        session_id: &str,
        target: RemoteChatTarget,
    ) -> Result<RemoteChatHistory, DomainError>;
    async fn submit(
        &self,
        session_id: &str,
        request: RemoteChatSubmit,
    ) -> Result<RemoteChatSubmitResponse, DomainError>;
    async fn read_events(
        &self,
        session_id: &str,
        after_sequence: u64,
    ) -> Result<RemoteChatEventsPage, DomainError>;
    async fn stop_generation(&self, session_id: &str, request_id: &str) -> Result<(), DomainError>;
}

/// Desktop WebView bridge for commands accepted from a paired remote client.
pub trait RemoteChatCommandPublisher: Send + Sync {
    fn publish(
        &self,
        command: tt_contracts::remote_chat::RemoteChatDesktopCommand,
    ) -> Result<(), DomainError>;
}

/// A live, authenticated client connection to one paired Remote Chat host.
#[async_trait]
pub trait RemoteChatClientSession: Send + Sync {
    async fn session_status(&self) -> Result<RemoteChatSessionStatus, DomainError>;
    async fn list_catalog(&self, session_id: &str) -> Result<RemoteChatCatalog, DomainError>;
    async fn list_chats(
        &self,
        session_id: &str,
        owner: RemoteChatOwner,
    ) -> Result<Vec<RemoteChatSummary>, DomainError>;
    async fn get_history(
        &self,
        session_id: &str,
        target: RemoteChatTarget,
    ) -> Result<RemoteChatHistory, DomainError>;
    async fn submit(
        &self,
        session_id: &str,
        request: RemoteChatSubmit,
    ) -> Result<RemoteChatSubmitResponse, DomainError>;
    async fn read_events(
        &self,
        session_id: &str,
        after_sequence: u64,
    ) -> Result<RemoteChatEventsPage, DomainError>;
    async fn stop_generation(&self, session_id: &str, request_id: &str) -> Result<(), DomainError>;
}

/// Creates a TLS-pinned, signed LAN session for an already paired device.
#[async_trait]
pub trait RemoteChatClientConnector: Send + Sync {
    async fn connect(
        &self,
        peer: LanSyncPairedDevice,
        identity: LanSyncIdentity,
    ) -> Result<Arc<dyn RemoteChatClientSession>, DomainError>;
}

/// Frontend events are accepted only from the owning desktop application.
#[async_trait]
pub trait RemoteChatEventSink: Send + Sync {
    async fn publish(&self, event: RemoteChatEvent) -> Result<(), DomainError>;
}
