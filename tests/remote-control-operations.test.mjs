import assert from 'node:assert/strict';
import test from 'node:test';

import {
    isLocalRemoteShellCommand,
    toRemoteControlOperation,
} from '../src/tauri/remote-control/operations.js';
import { invoke } from '../src/tauri-bridge.js';

test('remote mobile invoke maps configuration commands and rejects everything else', () => {
    assert.deepEqual(
        toRemoteControlOperation('update_tauritavern_settings', {
            dto: { close_to_tray_on_close: true },
        }),
        {
            kind: 'update_tauri_tavern_settings',
            dto: { close_to_tray_on_close: true },
        },
    );
    assert.deepEqual(
        toRemoteControlOperation('list_llm_connections'),
        { kind: 'list_llm_connections' },
    );
    assert.throws(
        () => toRemoteControlOperation('execute_arbitrary_command', { command: 'anything' }),
        /does not support this operation/u,
    );
    assert.equal(isLocalRemoteShellCommand('remote_control_client_invoke'), true);
});

test('remote settings read uses the shell binary transport', async () => {
    const previousWindow = globalThis.window;
    let nativeCommand;
    const bytes = Uint8Array.from([0, 1, 127, 255]);
    globalThis.window = {
        __TAURITAVERN_REMOTE_CONTROL__: {
            deviceId: 'desktop-1',
            sessionId: 'control-session',
        },
        __TAURI__: {
            core: {
                invoke: async (command, args) => {
                    nativeCommand = { command, args };
                    return bytes;
                },
            },
        },
    };

    try {
        const result = await invoke('get_sillytavern_settings');
        assert.equal(result, bytes);
        assert.equal(nativeCommand.command, 'remote_control_client_get_sillytavern_settings');
        assert.equal(nativeCommand.args.deviceId, 'desktop-1');
        assert.equal(nativeCommand.args.sessionId, 'control-session');
    } finally {
        if (previousWindow === undefined) {
            delete globalThis.window;
        } else {
            globalThis.window = previousWindow;
        }
    }
});
