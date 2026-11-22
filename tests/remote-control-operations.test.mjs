import assert from 'node:assert/strict';
import test from 'node:test';

import {
    isLocalRemoteShellCommand,
    toRemoteControlOperation,
} from '../src/tauri/remote-control/operations.js';

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
