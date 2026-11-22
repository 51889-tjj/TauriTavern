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
    assert.deepEqual(
        toRemoteControlOperation('get_all_characters', { shallow: true }),
        { kind: 'get_all_characters', shallow: true },
    );
    assert.deepEqual(
        toRemoteControlOperation('get_all_groups'),
        { kind: 'get_all_groups' },
    );
    assert.deepEqual(
        toRemoteControlOperation('list_recent_chat_summaries', {
            include_metadata: false,
            max_entries: 12,
            pinned: [{ character_name: 'character', file_name: 'chat' }],
        }),
        {
            kind: 'list_recent_chat_summaries',
            characterFilter: null,
            includeMetadata: false,
            maxEntries: 12,
            pinned: [{ character_name: 'character', file_name: 'chat' }],
        },
    );
    assert.deepEqual(
        toRemoteControlOperation('list_recent_group_chat_summaries', {
            chat_ids: ['group-chat'],
            include_metadata: false,
            max_entries: 8,
            pinned: [{ chat_id: 'group-chat' }],
        }),
        {
            kind: 'list_recent_group_chat_summaries',
            chatIds: ['group-chat'],
            includeMetadata: false,
            maxEntries: 8,
            pinned: [{ chat_id: 'group-chat' }],
        },
    );
    assert.throws(
        () => toRemoteControlOperation('execute_arbitrary_command', { command: 'anything' }),
        /does not support this operation/u,
    );
    assert.equal(isLocalRemoteShellCommand('remote_control_client_invoke'), true);
});

test('remote chat payload uses the shell binary transport', async () => {
    const previousWindow = globalThis.window;
    let nativeCommand;
    const bytes = Uint8Array.from([91, 93]);
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
        const result = await invoke('open_chat_payload_json', {
            target: { kind: 'character', characterId: 'character-1', fileName: 'chat-1' },
            allowNotFound: true,
        });
        assert.equal(result, bytes);
        assert.equal(nativeCommand.command, 'remote_control_client_get_chat_payload');
        assert.equal(nativeCommand.args.deviceId, 'desktop-1');
        assert.equal(nativeCommand.args.sessionId, 'control-session');
        assert.deepEqual(nativeCommand.args.target, {
            kind: 'character',
            characterId: 'character-1',
            fileName: 'chat-1',
        });
        assert.equal(nativeCommand.args.allowNotFound, true);
    } finally {
        if (previousWindow === undefined) {
            delete globalThis.window;
        } else {
            globalThis.window = previousWindow;
        }
    }
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

test('third-party extension assets use the paired native resource protocol remotely', () => {
    const previousWindow = globalThis.window;
    const previousLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const previousMutationObserver = Object.getOwnPropertyDescriptor(globalThis, 'MutationObserver');
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: { getItem: () => null },
    });
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: { language: 'en' },
    });
    Object.defineProperty(globalThis, 'MutationObserver', {
        configurable: true,
        value: class {
            observe() {}
        },
    });
    globalThis.window = {
        __TAURITAVERN_REMOTE_CONTROL__: {
            deviceId: 'desktop-1',
            sessionId: 'control-session',
        },
    };

    return import('../src/scripts/extensions/runtime/resource-paths.js').then(({ getExtensionResourceUrl }) => {
        assert.equal(
            getExtensionResourceUrl('third-party/example-extension', 'manifest.json'),
            'tt-remote://control-session.localhost/scripts/extensions/third-party/example-extension/manifest.json',
        );
        assert.equal(
            getExtensionResourceUrl('quick-reply', 'manifest.json'),
            '/scripts/extensions/quick-reply/manifest.json',
        );
    }).finally(() => {
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;
        if (previousLocalStorage === undefined) delete globalThis.localStorage;
        else Object.defineProperty(globalThis, 'localStorage', previousLocalStorage);
        if (previousNavigator === undefined) delete globalThis.navigator;
        else Object.defineProperty(globalThis, 'navigator', previousNavigator);
        if (previousMutationObserver === undefined) delete globalThis.MutationObserver;
        else Object.defineProperty(globalThis, 'MutationObserver', previousMutationObserver);
    });
});
