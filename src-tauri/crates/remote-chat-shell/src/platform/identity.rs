//! Compile-target facts for the standalone mobile shell.

use tt_contracts::host::{HostIdentity, HostKind, HostPlatform};

#[cfg(target_env = "ohos")]
const PLATFORM: HostPlatform = HostPlatform::Ohos;
#[cfg(target_os = "windows")]
const PLATFORM: HostPlatform = HostPlatform::Windows;
#[cfg(target_os = "macos")]
const PLATFORM: HostPlatform = HostPlatform::Macos;
#[cfg(all(target_os = "linux", not(target_env = "ohos")))]
const PLATFORM: HostPlatform = HostPlatform::Linux;
#[cfg(target_os = "android")]
const PLATFORM: HostPlatform = HostPlatform::Android;
#[cfg(target_os = "ios")]
const PLATFORM: HostPlatform = HostPlatform::Ios;

#[cfg(desktop)]
const KIND: HostKind = HostKind::Desktop;
#[cfg(mobile)]
const KIND: HostKind = HostKind::Mobile;

#[cfg(all(target_env = "ohos", desktop))]
compile_error!("OpenHarmony requires a Tauri build that classifies it as mobile");

pub const HOST_IDENTITY: HostIdentity = HostIdentity {
    platform: PLATFORM,
    kind: KIND,
};
