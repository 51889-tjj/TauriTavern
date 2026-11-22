import assert from 'node:assert/strict';
import test from 'node:test';

import { installRemoteControlDesktopBridge } from '../src/tauri/main/services/remote-control/desktop-bridge.js';

test('desktop bridge dispatches the remote TauriTavern settings read', async () => {
    const previousWindow = globalThis.window;
    let onCommand;
    let resolvePublished;
    const published = new Promise(resolve => {
        resolvePublished = resolve;
    });
    const calls = [];

    globalThis.window = {
        __TAURI__: {
            event: {
                listen: async (_eventName, callback) => {
                    onCommand = callback;
                    return () => {};
                },
            },
        },
        __TAURITAVERN__: {
            api: {
                remoteControl: {
                    host: { available: true },
                },
            },
        },
        addEventListener() {},
    };

    try {
        await installRemoteControlDesktopBridge({
            safeInvoke: async (command, args) => {
                calls.push({ command, args });
                if (command === 'get_tauritavern_settings') {
                    return { chat_virtualization_enabled: true };
                }
                if (command === 'remote_control_publish_result') {
                    resolvePublished(args.result);
                    return undefined;
                }
                throw new Error(`Unexpected desktop command: ${command}`);
            },
            invokeTransport: async command => {
                throw new Error(`Unexpected transport command: ${command}`);
            },
            getSessionId: () => 'control-session',
            markSessionStarted() {},
            markSessionEnded() {},
        });

        onCommand({
            payload: {
                kind: 'invoke',
                sessionId: 'control-session',
                requestId: 'request-1',
                operation: { kind: 'get_tauri_tavern_settings' },
            },
        });

        const result = await published;
        assert.equal(calls[0]?.command, 'get_tauritavern_settings');
        assert.equal(result.outcome.kind, 'success');
        assert.deepEqual(result.outcome.value, {
            kind: 'json',
            value: { chat_virtualization_enabled: true },
        });
    } finally {
        if (previousWindow === undefined) {
            delete globalThis.window;
        } else {
            globalThis.window = previousWindow;
        }
    }
});
