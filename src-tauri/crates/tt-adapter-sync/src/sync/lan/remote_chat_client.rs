use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use async_trait::async_trait;
use tokio::sync::Mutex;
use tt_contracts::remote_chat::{
    RemoteChatCatalog, RemoteChatEventsPage, RemoteChatHistory, RemoteChatOwner,
    RemoteChatSessionStatus, RemoteChatSubmit, RemoteChatSubmitResponse, RemoteChatSummary,
    RemoteChatTarget,
};
use tt_domain::errors::DomainError;
use tt_domain::models::lan_sync::{LanSyncIdentity, LanSyncPairedDevice};
use tt_ports::remote_chat::{RemoteChatClientConnector, RemoteChatClientSession};
use ttsync_contract::session::SessionToken;

use super::client::LanSyncClient;

const SESSION_REFRESH_MARGIN_MS: u64 = 20_000;

pub struct HttpRemoteChatClientConnector {
    product_user_agent: String,
}

impl HttpRemoteChatClientConnector {
    pub fn new(product_user_agent: impl Into<String>) -> Self {
        Self {
            product_user_agent: product_user_agent.into(),
        }
    }
}

#[async_trait]
impl RemoteChatClientConnector for HttpRemoteChatClientConnector {
    async fn connect(
        &self,
        peer: LanSyncPairedDevice,
        identity: LanSyncIdentity,
    ) -> Result<Arc<dyn RemoteChatClientSession>, DomainError> {
        let client = LanSyncClient::new(peer.base_url, peer.spki_sha256, &self.product_user_agent)?;
        let session = client
            .open_session(&peer.grant.device_id, &identity.ed25519_seed)
            .await?;
        Ok(Arc::new(HttpRemoteChatClientSession {
            client,
            local_device_id: identity.device_id,
            local_device_seed: identity.ed25519_seed,
            auth: Mutex::new(SessionAuth {
                token: session.session_token,
                expires_at_ms: session.expires_at_ms,
            }),
        }))
    }
}

struct SessionAuth {
    token: SessionToken,
    expires_at_ms: u64,
}

struct HttpRemoteChatClientSession {
    client: LanSyncClient,
    local_device_id: ttsync_contract::peer::DeviceId,
    local_device_seed: String,
    auth: Mutex<SessionAuth>,
}

impl HttpRemoteChatClientSession {
    async fn session_token(&self) -> Result<SessionToken, DomainError> {
        let mut auth = self.auth.lock().await;
        let now = now_ms()?;
        if auth.expires_at_ms.saturating_sub(now) <= SESSION_REFRESH_MARGIN_MS {
            let session = self
                .client
                .open_session(&self.local_device_id, &self.local_device_seed)
                .await?;
            auth.token = session.session_token;
            auth.expires_at_ms = session.expires_at_ms;
        }
        Ok(auth.token.clone())
    }
}

#[async_trait]
impl RemoteChatClientSession for HttpRemoteChatClientSession {
    async fn session_status(&self) -> Result<RemoteChatSessionStatus, DomainError> {
        self.client
            .remote_chat_status(&self.session_token().await?)
            .await
    }

    async fn list_catalog(&self, session_id: &str) -> Result<RemoteChatCatalog, DomainError> {
        self.client
            .remote_chat_catalog(&self.session_token().await?, session_id)
            .await
    }

    async fn list_chats(
        &self,
        session_id: &str,
        owner: RemoteChatOwner,
    ) -> Result<Vec<RemoteChatSummary>, DomainError> {
        self.client
            .remote_chat_list_chats(&self.session_token().await?, session_id, owner)
            .await
    }

    async fn get_history(
        &self,
        session_id: &str,
        target: RemoteChatTarget,
    ) -> Result<RemoteChatHistory, DomainError> {
        self.client
            .remote_chat_history(&self.session_token().await?, session_id, target)
            .await
    }

    async fn submit(
        &self,
        session_id: &str,
        request: RemoteChatSubmit,
    ) -> Result<RemoteChatSubmitResponse, DomainError> {
        self.client
            .remote_chat_submit(&self.session_token().await?, session_id, request)
            .await
    }

    async fn read_events(
        &self,
        session_id: &str,
        after_sequence: u64,
    ) -> Result<RemoteChatEventsPage, DomainError> {
        self.client
            .remote_chat_events(&self.session_token().await?, session_id, after_sequence)
            .await
    }

    async fn stop_generation(&self, session_id: &str, request_id: &str) -> Result<(), DomainError> {
        self.client
            .remote_chat_stop(&self.session_token().await?, session_id, request_id)
            .await
    }
}

fn now_ms() -> Result<u64, DomainError> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .map_err(|error| DomainError::InternalError(error.to_string()))
}
