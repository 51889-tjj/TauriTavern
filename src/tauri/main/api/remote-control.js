import { isDesktopHost } from '../../../scripts/util/host-identity.js';

/**
 * @param {any} context
 */
export function installRemoteControlApi(context) {
    const hostAbi = window.__TAURITAVERN__;
    if (!hostAbi || typeof hostAbi !== 'object') {
        throw new Error('Host ABI __TAURITAVERN__ is missing');
    }
    if (!hostAbi.api || typeof hostAbi.api !== 'object') {
        hostAbi.api = {};
    }

    const safeInvoke = context?.safeInvoke;
    if (typeof safeInvoke !== 'function') {
        throw new Error('Tauri main context safeInvoke is missing');
    }

    let sessionId = null;
    let desktopBridgeReady = false;
    const available = isDesktopHost();
    hostAbi.api.remoteControl = Object.freeze({
        host: Object.freeze({
            available,
            async status() {
                if (!available) {
                    throw new Error('Remote Control hosting is only available on desktop');
                }
                const status = await safeInvoke('remote_control_get_host_status');
                sessionId = status?.sessionId ?? null;
                return status;
            },
            async startSession() {
                if (!available) {
                    throw new Error('Remote Control hosting is only available on desktop');
                }
                if (!desktopBridgeReady) {
                    throw new Error('Remote Control desktop bridge is not ready');
                }
                const status = await safeInvoke('remote_control_start_session');
                sessionId = status?.sessionId ?? null;
                return status;
            },
            async stopSession() {
                if (!available) {
                    throw new Error('Remote Control hosting is only available on desktop');
                }
                try {
                    return await safeInvoke('remote_control_stop_session');
                } finally {
                    sessionId = null;
                }
            },
        }),
    });

    return Object.freeze({
        markSessionStarted(remoteSessionId) {
            sessionId = remoteSessionId;
        },
        getSessionId() {
            return sessionId;
        },
        markSessionEnded(remoteSessionId) {
            if (sessionId === remoteSessionId) {
                sessionId = null;
            }
        },
        markDesktopBridgeReady() {
            desktopBridgeReady = true;
        },
    });
}
