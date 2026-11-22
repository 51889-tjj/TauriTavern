import { useEffect, useRef, useState } from 'react';

import { RemoteChatConversation } from './RemoteChatConversation';
import { RemoteControlHostPanel } from './RemoteControlHostPanel';

type RemoteChatApi = TauriTavernRemoteChatApi;
type RemoteChatTarget = TauriTavernRemoteChatTarget;
type RemoteChatOwner = TauriTavernRemoteChatOwner;
type RemoteChatMessage = TauriTavernRemoteChatMessage & { key: string };
type PairedDevice = Awaited<ReturnType<RemoteChatApi['client']['listPairedDevices']>>[number];
type View = 'devices' | 'owners' | 'chats' | 'conversation';
type Mode = 'host' | 'client';
type Translator = (key: import('./host').RemoteChatMessageKey) => string;

type Props = {
    api: RemoteChatApi;
    remoteControlApi?: TauriTavernRemoteControlApi;
    tr: Translator;
    onClose: () => void;
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

export function RemoteChatApp({ api, remoteControlApi, tr, onClose }: Props) {
    const [mode, setMode] = useState<Mode>(api.host.available ? 'host' : 'client');
    const [hostStatus, setHostStatus] = useState<TauriTavernRemoteChatSessionStatus | null>(null);
    const [devices, setDevices] = useState<PairedDevice[]>([]);
    const [devicesLoaded, setDevicesLoaded] = useState(false);
    const [device, setDevice] = useState<PairedDevice | null>(null);
    const [sessionId, setSessionId] = useState('');
    const [catalog, setCatalog] = useState<TauriTavernRemoteChatCatalog | null>(null);
    const [owner, setOwner] = useState<RemoteChatOwner | null>(null);
    const [chats, setChats] = useState<TauriTavernRemoteChatSummary[]>([]);
    const [target, setTarget] = useState<RemoteChatTarget | null>(null);
    const [messages, setMessages] = useState<RemoteChatMessage[]>([]);
    const [view, setView] = useState<View>('devices');
    const [selectedChatTitle, setSelectedChatTitle] = useState('');
    const [draft, setDraft] = useState('');
    const [activeRequestId, setActiveRequestId] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const cursorRef = useRef(0);

    useEffect(() => {
        if (!api.host.available) {
            return;
        }
        let alive = true;
        void api.host.status()
            .then(status => {
                if (alive) {
                    setHostStatus(status);
                }
            })
            .catch(reason => {
                if (alive) {
                    setError(errorText(reason, tr('unknownError')));
                }
            });
        return () => {
            alive = false;
        };
    }, [api, tr]);

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
                cursorRef.current = history.latestSequence;
                setMessages(mapHistoryMessages(history.messages, `${activeRequestId}:saved`));
            }
        };

        const poll = async () => {
            try {
                const page = await api.client.readEvents(
                    device.device_id,
                    sessionId,
                    cursorRef.current,
                );
                if (!alive) {
                    return;
                }

                let terminal = false;
                for (const event of page.events) {
                    cursorRef.current = Math.max(cursorRef.current, event.sequence);
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
                cursorRef.current = Math.max(cursorRef.current, page.nextSequence);

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

    const startHost = async () => {
        setBusy(true);
        setError('');
        try {
            const status = await api.host.startSession();
            setHostStatus(status);
        } catch (reason) {
            setError(errorText(reason, tr('unknownError')));
        } finally {
            setBusy(false);
        }
    };

    const stopHost = async () => {
        setBusy(true);
        setError('');
        try {
            await api.host.stopSession();
            setHostStatus({ active: false });
        } catch (reason) {
            setError(errorText(reason, tr('unknownError')));
        } finally {
            setBusy(false);
        }
    };

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
        setBusy(true);
        setError('');
        try {
            const history = await api.client.getHistory(device.device_id, sessionId, summary.target);
            cursorRef.current = history.latestSequence;
            setTarget(summary.target);
            setSelectedChatTitle(summary.title);
            setMessages(mapHistoryMessages(history.messages, `${history.latestSequence}:history`));
            setView('conversation');
        } catch (reason) {
            setError(errorText(reason, tr('unknownError')));
        } finally {
            setBusy(false);
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
        setActiveRequestId('');
        setView('devices');
    };

    const send = async () => {
        if (!device || !sessionId || !target || !draft.trim() || activeRequestId) {
            return;
        }
        const requestId = crypto.randomUUID();
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
                .then(history => setMessages(mapHistoryMessages(history.messages, `${Date.now()}:history`)))
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
                <button type="button" className="tt-remote-chat__close" onClick={onClose} aria-label={tr('close')}>
                    ×
                </button>
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
                <>
                    <div className="tt-remote-chat__host">
                        <p>{tr('hostDescription')}</p>
                        <p className={hostStatus?.active ? 'tt-remote-chat__status is-active' : 'tt-remote-chat__status'}>
                            {hostStatus?.active ? tr('hostActive') : tr('hostInactive')}
                        </p>
                        {hostStatus?.active
                            ? <button type="button" disabled={busy} onClick={() => void stopHost()}>{tr('stopHost')}</button>
                            : <button type="button" disabled={busy} onClick={() => void startHost()}>{tr('startHost')}</button>}
                    </div>
                    {remoteControlApi?.host.available && (
                        <RemoteControlHostPanel api={remoteControlApi} tr={tr} />
                    )}
                </>
            )}

            {mode === 'client' && view === 'devices' && (
                <div className="tt-remote-chat__list">
                    <h3>{tr('chooseDevice')}</h3>
                    {devices.length === 0 && devicesLoaded && !busy && <p>{tr('emptyDevices')}</p>}
                    {devices.map(item => (
                        <button
                            type="button"
                            className="tt-remote-chat__list-item"
                            key={item.device_id}
                            disabled={busy}
                            onClick={() => void connect(item)}
                        >
                            <strong>{item.device_name || item.device_id}</strong>
                            <span>{item.platform || item.last_known_address || item.device_id}</span>
                        </button>
                    ))}
                    {(busy || !devicesLoaded) && <p>{tr('loading')}</p>}
                </div>
            )}

            {mode === 'client' && view === 'owners' && catalog && (
                <div className="tt-remote-chat__list">
                    <button type="button" className="tt-remote-chat__back" onClick={() => void disconnect()}>
                        {tr('disconnect')}
                    </button>
                    <h3>{tr('chooseCharacter')}</h3>
                    <h4>{tr('characters')}</h4>
                    {catalog.characters.map(character => (
                        <button
                            type="button"
                            className="tt-remote-chat__list-item"
                            key={character.characterName}
                            disabled={busy}
                            onClick={() => void chooseOwner({
                                kind: 'character',
                                characterName: character.characterName,
                            })}
                        >
                            <strong>{character.displayName}</strong>
                        </button>
                    ))}
                    <h4>{tr('groups')}</h4>
                    {catalog.groups.map(group => (
                        <button
                            type="button"
                            className="tt-remote-chat__list-item"
                            key={group.groupId}
                            disabled={busy}
                            onClick={() => void chooseOwner({ kind: 'group', groupId: group.groupId })}
                        >
                            <strong>{group.name}</strong>
                        </button>
                    ))}
                    {busy && <p>{tr('loading')}</p>}
                </div>
            )}

            {mode === 'client' && view === 'chats' && (
                <div className="tt-remote-chat__list">
                    <button type="button" className="tt-remote-chat__back" onClick={() => setView('owners')}>
                        {tr('back')}
                    </button>
                    <h3>{selectedOwnerName}</h3>
                    {chats.length === 0 && !busy && <p>{tr('emptyChats')}</p>}
                    {chats.map((chat, index) => (
                        <button
                            type="button"
                            className="tt-remote-chat__list-item"
                            key={`${chat.title}:${index}`}
                            disabled={busy}
                            onClick={() => void chooseChat(chat)}
                        >
                            <strong>{chat.title}</strong>
                            <span>{chat.preview}</span>
                        </button>
                    ))}
                    {busy && <p>{tr('loading')}</p>}
                </div>
            )}

            {mode === 'client' && view === 'conversation' && (
                <RemoteChatConversation
                    title={selectedChatTitle}
                    messages={messages}
                    draft={draft}
                    active={Boolean(activeRequestId)}
                    busy={busy}
                    onDraftChange={setDraft}
                    onBack={() => setView('chats')}
                    onDisconnect={() => void disconnect()}
                    onSend={() => void send()}
                    onStop={() => void stopGeneration()}
                    tr={tr}
                />
            )}
        </section>
    );
}
