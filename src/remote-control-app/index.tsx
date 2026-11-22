import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { waitForRemoteShellConnection } from '../tauri/remote-control/mobile-gate.js';
import { RemoteControlApp } from './RemoteControlApp';
import { createRemoteControlActions } from './RemoteControlHost';

const rootElement = document.getElementById('remote-root');
if (!(rootElement instanceof HTMLElement)) {
    throw new Error('Remote Control root element is missing');
}
const root: HTMLElement = rootElement;

function showStartupFailure(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const panel = document.createElement('main');
    panel.className = 'tt-remote-error';
    const title = document.createElement('h1');
    title.textContent = '无法启动 Remote Control';
    const detail = document.createElement('p');
    detail.textContent = message;
    panel.append(title, detail);
    root.replaceChildren(panel);
}

async function startRemoteControl(): Promise<void> {
    try {
        const device = await waitForRemoteShellConnection();
        const actions = createRemoteControlActions(device);
        createRoot(root).render(
            <StrictMode>
                <RemoteControlApp device={device} actions={actions} />
            </StrictMode>,
        );
    } catch (error) {
        showStartupFailure(error);
    }
}

void startRemoteControl();
