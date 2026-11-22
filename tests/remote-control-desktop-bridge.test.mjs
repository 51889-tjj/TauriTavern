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

test('desktop bridge dispatches the recent-chat reads to the paired computer', async () => {
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
                if (command === 'remote_control_publish_result') {
                    resolvePublished(args.result);
                    return undefined;
                }
                calls.push({ command, args });
                switch (command) {
                    case 'get_all_groups': return [{ id: 'group-1' }];
                    case 'get_all_characters': return [{ avatar: 'character.png' }];
                    case 'list_recent_chat_summaries': return [{ file_name: 'chat.jsonl' }];
                    case 'list_recent_group_chat_summaries': return [{ file_name: 'group-chat.jsonl' }];
                    default: throw new Error(`Unexpected desktop command: ${command}`);
                }
            },
            invokeTransport: async command => {
                throw new Error(`Unexpected transport command: ${command}`);
            },
            getSessionId: () => 'control-session',
            markSessionStarted() {},
            markSessionEnded() {},
        });

        const requests = [
            {
                operation: { kind: 'get_all_groups' },
                command: 'get_all_groups',
            },
            {
                operation: { kind: 'get_all_characters', shallow: true },
                command: 'get_all_characters',
                expectedArgs: { shallow: true },
            },
            {
                operation: {
                    kind: 'list_recent_chat_summaries',
                    characterFilter: null,
                    includeMetadata: true,
                    maxEntries: 8,
                    pinned: [{ character_name: 'character', file_name: 'chat' }],
                },
                command: 'list_recent_chat_summaries',
                expectedArgs: {
                    character_filter: null,
                    include_metadata: true,
                    max_entries: 8,
                    pinned: [{ character_name: 'character', file_name: 'chat' }],
                },
            },
            {
                operation: {
                    kind: 'list_recent_group_chat_summaries',
                    chatIds: ['group-chat'],
                    includeMetadata: false,
                    maxEntries: 8,
                    pinned: [{ chat_id: 'group-chat' }],
                },
                command: 'list_recent_group_chat_summaries',
                expectedArgs: {
                    chat_ids: ['group-chat'],
                    include_metadata: false,
                    max_entries: 8,
                    pinned: [{ chat_id: 'group-chat' }],
                },
            },
        ];

        const outcomes = [];
        for (const [index, request] of requests.entries()) {
            const published = new Promise(resolve => {
                resolvePublished = resolve;
            });
            onCommand({
                payload: {
                    kind: 'invoke',
                    sessionId: 'control-session',
                    requestId: `recent-${index}`,
                    operation: request.operation,
                },
            });
            outcomes.push(await published);
        }

        assert.deepEqual(
            calls.map(call => call.command),
            requests.map(request => request.command),
        );
        assert.deepEqual(calls[0].args, undefined);
        assert.deepEqual(calls[1].args, requests[1].expectedArgs);
        assert.deepEqual(calls[2].args, requests[2].expectedArgs);
        assert.deepEqual(calls[3].args, requests[3].expectedArgs);
        assert.deepEqual(
            outcomes.map(result => result.outcome.value.value),
            [
                [{ id: 'group-1' }],
                [{ avatar: 'character.png' }],
                [{ file_name: 'chat.jsonl' }],
                [{ file_name: 'group-chat.jsonl' }],
            ],
        );
        assert.ok(outcomes.every(result => result.outcome.kind === 'success'));
    } finally {
        if (previousWindow === undefined) {
            delete globalThis.window;
        } else {
            globalThis.window = previousWindow;
        }
    }
});
