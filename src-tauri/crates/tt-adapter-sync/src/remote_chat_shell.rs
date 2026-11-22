use std::sync::Arc;

use async_trait::async_trait;
use tokio::sync::RwLock;
use tt_contracts::lan_discovery::LanDiscoveredDevice;
use tt_contracts::remote_chat::{
    RemoteChatCatalog, RemoteChatEventsPage, RemoteChatHistory, RemoteChatOwner,
    RemoteChatSessionStatus, RemoteChatSubmit, RemoteChatSubmitResponse, RemoteChatSummary,
    RemoteChatTarget,
};
use tt_contracts::sync::{SyncExecutionFailure, SyncExecutionReport, SyncJob, SyncJobEvent};
use tt_domain::errors::DomainError;
use tt_domain::models::lan_sync::{
    LanPairCompleteRequest, LanPairCompleteResponse, LanServerSettings, SyncPreferences,
};
use tt_ports::database::DatabaseFileAccess;
use tt_ports::lan_discovery::LanDiscoveryHost;
use tt_ports::lan_sync::{
    LanInboundRequestHandler, LanPairingApprovalRequest, LanServerEvents,
    LanSyncSettingsRepository, PairingApproval,
};
use tt_ports::remote_chat::RemoteChatApi;
use tt_ports::sync::{DataChangeReconciler, SyncJobEventPublisher, SyncJobExecutor};
use ttsync_contract::sync::{OverwritePolicy, SyncMode};

/// Dependencies for the temporary LAN listener used only while pairing a
/// Remote Chat client. The shell never accepts file sync or hosts chat sessions.
pub struct RemoteChatShellAdapters {
    pub database_file_access: Arc<dyn DatabaseFileAccess>,
    pub discovery_host: Arc<dyn LanDiscoveryHost>,
    pub inbound_handler: Arc<dyn LanInboundRequestHandler>,
    pub lan_sync_settings: Arc<dyn LanSyncSettingsRepository>,
    pub pairing_approval: Arc<dyn PairingApproval>,
    pub remote_chat_api: Arc<dyn RemoteChatApi>,
    pub server_events: Arc<dyn LanServerEvents>,
    pub sync_events: Arc<dyn SyncJobEventPublisher>,
    pub sync_executor: Arc<dyn SyncJobExecutor>,
    pub sync_reconciler: Arc<dyn DataChangeReconciler>,
}

impl RemoteChatShellAdapters {
    pub fn new() -> Self {
        Self {
            database_file_access: Arc::new(ShellDatabaseAccess::default()),
            discovery_host: Arc::new(ShellDiscoveryHost),
            inbound_handler: Arc::new(DisabledLanInbound),
            lan_sync_settings: Arc::new(ShellLanSyncSettings),
            pairing_approval: Arc::new(RejectInboundPairing),
            remote_chat_api: Arc::new(DisabledRemoteChatApi),
            server_events: Arc::new(ShellServerEvents),
            sync_events: Arc::new(NoopSyncEvents),
            sync_executor: Arc::new(DisabledSyncExecutor),
            sync_reconciler: Arc::new(NoopReconciler),
        }
    }
}

impl Default for RemoteChatShellAdapters {
    fn default() -> Self {
        Self::new()
    }
}

struct ShellLanSyncSettings;

#[async_trait]
impl LanSyncSettingsRepository for ShellLanSyncSettings {
    async fn load_or_create_server_settings(&self) -> Result<LanServerSettings, DomainError> {
        Ok(LanServerSettings {
            // Port zero lets the OS choose an available port for this temporary listener.
            port: 0,
            auto_start: false,
        })
    }

    async fn load_or_create_sync_preferences(&self) -> Result<SyncPreferences, DomainError> {
        Ok(SyncPreferences {
            manual_default_mode: SyncMode::Incremental,
            overwrite_policy: OverwritePolicy::Exact,
        })
    }

    async fn save_sync_preferences(
        &self,
        _preferences: &SyncPreferences,
    ) -> Result<(), DomainError> {
        Err(DomainError::InvalidData(
            "LAN Sync preferences are not available in the Remote Chat shell".to_string(),
        ))
    }
}

struct ShellDiscoveryHost;

#[async_trait]
impl LanDiscoveryHost for ShellDiscoveryHost {
    async fn set_enabled(&self, _enabled: bool) -> Result<(), DomainError> {
        Ok(())
    }

