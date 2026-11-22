use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::Mutex;
use tt_contracts::chat::ChatPayloadCursor;
use tt_contracts::remote_chat::{
    RemoteChatCatalog, RemoteChatEventsPage, RemoteChatHistory, RemoteChatOwner,
    RemoteChatSessionStatus, RemoteChatSubmit, RemoteChatSubmitResponse, RemoteChatSummary,
    RemoteChatTarget,
};
use tt_domain::errors::DomainError;
use tt_ports::lan_sync::LanPeerRepository;
use tt_ports::remote_chat::{RemoteChatClientConnector, RemoteChatClientSession};

pub struct RemoteChatClientService {
    peer_repository: Arc<dyn LanPeerRepository>,
    connector: Arc<dyn RemoteChatClientConnector>,
    sessions: Mutex<HashMap<String, Arc<dyn RemoteChatClientSession>>>,
}

impl RemoteChatClientService {
    pub fn new(
        peer_repository: Arc<dyn LanPeerRepository>,
        connector: Arc<dyn RemoteChatClientConnector>,
    ) -> Self {
        Self {
            peer_repository,
            connector,
            sessions: Mutex::new(HashMap::new()),
        }
    }

    pub async fn connect(&self, device_id: &str) -> Result<RemoteChatSessionStatus, DomainError> {
        let identity = self.peer_repository.load_or_create_identity().await?;
        let peer = self
            .peer_repository
            .load_paired_devices()
            .await?
            .into_iter()
            .find(|peer| peer.grant.device_id.to_string() == device_id)
            .ok_or_else(|| {
                DomainError::NotFound(format!("LAN device is not paired: {device_id}"))
            })?;
        let client = self.connector.connect(peer, identity).await?;
        let status = client.session_status().await?;
        if !status.active || status.session_id.is_none() {
            return Err(DomainError::Conflict(
                "The selected device does not have an active Remote Chat session".to_string(),
            ));
        }
        self.sessions
            .lock()
            .await
            .insert(device_id.to_string(), client);
        Ok(status)
    }

    pub async fn disconnect(&self, device_id: &str) {
        self.sessions.lock().await.remove(device_id);
    }

    pub async fn disconnect_all(&self) {
        self.sessions.lock().await.clear();
    }

    pub async fn session_status(
        &self,
        device_id: &str,
    ) -> Result<RemoteChatSessionStatus, DomainError> {
        self.client(device_id).await?.session_status().await
    }

    pub async fn list_catalog(
        &self,
        device_id: &str,
        session_id: &str,
    ) -> Result<RemoteChatCatalog, DomainError> {
        self.client(device_id).await?.list_catalog(session_id).await
    }

    pub async fn list_chats(
        &self,
        device_id: &str,
        session_id: &str,
        owner: RemoteChatOwner,
    ) -> Result<Vec<RemoteChatSummary>, DomainError> {
        self.client(device_id)
            .await?
            .list_chats(session_id, owner)
            .await
    }

    pub async fn get_history(
        &self,
        device_id: &str,
        session_id: &str,
        target: RemoteChatTarget,
        before_cursor: Option<ChatPayloadCursor>,
    ) -> Result<RemoteChatHistory, DomainError> {
        self.client(device_id)
            .await?
            .get_history(session_id, target, before_cursor)
            .await
    }

    pub async fn submit(
        &self,
        device_id: &str,
        session_id: &str,
        request: RemoteChatSubmit,
    ) -> Result<RemoteChatSubmitResponse, DomainError> {
        self.client(device_id)
            .await?
            .submit(session_id, request)
            .await
    }

    pub async fn read_events(
        &self,
        device_id: &str,
        session_id: &str,
        after_sequence: u64,
    ) -> Result<RemoteChatEventsPage, DomainError> {
        self.client(device_id)
            .await?
            .read_events(session_id, after_sequence)
            .await
    }

    pub async fn stop_generation(
        &self,
        device_id: &str,
        session_id: &str,
        request_id: &str,
    ) -> Result<(), DomainError> {
        self.client(device_id)
            .await?
            .stop_generation(session_id, request_id)
            .await
    }

    async fn client(
        &self,
        device_id: &str,
    ) -> Result<Arc<dyn RemoteChatClientSession>, DomainError> {
        self.sessions
            .lock()
            .await
            .get(device_id)
            .cloned()
            .ok_or_else(|| {
                DomainError::Conflict(format!(
                    "Remote Chat is not connected to paired device {device_id}"
                ))
            })
    }
}
