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

test('remote mobile invoke restores byte responses for the existing frontend ABI', async () => {
    const previousWindow = globalThis.window;
    let nativeCommand;
    globalThis.window = {
        __TAURITAVERN_REMOTE_CONTROL__: {
            deviceId: 'desktop-1',
            sessionId: 'control-session',
        },
        __TAURI__: {
            core: {
                invoke: async (command, args) => {
                    nativeCommand = { command, args };
                    return { kind: 'bytes_base64', value: 'AAF//w==' };
                },
            },
        },
    };

    try {
        const result = await invoke('get_sillytavern_settings');
        assert.deepEqual(Array.from(result), [0, 1, 127, 255]);
        assert.equal(nativeCommand.command, 'remote_control_client_invoke');
        assert.equal(nativeCommand.args.deviceId, 'desktop-1');
    } finally {
        if (previousWindow === undefined) {
            delete globalThis.window;
        } else {
            globalThis.window = previousWindow;
        }
    }
});
