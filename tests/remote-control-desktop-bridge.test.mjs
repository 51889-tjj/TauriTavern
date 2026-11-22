import assert from 'node:assert/strict';
import test from 'node:test';

import { installRemoteControlDesktopBridge } from '../src/tauri/main/services/remote-control/desktop-bridge.js';

test('desktop bridge returns only the requested settings page projection', async () => {
    const previousWindow = globalThis.window;
    let onCommand;
    let resolvePublished;
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
                    return {
                        chat_virtualization_enabled: true,
                        cold_swipes_enabled: false,
                        codemirror_editor_enabled: true,
                        request_proxy: { enabled: true, url: 'private-proxy', bypass: [] },
                        allow_keys_exposure: true,
                    };
                }
                if (command === 'remote_control_publish_result') {
                    resolvePublished(args.result);
                    return undefined;
                }
                throw new Error(`Unexpected desktop command: ${command}`);
            },
            getSessionId: () => 'control-session',
            markSessionStarted() {},
            markSessionEnded() {},
        });

        const published = new Promise(resolve => {
            resolvePublished = resolve;
        });
        onCommand({
            payload: {
                kind: 'invoke',
                sessionId: 'control-session',
                requestId: 'page-chat',
                operation: { kind: 'get_tauri_tavern_settings_page', page: 'chat' },
            },
        });

        const result = await published;
        assert.deepEqual(calls.map(call => call.command), [
            'get_tauritavern_settings',
            'remote_control_publish_result',
        ]);
        assert.deepEqual(result.outcome.value.value, {
            page: 'chat',
            chatVirtualizationEnabled: true,
            coldSwipesEnabled: false,
            codeMirrorEditorEnabled: true,
        });
        assert.equal(JSON.stringify(result).includes('private-proxy'), false);
        assert.equal(JSON.stringify(result).includes('allowKeysExposure'), false);
    } finally {
        if (previousWindow === undefined) {
            delete globalThis.window;
        } else {
            globalThis.window = previousWindow;
        }
    }
});

test('desktop bridge rejects a settings patch outside its selected page', async () => {
    const previousWindow = globalThis.window;
    let onCommand;
    let resolvePublished;
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
                if (command === 'remote_control_publish_result') {
                    resolvePublished(args.result);
                    return undefined;
                }
                throw new Error(`Unexpected desktop command: ${command}`);
            },
            getSessionId: () => 'control-session',
            markSessionStarted() {},
            markSessionEnded() {},
        });

        const published = new Promise(resolve => {
            resolvePublished = resolve;
        });
        onCommand({
            payload: {
                kind: 'invoke',
                sessionId: 'control-session',
                requestId: 'page-chat-update',
                operation: {
                    kind: 'update_tauri_tavern_settings_page',
                    page: 'chat',
                    dto: {
                        chat_virtualization_enabled: true,
                        allow_keys_exposure: true,
                    },
                },
            },
        });

        const result = await published;
        assert.equal(result.outcome.kind, 'failure');
        assert.match(result.outcome.value, /does not allow chat settings field: allow_keys_exposure/u);
        assert.deepEqual(calls.map(call => call.command), ['remote_control_publish_result']);
    } finally {
        if (previousWindow === undefined) {
            delete globalThis.window;
        } else {
            globalThis.window = previousWindow;
        }
    }
});
