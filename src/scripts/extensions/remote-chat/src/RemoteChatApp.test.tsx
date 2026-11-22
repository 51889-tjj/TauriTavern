import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from '@rstest/core';

import { RemoteChatApp } from './RemoteChatApp';
import { RemoteControlHostPanel } from './RemoteControlHostPanel';

test('paired phone selects a desktop chat, sends text, and displays its reply', async () => {
    const user = userEvent.setup();
    const submitted: Array<{
        requestId: string;
        target: TauriTavernRemoteChatTarget;
        text: string;
    }> = [];
    const historyCursors: Array<TauriTavernChatPayloadCursor | undefined> = [];
    let readCount = 0;
    const recentCursor = { offset: 100, size: 200, modifiedMillis: 1 };
    const target: TauriTavernRemoteChatTarget = {
        kind: 'character',
        characterName: 'alice',
        fileName: 'chat-1',
    };
    const api: TauriTavernRemoteChatApi = {
        host: {
            available: false,
            status: () => Promise.resolve({ active: false }),
            startSession: () => Promise.resolve({ active: true, sessionId: 'host-session' }),
            stopSession: () => Promise.resolve(),
        },
        client: {
            listPairedDevices: () => Promise.resolve([{
                device_id: 'desktop-1',
                device_name: 'My PC',
                platform: 'windows',
            }]),
            connect: () => Promise.resolve({ active: true, sessionId: 'host-session' }),
            disconnect: () => Promise.resolve(),
            status: () => Promise.resolve({ active: true, sessionId: 'host-session' }),
            listCatalog: () => Promise.resolve({
                characters: [{
                    characterName: 'alice',
                    displayName: 'Alice',
                    avatar: 'alice.png',
                }],
                groups: [],
            }),
            listChats: () => Promise.resolve([{
                target,
                title: 'First conversation',
                preview: 'Earlier message',
                messageCount: 1,
                updatedAtMs: 1,
            }]),
            getHistory: (_deviceId, _sessionId, _target, beforeCursor) => {
                historyCursors.push(beforeCursor);
                if (beforeCursor) {
                    return Promise.resolve({
                        target,
                        title: 'First conversation',
                        messages: [{
                            name: 'Alice',
                            isUser: false,
                            isSystem: false,
                            text: 'Earlier archived message',
                            sentAt: '2026-11-20',
                        }],
                        cursor: { offset: 0, size: 200, modifiedMillis: 1 },
                        hasMoreBefore: false,
                        generationActive: false,
                        latestSequence: 0,
                    });
                }
                return Promise.resolve(submitted.length
                    ? {
                        target,
                        title: 'First conversation',
                        messages: [
                            {
                                name: 'User',
                                isUser: true,
                                isSystem: false,
                                text: 'Hello from my phone',
                                sentAt: '2026-11-21',
                            },
                            {
                                name: 'Alice',
                                isUser: false,
                                isSystem: false,
                                text: 'The desktop reply',
                                sentAt: '2026-11-21',
                            },
                        ],
                        cursor: { offset: 100, size: 200, modifiedMillis: 1 },
                        hasMoreBefore: false,
                        generationActive: false,
                        latestSequence: 2,
                    }
                    : {
                        target,
                        title: 'First conversation',
                        messages: [{
                            name: 'Alice',
                            isUser: false,
                            isSystem: false,
                            text: 'Most recent message',
                            sentAt: '2026-11-21',
                        }],
                        cursor: recentCursor,
                        hasMoreBefore: true,
                        generationActive: false,
                        latestSequence: 0,
                    });
            },
            submit: (_deviceId, _sessionId, request) => {
                submitted.push(request);
                return Promise.resolve({ requestId: request.requestId, accepted: true });
            },
            readEvents: () => {
                readCount += 1;
                const requestId = submitted.at(-1)?.requestId ?? '';
                return Promise.resolve({
                    events: [
                        {
                            sequence: 1,
                            requestId,
                            kind: 'token',
                            text: 'The desktop reply',
                        },
                        {
                            sequence: 2,
                            requestId,
                            kind: 'completed',
                        },
                    ],
                    nextSequence: 2,
                    generationActive: false,
                });
            },
            stopGeneration: () => Promise.resolve(),
        },
    };

    render(
        <RemoteChatApp
            api={api}
            tr={key => key}
            onClose={() => {}}
        />,
    );

    await user.click(await screen.findByRole('button', { name: /My PC/ }));
    await user.click(await screen.findByRole('button', { name: 'Alice' }));
    await user.click(await screen.findByRole('button', { name: /First conversation/ }));
    await user.click(screen.getByRole('button', { name: 'loadOlder' }));
    await screen.findByText('Earlier archived message');
    expect(historyCursors[1]).toEqual(recentCursor);
    expect(screen.getAllByRole('article').map(message => message.textContent?.trim())).toEqual([
        'AliceEarlier archived message',
        'AliceMost recent message',
    ]);

    await user.type(screen.getByRole('textbox', { name: 'messagePlaceholder' }), 'Hello from my phone');
    await user.click(screen.getByRole('button', { name: 'send' }));

    await waitFor(() => expect(screen.getByText('The desktop reply')).toBeTruthy());
    expect(submitted).toHaveLength(1);
    expect(submitted[0]?.target).toEqual(target);
    expect(submitted[0]?.text).toBe('Hello from my phone');
    expect(readCount).toBeGreaterThan(0);
});

test('desktop explicitly starts and stops its Remote Control session', async () => {
    const user = userEvent.setup();
    let active = false;
    const api: TauriTavernRemoteControlApi = {
        host: {
            available: true,
            status: () => Promise.resolve({ active }),
            startSession: () => {
                active = true;
                return Promise.resolve({ active, sessionId: 'control-session' });
            },
            stopSession: () => {
                active = false;
                return Promise.resolve();
            },
        },
    };

    render(<RemoteControlHostPanel api={api} tr={key => key} />);

    await user.click(await screen.findByRole('button', { name: 'controlStartHost' }));
    await screen.findByText('controlActive');
    await user.click(screen.getByRole('button', { name: 'controlStopHost' }));

    await waitFor(() => expect(screen.getByText('controlInactive')).toBeTruthy());
});
