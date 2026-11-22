import assert from 'node:assert/strict';
import test from 'node:test';

import {
    isLocalRemoteShellCommand,
    toRemoteControlOperation,
} from '../src/tauri/remote-control/operations.js';
import { validateTauriTavernSettingsPagePatch } from '../src/tauri/main/services/remote-control/desktop-bridge.js';

test('remote mobile invoke maps only the explicit control operations', () => {
    assert.deepEqual(
        toRemoteControlOperation('remote_control_update_tauritavern_settings_page', {
            page: 'chat',
            dto: { chat_virtualization_enabled: true },
        }),
        {
            kind: 'update_tauri_tavern_settings_page',
            page: 'chat',
            dto: { chat_virtualization_enabled: true },
        },
    );
    assert.deepEqual(
        toRemoteControlOperation('remote_control_get_tauritavern_settings_page', { page: 'chat' }),
        { kind: 'get_tauri_tavern_settings_page', page: 'chat' },
    );
    assert.deepEqual(
        toRemoteControlOperation('remote_control_get_sillytavern_settings_page', { page: 'generation' }),
        { kind: 'get_silly_tavern_settings_page', page: 'generation' },
    );
    assert.deepEqual(
        toRemoteControlOperation('remote_control_update_sillytavern_settings_page', {
            page: 'interface',
            dto: { timestampsEnabled: false },
        }),
        {
            kind: 'update_silly_tavern_settings_page',
            page: 'interface',
            dto: { timestampsEnabled: false },
        },
    );
    assert.deepEqual(
        toRemoteControlOperation('remote_control_get_chat_completion_settings', { source: 'openai' }),
        { kind: 'get_chat_completion_settings', source: 'openai' },
    );
    assert.deepEqual(
        toRemoteControlOperation('remote_control_update_chat_completion_settings', {
            dto: { source: 'openai', model: 'gpt-test' },
        }),
        {
            kind: 'update_chat_completion_settings',
            dto: { source: 'openai', model: 'gpt-test' },
        },
    );
    assert.deepEqual(
        toRemoteControlOperation('remote_control_set_chat_completion_api_key', {
            source: 'openai',
            value: 'secret-value',
            label: 'phone',
        }),
        {
            kind: 'set_chat_completion_api_key',
            source: 'openai',
            value: 'secret-value',
            label: 'phone',
        },
    );
    assert.deepEqual(
        toRemoteControlOperation('remote_control_set_extension_enabled', {
            extensionName: 'third-party/example',
            enabled: false,
        }),
        {
            kind: 'set_extension_enabled',
            extensionName: 'third-party/example',
            enabled: false,
        },
    );
    assert.deepEqual(
        toRemoteControlOperation('remote_control_install_extension', {
            url: 'https://example.test/repo.git',
            branch: 'main',
        }),
        {
            kind: 'install_extension',
            url: 'https://example.test/repo.git',
            branch: 'main',
        },
    );
    assert.deepEqual(
        toRemoteControlOperation('remote_control_update_extension', { extensionName: 'third-party/example' }),
        { kind: 'update_extension', extensionName: 'third-party/example' },
    );
    assert.deepEqual(
        toRemoteControlOperation('remote_control_delete_extension', { extensionName: 'third-party/example' }),
        { kind: 'delete_extension', extensionName: 'third-party/example' },
    );
    assert.deepEqual(
        toRemoteControlOperation('list_llm_connections'),
        { kind: 'list_llm_connections' },
    );
    assert.equal(isLocalRemoteShellCommand('remote_control_client_invoke'), true);
    assert.throws(
        () => toRemoteControlOperation('execute_arbitrary_command', { command: 'anything' }),
        /does not support this operation/u,
    );
});

test('remote settings updates cannot cross the selected page boundary', () => {
    assert.deepEqual(
        validateTauriTavernSettingsPagePatch('chat', {
            chat_virtualization_enabled: true,
            cold_swipes_enabled: false,
        }),
        {
            chat_virtualization_enabled: true,
            cold_swipes_enabled: false,
        },
    );
    assert.throws(
        () => validateTauriTavernSettingsPagePatch('chat', {
            chat_virtualization_enabled: true,
            allow_keys_exposure: true,
        }),
        /does not allow chat settings field: allow_keys_exposure/u,
    );
    assert.throws(
        () => validateTauriTavernSettingsPagePatch('network', {
            request_proxy: {
                enabled: true,
                url: 'http://localhost:8000',
                arbitrary_path: 'not allowed',
            },
        }),
        /does not allow request proxy settings field: arbitrary_path/u,
    );
});
