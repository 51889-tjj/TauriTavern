import assert from 'node:assert/strict';
import test from 'node:test';

import { installRemoteChatApi } from '../src/tauri/main/api/remote-chat.js';

test('Remote Chat Host and client APIs preserve their command and event contracts', async () => {
    const previousWindow = globalThis.window;
    const previousIdentity = globalThis.__TAURITAVERN_HOST__;
    const calls = [];

    globalThis.__TAURITAVERN_HOST__ = { platform: 'windows', kind: 'desktop' };
    globalThis.window = {
        __TAURITAVERN__: { api: {} },
    };

    try {
        const remoteChatBootstrap = installRemoteChatApi({
            safeInvoke(command, args) {
                calls.push({ command, args });
                if (command === 'remote_chat_start_session') {
                    return Promise.resolve({ active: true, sessionId: 'session-1' });
                }
                return Promise.resolve(undefined);
            },
        });
        remoteChatBootstrap.markDesktopBridgeReady();

        const api = globalThis.window.__TAURITAVERN__.api.remoteChat;
        assert.equal(api.host.available, true);
        assert.equal(await api.host.startSession().then(() => remoteChatBootstrap.getSessionId()), 'session-1');

        await api.client.listCatalog('device-1', 'session-1');
        await api.client.submit('device-1', 'session-1', {
            requestId: 'r1',
            target: { kind: 'character', characterName: 'c', fileName: 'chat' },
            text: 'hello',
        });
        await api.client.readEvents('device-1', 'session-1', 4);
        assert.deepEqual(calls.slice(-3), [
            {
                command: 'remote_chat_client_list_catalog',
                args: { deviceId: 'device-1', sessionId: 'session-1' },
            },
            {
                command: 'remote_chat_client_submit',
                args: {
                    deviceId: 'device-1',
                    sessionId: 'session-1',
                    request: {
                        requestId: 'r1',
                        target: { kind: 'character', characterName: 'c', fileName: 'chat' },
                        text: 'hello',
                    },
                },
            },
            {
                command: 'remote_chat_client_read_events',
                args: { deviceId: 'device-1', sessionId: 'session-1', afterSequence: 4 },
            },
        ]);

        await api.host.stopSession();
        assert.equal(remoteChatBootstrap.getSessionId(), null);
    } finally {
        if (previousWindow === undefined) {
            delete globalThis.window;
        } else {
            globalThis.window = previousWindow;
        }
        if (previousIdentity === undefined) {
            delete globalThis.__TAURITAVERN_HOST__;
        } else {
            globalThis.__TAURITAVERN_HOST__ = previousIdentity;
        }
    }
});
