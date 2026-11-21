import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from '@rstest/core';

import { RemoteChatApp } from './RemoteChatApp';

test('paired phone selects a desktop chat, sends text, and displays its reply', async () => {
    const user = userEvent.setup();
    const submitted: Array<{
        requestId: string;
        target: TauriTavernRemoteChatTarget;
        text: string;
    }> = [];
    let readCount = 0;
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
            getHistory: () => Promise.resolve(submitted.length
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
                    generationActive: false,
                    latestSequence: 2,
                }
                : {
                    target,
                    title: 'First conversation',
                    messages: [],
                    generationActive: false,
                    latestSequence: 0,
                }),
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
    await user.type(screen.getByRole('textbox', { name: 'messagePlaceholder' }), 'Hello from my phone');
    await user.click(screen.getByRole('button', { name: 'send' }));

    await waitFor(() => expect(screen.getByText('The desktop reply')).toBeTruthy());
    expect(submitted).toHaveLength(1);
    expect(submitted[0]?.target).toEqual(target);
    expect(submitted[0]?.text).toBe('Hello from my phone');
    expect(readCount).toBeGreaterThan(0);
});
