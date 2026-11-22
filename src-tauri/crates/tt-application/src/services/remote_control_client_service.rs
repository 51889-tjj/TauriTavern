use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::Mutex;
use tt_contracts::remote_control::{
    RemoteControlInvokeRequest, RemoteControlOperation, RemoteControlSessionStatus,
    RemoteControlValue,
};
use tt_domain::errors::DomainError;
use tt_ports::lan_sync::LanPeerRepository;
use tt_ports::remote_control::{RemoteControlClientConnector, RemoteControlClientSession};

pub struct RemoteControlClientService {
    peer_repository: Arc<dyn LanPeerRepository>,
    connector: Arc<dyn RemoteControlClientConnector>,
    sessions: Mutex<HashMap<String, Arc<dyn RemoteControlClientSession>>>,
}

impl RemoteControlClientService {
    pub fn new(
        peer_repository: Arc<dyn LanPeerRepository>,
        connector: Arc<dyn RemoteControlClientConnector>,
    ) -> Self {
        Self {
            peer_repository,
            connector,
            sessions: Mutex::new(HashMap::new()),
        }
    }

    pub async fn connect(
        &self,
        device_id: &str,
    ) -> Result<RemoteControlSessionStatus, DomainError> {
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
                "The selected device does not have an active Remote Control session".to_string(),
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

    pub async fn session_status(
        &self,
        device_id: &str,
    ) -> Result<RemoteControlSessionStatus, DomainError> {
        self.client(device_id).await?.session_status().await
    }

    pub async fn invoke(
        &self,
        device_id: &str,
        session_id: &str,
        request_id: &str,
        operation: RemoteControlOperation,
    ) -> Result<RemoteControlValue, DomainError> {
        self.client(device_id)
            .await?
            .invoke(RemoteControlInvokeRequest {
                session_id: session_id.to_string(),
                request_id: request_id.to_string(),
                operation,
            })
            .await
    }

    pub async fn get_sillytavern_settings(
        &self,
        device_id: &str,
        session_id: &str,
    ) -> Result<Vec<u8>, DomainError> {
        self.client(device_id)
            .await?
            .get_sillytavern_settings(session_id)
            .await
    }

    async fn client(
        &self,
        device_id: &str,
    ) -> Result<Arc<dyn RemoteControlClientSession>, DomainError> {
        self.sessions
            .lock()
            .await
            .get(device_id)
            .cloned()
            .ok_or_else(|| {
                DomainError::Conflict(format!(
                    "Remote Control is not connected to paired device {device_id}"
                ))
            })
    }
}
