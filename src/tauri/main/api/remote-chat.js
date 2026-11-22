import { isDesktopHost } from '../../../scripts/util/host-identity.js';

/**
 * @param {any} context
 */
export function installRemoteChatApi(context) {
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
    hostAbi.api.remoteChat = Object.freeze({
        host: Object.freeze({
            available: isDesktopHost(),
            async status() {
                if (!isDesktopHost()) {
                    throw new Error('Remote Chat hosting is only available on desktop');
                }
                const status = await safeInvoke('remote_chat_get_host_status');
                sessionId = status?.sessionId ?? null;
                return status;
            },
            async startSession() {
                if (!isDesktopHost()) {
                    throw new Error('Remote Chat hosting is only available on desktop');
                }
                if (!desktopBridgeReady) {
                    throw new Error('Remote Chat desktop bridge is not ready');
                }
                const status = await safeInvoke('remote_chat_start_session');
                sessionId = status?.sessionId ?? null;
                return status;
            },
            async stopSession() {
                if (!isDesktopHost()) {
                    throw new Error('Remote Chat hosting is only available on desktop');
                }
                try {
                    return await safeInvoke('remote_chat_stop_session');
                } finally {
                    sessionId = null;
                }
            },
        }),
        client: Object.freeze({
            listPairedDevices() {
                return safeInvoke('lan_sync_list_devices');
            },
            connect(deviceId) {
                return safeInvoke('remote_chat_client_connect', { deviceId });
            },
            disconnect(deviceId) {
                return safeInvoke('remote_chat_client_disconnect', { deviceId });
            },
            status(deviceId) {
                return safeInvoke('remote_chat_client_status', { deviceId });
            },
            listCatalog(deviceId, remoteSessionId) {
                return safeInvoke('remote_chat_client_list_catalog', {
                    deviceId,
                    sessionId: remoteSessionId,
                });
            },
            listChats(deviceId, remoteSessionId, owner) {
                return safeInvoke('remote_chat_client_list_chats', {
                    deviceId,
                    sessionId: remoteSessionId,
                    owner,
                });
            },
            getHistory(deviceId, remoteSessionId, target, beforeCursor) {
                return safeInvoke('remote_chat_client_get_history', {
                    deviceId,
                    sessionId: remoteSessionId,
                    target,
                    beforeCursor: beforeCursor ?? null,
                });
            },
            submit(deviceId, remoteSessionId, request) {
                return safeInvoke('remote_chat_client_submit', {
                    deviceId,
                    sessionId: remoteSessionId,
                    request,
                });
            },
            readEvents(deviceId, remoteSessionId, afterSequence) {
                return safeInvoke('remote_chat_client_read_events', {
                    deviceId,
                    sessionId: remoteSessionId,
                    afterSequence,
                });
            },
            stopGeneration(deviceId, remoteSessionId, requestId) {
                return safeInvoke('remote_chat_client_stop_generation', {
                    deviceId,
                    sessionId: remoteSessionId,
                    requestId,
                });
            },
        }),
    });

    return Object.freeze({
        markDesktopBridgeReady() {
            desktopBridgeReady = true;
        },
        getSessionId() {
            return sessionId;
        },
        markSessionEnded(remoteSessionId) {
            if (sessionId === remoteSessionId) {
                sessionId = null;
            }
        },
    });
}
