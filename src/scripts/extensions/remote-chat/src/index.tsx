import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { RemoteChatApp } from './RemoteChatApp';
import { requireRemoteChatApi, requireRemoteControlApi, tr, waitForHostReady } from './host';

const MENU_ITEM_ID = 'tauritavern_remote_chat_menu_item';
const DIALOG_ID = 'tauritavern_remote_chat_dialog';
let closePanel: (() => void) | null = null;

await waitForHostReady();
const api = requireRemoteChatApi();
const remoteControlApi = requireRemoteControlApi();

function removePanel(): void {
    closePanel?.();
}

function openPanel(): void {
    if (document.getElementById(DIALOG_ID)) {
        return;
    }

    const dialog = document.createElement('dialog');
    dialog.id = DIALOG_ID;
    dialog.className = 'tt-remote-chat-dialog';
    dialog.setAttribute('aria-label', tr('title'));
    document.body.append(dialog);
    const root: Root = createRoot(dialog);

    const close = () => {
        if (closePanel === close) {
            closePanel = null;
        }
        root.unmount();
        dialog.close();
        dialog.remove();
    };
    closePanel = close;
    dialog.addEventListener('cancel', event => {
        event.preventDefault();
        close();
    }, { once: true });
    dialog.showModal();
    root.render(
        <StrictMode>
            <RemoteChatApp
                api={api}
                remoteControlApi={remoteControlApi}
                tr={tr}
                onClose={close}
            />
        </StrictMode>,
    );
}

function mountMenuItem(): void {
    if (document.getElementById(MENU_ITEM_ID)) {
        return;
    }
    const menu = document.getElementById('extensionsMenu');
    if (!(menu instanceof HTMLElement)) {
        throw new Error('SillyTavern extension menu is unavailable for Remote Chat');
    }

    const button = document.createElement('div');
    button.id = MENU_ITEM_ID;
    button.className = 'menu_button menu_button_icon fa-solid fa-tower-broadcast';
    button.setAttribute('role', 'button');
    button.setAttribute('tabindex', '0');
    button.setAttribute('aria-label', tr('open'));
    button.title = tr('open');
    button.addEventListener('click', openPanel);
    button.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openPanel();
        }
    });
    menu.append(button);
}

const sillyTavern = (window as Window & {
    SillyTavern?: {
        getContext?: () => {
            eventSource?: { once?: (eventName: string, callback: () => void) => void };
            eventTypes?: { APP_READY?: string };
        };
    };
}).SillyTavern;
const context = sillyTavern?.getContext?.();
const appReady = context?.eventTypes?.APP_READY;
if (!context?.eventSource?.once || !appReady) {
    throw new Error('SillyTavern APP_READY event is unavailable for Remote Chat');
}
context.eventSource.once(appReady, mountMenuItem);

window.addEventListener('pagehide', removePanel, { once: true });
