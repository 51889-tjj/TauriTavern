const PREFIX = 'remote_chat.';

const DEFAULT_MESSAGES = {
    title: 'Remote Chat',
    open: 'Remote Chat',
    hostMode: 'Host this device',
    clientMode: 'Connect to a computer',
    hostDescription: 'Paired devices can access characters and chats while this temporary session is active.',
    startHost: 'Start Remote Chat',
    stopHost: 'Stop Remote Chat',
    hostActive: 'Remote Chat is active',
    hostInactive: 'Remote Chat is not active',
    chooseDevice: 'Choose a paired computer',
    connect: 'Connect',
    disconnect: 'Disconnect',
    chooseCharacter: 'Choose a character or group',
    characters: 'Characters',
    groups: 'Groups',
    chooseChat: 'Choose a chat',
    back: 'Back',
    send: 'Send',
    stop: 'Stop',
    messagePlaceholder: 'Type a message…',
    emptyChats: 'No chats found.',
    emptyDevices: 'No paired devices found. Pair this phone with the computer in LAN Sync first.',
    hostNotActive: 'Start Remote Chat on the computer first.',
    loading: 'Loading…',
    close: 'Close',
    unknownError: 'Remote Chat request failed.',
    controlDescription: 'Paired phones can control this computer while the temporary Remote Control session is active.',
    controlStartHost: 'Start Remote Control',
    controlStopHost: 'Stop Remote Control',
    controlActive: 'Remote Control is active',
    controlInactive: 'Remote Control is not active',
} as const;

export type RemoteChatMessageKey = keyof typeof DEFAULT_MESSAGES;
export type RemoteChatTranslator = (key: RemoteChatMessageKey) => string;

type RemoteChatContext = {
    translate?: (fallback: string, key?: string) => string;
};

type RemoteChatWindow = Window & {
    SillyTavern?: {
        getContext?: () => RemoteChatContext;
    };
};

export function tr(key: RemoteChatMessageKey): string {
    const fallback = DEFAULT_MESSAGES[key];
    const translate = (window as RemoteChatWindow).SillyTavern?.getContext?.().translate;
    return translate?.(fallback, `${PREFIX}${key}`) ?? fallback;
}

export function requireRemoteChatApi(): TauriTavernRemoteChatApi {
    const host = window.__TAURITAVERN__;
    if (!host?.api?.remoteChat) {
        throw new Error('TauriTavern Remote Chat Host API is unavailable');
    }
    return host.api.remoteChat;
}

export function requireRemoteControlApi(): TauriTavernRemoteControlApi {
    const api = window.__TAURITAVERN__?.api?.remoteControl;
    if (!api) {
        throw new Error('TauriTavern Remote Control Host API is unavailable');
    }
    return api;
}

export async function waitForHostReady(): Promise<void> {
    const ready = window.__TAURITAVERN__?.ready;
    if (ready == null) {
        throw new Error('TauriTavern Host readiness is unavailable');
    }
    await ready;
}
