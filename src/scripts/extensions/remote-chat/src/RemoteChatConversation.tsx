import { useEffect, useRef } from 'react';

import type { RemoteChatMessageKey } from './host';

type Message = TauriTavernRemoteChatMessage & { key: string };
type Translator = (key: RemoteChatMessageKey) => string;

type Props = {
    title: string;
    messages: Message[];
    hasOlderHistory: boolean;
    loadingOlderHistory: boolean;
    draft: string;
    active: boolean;
    busy: boolean;
    onDraftChange: (value: string) => void;
    onBack: () => void;
    onDisconnect: () => void;
    onSend: () => void;
    onStop: () => void;
    onLoadOlder: () => void;
    tr: Translator;
};

export function RemoteChatConversation({
    title,
    messages,
    hasOlderHistory,
    loadingOlderHistory,
    draft,
    active,
    busy,
    onDraftChange,
    onBack,
    onDisconnect,
    onSend,
    onStop,
    onLoadOlder,
    tr,
}: Props) {
    const messagesElement = useRef<HTMLDivElement>(null);
    const lastMessage = messages[messages.length - 1];

    useEffect(() => {
        const element = messagesElement.current;
        if (element) {
            element.scrollTop = element.scrollHeight;
        }
    }, [lastMessage?.key, lastMessage?.text]);

    return (
        <div className="tt-remote-chat__conversation">
            <div className="tt-remote-chat__conversation-header">
                <button type="button" className="tt-remote-chat__back" onClick={onBack}>
                    {tr('back')}
                </button>
                <strong>{title}</strong>
                <button
                    type="button"
                    className="tt-remote-chat__back"
                    disabled={active}
                    onClick={onDisconnect}
                >
                    {tr('disconnect')}
                </button>
            </div>
            {hasOlderHistory && (
                <button
                    type="button"
                    className="tt-remote-chat__load-older"
                    disabled={loadingOlderHistory || active}
                    onClick={onLoadOlder}
                >
                    {loadingOlderHistory ? tr('loading') : tr('loadOlder')}
                </button>
            )}
            <div ref={messagesElement} className="tt-remote-chat__messages" aria-live="polite">
                {messages.map(message => (
                    <article
                        className={`tt-remote-chat__message${message.isUser ? ' is-user' : ''}${message.isSystem ? ' is-system' : ''}`}
                        key={message.key}
                    >
                        {!message.isUser && message.name && <strong>{message.name}</strong>}
                        <p>{message.text}</p>
                    </article>
                ))}
            </div>
            <div className="tt-remote-chat__composer">
                <textarea
                    value={draft}
                    maxLength={16_000}
                    placeholder={tr('messagePlaceholder')}
                    aria-label={tr('messagePlaceholder')}
                    onChange={event => onDraftChange(event.currentTarget.value)}
                    onKeyDown={event => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            onSend();
                        }
                    }}
                />
                {active
                    ? <button type="button" disabled={busy} onClick={onStop}>{tr('stop')}</button>
                    : <button type="button" disabled={!draft.trim() || busy} onClick={onSend}>{tr('send')}</button>}
            </div>
        </div>
    );
}