    fn publish_changed(&self, _devices: Vec<LanDiscoveredDevice>) {}
}

#[derive(Default)]
struct ShellDatabaseAccess {
    lock: Arc<RwLock<()>>,
}

#[async_trait]
impl DatabaseFileAccess for ShellDatabaseAccess {
    async fn prepare_sync(
        &self,
        _receiving: bool,
    ) -> Result<tokio::sync::OwnedRwLockWriteGuard<()>, DomainError> {
        Ok(self.lock.clone().write_owned().await)
    }
}

struct ShellServerEvents;

impl LanServerEvents for ShellServerEvents {
    fn report_lan_server_error(&self, message: String) {
        tracing::error!("{message}");
    }

    fn pairing_completed(&self) {}
}

struct DisabledLanInbound;

#[async_trait]
impl LanInboundRequestHandler for DisabledLanInbound {
    async fn complete_pairing(
        &self,
        _request: LanPairCompleteRequest,
    ) -> Result<LanPairCompleteResponse, DomainError> {
        Err(DomainError::AuthenticationError(
            "The Remote Chat shell does not accept inbound pairing requests".to_string(),
        ))
    }

    async fn accept_pull_request(
        &self,
        _peer_device_id: ttsync_contract::peer::DeviceId,
        _options: tt_contracts::sync::SyncOperationOptions,
    ) -> Result<(), DomainError> {
        Err(file_sync_unavailable())
    }
}

struct RejectInboundPairing;

#[async_trait]
impl PairingApproval for RejectInboundPairing {
    async fn request(&self, _request: LanPairingApprovalRequest) -> Result<bool, DomainError> {
        Ok(false)
    }

    async fn confirm(&self, _request_id: &str, _accept: bool) -> Result<(), DomainError> {
        Ok(())
    }

    async fn cancel_all(&self) {}
}

struct DisabledSyncExecutor;

#[async_trait]
impl SyncJobExecutor for DisabledSyncExecutor {
    async fn execute(&self, _job: SyncJob) -> Result<SyncExecutionReport, SyncExecutionFailure> {
        Err(SyncExecutionFailure::without_local_mutation(
            file_sync_unavailable(),
        ))
    }
}

struct NoopReconciler;

#[async_trait]
impl DataChangeReconciler for NoopReconciler {
    async fn reconcile(&self, _reason: &str) -> Result<(), DomainError> {
        Ok(())
    }
}

struct NoopSyncEvents;

impl SyncJobEventPublisher for NoopSyncEvents {
    fn publish_sync_job(&self, _event: SyncJobEvent) {}
}

struct DisabledRemoteChatApi;

fn shell_host_unavailable() -> DomainError {
    DomainError::InvalidData(
        "The Remote Chat shell is a client and cannot host Remote Chat sessions".to_string(),
    )
}

fn file_sync_unavailable() -> DomainError {
    DomainError::InvalidData(
        "LAN Sync file transfer is not available in the Remote Chat shell".to_string(),
    )
}

#[async_trait]
impl RemoteChatApi for DisabledRemoteChatApi {
    async fn stop_host_session(&self) -> Result<(), DomainError> {
        Ok(())
    }

    async fn session_status(&self) -> Result<RemoteChatSessionStatus, DomainError> {
        Err(shell_host_unavailable())
    }

    async fn list_catalog(&self, _session_id: &str) -> Result<RemoteChatCatalog, DomainError> {
        Err(shell_host_unavailable())
    }

    async fn list_chats(
        &self,
        _session_id: &str,
        _owner: RemoteChatOwner,
    ) -> Result<Vec<RemoteChatSummary>, DomainError> {
        Err(shell_host_unavailable())
    }

    async fn get_history(
        &self,
        _session_id: &str,
        _target: RemoteChatTarget,
    ) -> Result<RemoteChatHistory, DomainError> {
        Err(shell_host_unavailable())
    }

    async fn submit(
        &self,
        _session_id: &str,
        _request: RemoteChatSubmit,
    ) -> Result<RemoteChatSubmitResponse, DomainError> {
        Err(shell_host_unavailable())
    }

    async fn read_events(
        &self,
        _session_id: &str,
        _after_sequence: u64,
    ) -> Result<RemoteChatEventsPage, DomainError> {
        Err(shell_host_unavailable())
    }

    async fn stop_generation(
        &self,
        _session_id: &str,
        _request_id: &str,
    ) -> Result<(), DomainError> {
        Err(shell_host_unavailable())
    }
}
