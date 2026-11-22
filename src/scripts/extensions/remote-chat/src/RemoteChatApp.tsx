import { useEffect, useRef, useState } from 'react';

import {
    RemoteChatClientView,
    type RemoteChatClientDevice,
    type RemoteChatView,
    type RemoteChatViewMessage,
} from './RemoteChatClientView';
import { RemoteChatHostView } from './RemoteChatHostView';
import { createRequestId, type RemoteChatMessageKey } from './host';

type RemoteChatApi = TauriTavernRemoteChatApi;
type RemoteChatTarget = TauriTavernRemoteChatTarget;
type RemoteChatOwner = TauriTavernRemoteChatOwner;
type RemoteChatMessage = RemoteChatViewMessage;
type PairedDevice = RemoteChatClientDevice;
type Mode = 'host' | 'client';
type Translator = (key: RemoteChatMessageKey) => string;

type Props = {
    api: RemoteChatApi;
    remoteControlApi?: TauriTavernRemoteControlApi;
    tr: Translator;
    onClose?: () => void;
};

function errorText(error: unknown, fallback: string): string {
    if (error instanceof Error) {
        return error.message;
    }
    return typeof error === 'string' && error ? error : fallback;
}

function mapHistoryMessages(
    messages: TauriTavernRemoteChatMessage[],
    prefix: string,
): RemoteChatMessage[] {
    return messages.map((message, index) => ({
        ...message,
        key: `${prefix}:${index}`,
    }));
}

function remoteChatTargetKey(target: RemoteChatTarget): string {
    return target.kind === 'character'
        ? `character:${target.characterName}:${target.fileName}`
        : `group:${target.groupId}:${target.chatId}`;
}

