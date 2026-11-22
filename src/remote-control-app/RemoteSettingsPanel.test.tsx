import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test } from '@rstest/core';

import { RemoteSettingsPanel } from './RemoteSettingsPanel';
import type { RemoteControlActions, RemoteSettingsPage, RemoteSettingsPageData } from './RemoteControlContract';

afterEach(() => {
    cleanup();
});

function settingsForPage(page: RemoteSettingsPage): RemoteSettingsPageData {
    switch (page) {
        case 'chat':
            return {
                page,
                chatVirtualizationEnabled: false,
                coldSwipesEnabled: false,
                codeMirrorEditorEnabled: true,
            };
        case 'backups':
            return {
                page,
                automaticEnabled: true,
                zstdCompressionEnabled: true,
                maxFilesPerPrefix: 20,
                maxTotalFiles: 500,
                maxTotalBytes: 1_073_741_824,
            };
        case 'appearance':
            return {
                page,
                avatarPersonaOriginalImagesEnabled: false,
                dynamicTheme: {
                    enabled: false,
                    dayTheme: '',
                    nightTheme: '',
                    wallpaperEnabled: false,
                    dayWallpaper: '',
                    nightWallpaper: '',
                },
            };
        case 'network':
            return { page, requestProxy: { enabled: false, url: '', bypass: [] } };
        case 'privacy':
            return { page, allowKeysExposure: false };
        case 'models':
            return { page, promptCacheTtl: 'off' };
        case 'agent':
            return {
                page,
                retention: {
                    autoPruneEnabled: false,
                    keepRecentTerminalRuns: 100,
                    keepFullRecentRuns: 20,
                },
            };
        case 'generation':
            return {
                page,
                responseLength: 80,
                contextLength: 2048,
                swipesEnabled: true,
                mainApi: 'kobold',
                mainApiOptions: [{ value: 'kobold', label: 'Kobold' }],
            };
        case 'interface':
            return {
                page,
                timestampsEnabled: true,
                messageTokenCountEnabled: false,
                hideChatAvatarsEnabled: false,
                reducedMotionEnabled: false,
                compactInputAreaEnabled: true,
            };
    }
}

test('settings navigation fetches only the selected category from the computer', async () => {
    const user = userEvent.setup();
    const requestedPages: RemoteSettingsPage[] = [];
    const actions = {
        getSettingsPage: async (page: RemoteSettingsPage) => {
            requestedPages.push(page);
            return settingsForPage(page);
        },
        updateSettingsPage: async () => {},
    } as unknown as RemoteControlActions;

    render(<RemoteSettingsPanel actions={actions} />);

    await screen.findByRole('checkbox', { name: /聊天 DOM 虚拟化/ });
    expect(requestedPages).toEqual(['chat']);

    await user.click(screen.getByRole('tab', { name: '外观' }));
    await screen.findByRole('textbox', { name: '日间主题' });
    expect(requestedPages).toEqual(['chat', 'appearance']);
});

test('saving a settings category sends that category to the computer', async () => {
    const user = userEvent.setup();
    const saved: RemoteSettingsPageData[] = [];
    const actions = {
        getSettingsPage: async (page: RemoteSettingsPage) => settingsForPage(page),
        updateSettingsPage: async (data: RemoteSettingsPageData) => {
            saved.push(data);
        },
    } as unknown as RemoteControlActions;

    render(<RemoteSettingsPanel actions={actions} />);

    const virtualization = await screen.findByRole('checkbox', { name: /聊天 DOM 虚拟化/ });
    await user.click(virtualization);
    await user.click(screen.getByRole('button', { name: '保存此分类' }));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]).toEqual({
        page: 'chat',
        chatVirtualizationEnabled: true,
        coldSwipesEnabled: false,
        codeMirrorEditorEnabled: true,
    });
});
