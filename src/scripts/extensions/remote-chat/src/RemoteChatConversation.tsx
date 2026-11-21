import type { RemoteChatMessageKey } from './host';

type Message = TauriTavernRemoteChatMessage & { key: string };
type Translator = (key: RemoteChatMessageKey) => string;

type Props = {
    title: string;
    messages: Message[];
    draft: string;
    active: boolean;
    busy: boolean;
    onDraftChange: (value: string) => void;
    onBack: () => void;
    onDisconnect: () => void;
    onSend: () => void;
    onStop: () => void;
    tr: Translator;
};

export function RemoteChatConversation({
    title,
    messages,
    draft,
    active,
    busy,
    onDraftChange,
    onBack,
    onDisconnect,
    onSend,
    onStop,
    tr,
}: Props) {
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
            <div className="tt-remote-chat__messages" aria-live="polite">
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
