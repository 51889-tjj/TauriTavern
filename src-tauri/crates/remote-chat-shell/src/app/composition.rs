use std::path::PathBuf;
use std::sync::Arc;

use tokio::sync::Semaphore;
use tt_adapter_sync::remote_chat_shell::RemoteChatShellAdapters;
use tt_adapter_sync::{
    AxumLanServerControl, HttpLanPairingClient, HttpRemoteChatClientConnector, LanPeerDiscovery,
    LanPeerStore, LocalLanAddressDiscovery,
};
use tt_application::services::lan_sync_service::{LanSyncRuntimeState, LanSyncService};
use tt_application::services::remote_chat_client_service::RemoteChatClientService;
use tt_application::services::sync_job_coordinator::SyncJobCoordinator;
use tt_ports::lan_discovery::LanDeviceDiscovery;
use tt_ports::lan_sync::LanServerControl;

use crate::platform::identity::HOST_IDENTITY;

const PRODUCT_USER_AGENT: &str = "TauriTavernRemoteChat/0.1.0";

pub struct ShellServices {
    pub lan_sync: Arc<LanSyncService>,
    pub remote_chat_client: RemoteChatClientService,
}

pub fn build_services(default_user_dir: PathBuf) -> ShellServices {
    let adapters = RemoteChatShellAdapters::new();
    let peer_store = Arc::new(LanPeerStore::new(
        default_user_dir.clone(),
        HOST_IDENTITY.platform,
    ));
    let discovery = LanPeerDiscovery::new(adapters.discovery_host);

    let server: Arc<dyn LanServerControl> = Arc::new(AxumLanServerControl::new(
        default_user_dir.join("remote-chat-shell-transfer"),
        (*peer_store).clone(),
        adapters.inbound_handler,
        adapters.server_events,
        discovery.clone(),
        adapters.database_file_access,
        adapters.remote_chat_api,
    ));

    let coordinator = Arc::new(SyncJobCoordinator::new(
        adapters.sync_executor,
        adapters.sync_reconciler,
        adapters.sync_events,
        Arc::new(Semaphore::new(1)),
    ));

    let lan_sync = Arc::new(LanSyncService::new(
        Arc::new(LanSyncRuntimeState::new()),
        adapters.lan_sync_settings,
        peer_store.clone(),
        server,
        Arc::new(LocalLanAddressDiscovery),
        Arc::new(discovery) as Arc<dyn LanDeviceDiscovery>,
        Arc::new(HttpLanPairingClient::new(PRODUCT_USER_AGENT)),
        adapters.pairing_approval,
        coordinator,
    ));

    let remote_chat_client = RemoteChatClientService::new(
        peer_store,
        Arc::new(HttpRemoteChatClientConnector::new(PRODUCT_USER_AGENT)),
    );

    ShellServices {
        lan_sync,
        remote_chat_client,
    }
}