export function RemoteChatApp({ api, remoteControlApi, tr, onClose }: Props) {
    const [mode, setMode] = useState<Mode>(api.host.available ? 'host' : 'client');
    const [devices, setDevices] = useState<PairedDevice[]>([]);
    const [devicesLoaded, setDevicesLoaded] = useState(false);
    const [device, setDevice] = useState<PairedDevice | null>(null);
    const [sessionId, setSessionId] = useState('');
    const [catalog, setCatalog] = useState<TauriTavernRemoteChatCatalog | null>(null);
    const [owner, setOwner] = useState<RemoteChatOwner | null>(null);
    const [chats, setChats] = useState<TauriTavernRemoteChatSummary[]>([]);
    const [target, setTarget] = useState<RemoteChatTarget | null>(null);
    const [messages, setMessages] = useState<RemoteChatMessage[]>([]);
    const [hasOlderHistory, setHasOlderHistory] = useState(false);
    const [loadingOlderHistory, setLoadingOlderHistory] = useState(false);
    const [view, setView] = useState<RemoteChatView>('devices');
    const [selectedChatTitle, setSelectedChatTitle] = useState('');
    const [draft, setDraft] = useState('');
    const [activeRequestId, setActiveRequestId] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const eventCursorRef = useRef(0);
    const historyCursorRef = useRef<TauriTavernChatPayloadCursor | null>(null);
    const historyTargetKeyRef = useRef('');
    const loadingOlderHistoryRef = useRef(false);

    useEffect(() => {
        if (mode !== 'client' || device) {
            return;
        }
        let alive = true;
        void api.client.listPairedDevices()
            .then(value => {
                if (!Array.isArray(value)) {
                    throw new Error('LAN Sync returned an invalid paired-device list');
                }
                if (alive) {
                    setDevices(value.filter(item => (
                        ['windows', 'macos', 'linux'].includes(String(item.platform || '').toLowerCase())
                    )));
                }
            })
            .catch(reason => {
                if (alive) {
                    setError(errorText(reason, tr('unknownError')));
                }
            })
            .finally(() => {
                if (alive) {
                    setDevicesLoaded(true);
                    setBusy(false);
                }
            });
        return () => {
            alive = false;
        };
    }, [api, device, mode, tr]);

    useEffect(() => {
        if (!activeRequestId || !device || !sessionId || !target) {
            return;
        }

        let alive = true;
        let timer: number | undefined;

        const refreshHistory = async () => {
            const history = await api.client.getHistory(device.device_id, sessionId, target);
            if (alive) {
                eventCursorRef.current = history.latestSequence;
                historyCursorRef.current = history.cursor;
                setHasOlderHistory(history.hasMoreBefore);
                setMessages(mapHistoryMessages(history.messages, `${activeRequestId}:saved`));
            }
        };

        const poll = async () => {
            try {
                const page = await api.client.readEvents(
                    device.device_id,
                    sessionId,
                    eventCursorRef.current,
                );
                if (!alive) {
                    return;
                }

                let terminal = false;
                for (const event of page.events) {
                    eventCursorRef.current = Math.max(eventCursorRef.current, event.sequence);
                    if (event.requestId !== activeRequestId) {
                        continue;
                    }
                    if (event.kind === 'token' && event.text) {
                        setMessages(current => current.map(message => (
                            message.key === `${activeRequestId}:assistant`
                                ? { ...message, text: message.text + event.text }
                                : message
                        )));
                    } else if (event.kind === 'failed') {
                        setError(event.error || tr('unknownError'));
                        terminal = true;
                    } else if (event.kind === 'completed' || event.kind === 'stopped') {
                        terminal = true;
                    }
                }
                eventCursorRef.current = Math.max(eventCursorRef.current, page.nextSequence);

                if (terminal || !page.generationActive) {
                    try {
                        await refreshHistory();
                    } catch (reason) {
                        setError(errorText(reason, tr('unknownError')));
                    }
                    if (alive) {
                        setActiveRequestId('');
                    }
                    return;
                }
            } catch (reason) {
                if (alive) {
                    setError(errorText(reason, tr('unknownError')));
                    setActiveRequestId('');
                }
            }
            if (alive) {
                timer = window.setTimeout(() => void poll(), 400);
            }
        };

        void poll();
        return () => {
            alive = false;
            if (timer !== undefined) {
                window.clearTimeout(timer);
            }
        };
    }, [activeRequestId, api, device, sessionId, target, tr]);

    const connect = async (selectedDevice: PairedDevice) => {
        setBusy(true);
        setError('');
        try {
            const status = await api.client.connect(selectedDevice.device_id);
            if (!status.active || !status.sessionId) {
                throw new Error(tr('hostNotActive'));
            }
            const nextCatalog = await api.client.listCatalog(
                selectedDevice.device_id,
                status.sessionId,
            );
            setDevice(selectedDevice);
            setSessionId(status.sessionId);
            setCatalog(nextCatalog);
            setView('owners');
        } catch (reason) {
            await api.client.disconnect(selectedDevice.device_id).catch(() => undefined);
            setError(errorText(reason, tr('unknownError')));
        } finally {
            setBusy(false);
        }
    };

    const chooseOwner = async (nextOwner: RemoteChatOwner) => {
        if (!device || !sessionId) {
            return;
        }
        setBusy(true);
        setError('');
        try {
            const result = await api.client.listChats(device.device_id, sessionId, nextOwner);
            setOwner(nextOwner);
            setChats(result);
            setView('chats');
        } catch (reason) {
            setError(errorText(reason, tr('unknownError')));
        } finally {
            setBusy(false);
        }
    };

    const chooseChat = async (summary: TauriTavernRemoteChatSummary) => {
        if (!device || !sessionId) {
            return;
        }
        const targetKey = remoteChatTargetKey(summary.target);
        historyTargetKeyRef.current = targetKey;
        setBusy(true);
        setError('');
        try {
            const history = await api.client.getHistory(device.device_id, sessionId, summary.target);
            if (historyTargetKeyRef.current !== targetKey) {
                return;
            }
            eventCursorRef.current = history.latestSequence;
            historyCursorRef.current = history.cursor;
            setHasOlderHistory(history.hasMoreBefore);
            setTarget(summary.target);
            setSelectedChatTitle(summary.title);
            setMessages(mapHistoryMessages(history.messages, `${history.latestSequence}:history`));
            setView('conversation');
        } catch (reason) {
            if (historyTargetKeyRef.current === targetKey) {
                setError(errorText(reason, tr('unknownError')));
            }
        } finally {
            setBusy(false);
        }
    };

    const loadOlderHistory = async () => {
        if (
            !device
            || !sessionId
            || !target
            || !historyCursorRef.current
            || !hasOlderHistory
            || loadingOlderHistoryRef.current
        ) {
            return;
        }

        const targetKey = remoteChatTargetKey(target);
        loadingOlderHistoryRef.current = true;
        setLoadingOlderHistory(true);
        setError('');
        try {
            const history = await api.client.getHistory(
                device.device_id,
                sessionId,
                target,
                historyCursorRef.current,
            );
            if (historyTargetKeyRef.current !== targetKey) {
                return;
            }
            if (history.messages.length === 0 && history.hasMoreBefore) {
                throw new Error('电脑返回了空的历史分页，但仍报告存在更早消息');
            }
            historyCursorRef.current = history.cursor;
            setHasOlderHistory(history.hasMoreBefore);
            setMessages(current => [
                ...mapHistoryMessages(history.messages, `${history.cursor.offset}:before`),
                ...current,
            ]);
        } catch (reason) {
            setError(errorText(reason, tr('unknownError')));
        } finally {
            loadingOlderHistoryRef.current = false;
            setLoadingOlderHistory(false);
        }
    };

    const disconnect = async () => {
        if (device) {
            await api.client.disconnect(device.device_id);
        }
        setDevice(null);
        setSessionId('');
        setCatalog(null);
        setOwner(null);
        setChats([]);
        setTarget(null);
        setSelectedChatTitle('');
        setMessages([]);
        setHasOlderHistory(false);
        setLoadingOlderHistory(false);
        historyCursorRef.current = null;
        historyTargetKeyRef.current = '';
        loadingOlderHistoryRef.current = false;
        setActiveRequestId('');
        setView('devices');
    };

    const send = async () => {
        if (!device || !sessionId || !target || !draft.trim() || activeRequestId) {
            return;
        }
        const requestId = createRequestId();
        const text = draft;
        setDraft('');
        setError('');
        setActiveRequestId(requestId);
        setMessages(current => [
            ...current,
            {
                key: `${requestId}:user`,
                name: 'You',
                isUser: true,
                isSystem: false,
                text,
                sentAt: new Date().toISOString(),
            },
            {
                key: `${requestId}:assistant`,
                name: '',
                isUser: false,
                isSystem: false,
                text: '',
                sentAt: '',
            },
        ]);
        try {
            await api.client.submit(device.device_id, sessionId, {
                requestId,
                target,
                text,
            });
        } catch (reason) {
            setError(errorText(reason, tr('unknownError')));
            setActiveRequestId('');
            await api.client.getHistory(device.device_id, sessionId, target)
                .then(history => {
                    if (historyTargetKeyRef.current !== remoteChatTargetKey(target)) {
                        return;
                    }
                    eventCursorRef.current = history.latestSequence;
                    historyCursorRef.current = history.cursor;
                    setHasOlderHistory(history.hasMoreBefore);
                    setMessages(mapHistoryMessages(history.messages, `${Date.now()}:history`));
                })
                .catch(() => undefined);
        }
    };

    const stopGeneration = async () => {
        if (!device || !sessionId || !activeRequestId) {
            return;
        }
        setBusy(true);
        try {
            await api.client.stopGeneration(device.device_id, sessionId, activeRequestId);
        } catch (reason) {
            setError(errorText(reason, tr('unknownError')));
        } finally {
            setBusy(false);
        }
    };

    const selectedOwnerName = owner?.kind === 'character'
        ? catalog?.characters.find(item => item.characterName === owner.characterName)?.displayName
        : owner?.kind === 'group'
            ? catalog?.groups.find(item => item.groupId === owner.groupId)?.name
            : '';

    return (
        <section className="tt-remote-chat">
            <header className="tt-remote-chat__header">
                <div>
                    <h2>{tr('title')}</h2>
                    {device && <p>{device.device_name}</p>}
                </div>
                {onClose && (
                    <button type="button" className="tt-remote-chat__close" onClick={onClose} aria-label={tr('close')}>
                        ×
                    </button>
                )}
            </header>

            {api.host.available && (
                <nav className="tt-remote-chat__mode">
                    <button type="button" aria-pressed={mode === 'host'} onClick={() => setMode('host')}>
                        {tr('hostMode')}
                    </button>
                    <button type="button" aria-pressed={mode === 'client'} onClick={() => setMode('client')}>
                        {tr('clientMode')}
                    </button>
                </nav>
            )}

            {error && <p className="tt-remote-chat__error" role="alert">{error}</p>}

            {mode === 'host' && api.host.available && (
                <RemoteChatHostView
                    api={api}
                    {...(remoteControlApi ? { remoteControlApi } : {})}
                    tr={tr}
                />
            )}

            {mode === 'client' && (
                <RemoteChatClientView
                    view={view}
                    devices={devices}
                    devicesLoaded={devicesLoaded}
                    busy={busy}
                    catalog={catalog}
                    selectedOwnerName={selectedOwnerName}
                    chats={chats}
                    title={selectedChatTitle}
                    messages={messages}
                    hasOlderHistory={hasOlderHistory}
                    loadingOlderHistory={loadingOlderHistory}
                    draft={draft}
                    active={Boolean(activeRequestId)}
                    onConnect={device => void connect(device)}
                    onDisconnect={() => void disconnect()}
                    onChooseOwner={owner => void chooseOwner(owner)}
                    onChooseChat={chat => void chooseChat(chat)}
                    onBackToOwners={() => setView('owners')}
                    onBackToChats={() => setView('chats')}
                    onDraftChange={setDraft}
                    onSend={() => void send()}
                    onStop={() => void stopGeneration()}
                    onLoadOlder={() => void loadOlderHistory()}
                    tr={tr}
                />
            )}
        </section>
    );
}
