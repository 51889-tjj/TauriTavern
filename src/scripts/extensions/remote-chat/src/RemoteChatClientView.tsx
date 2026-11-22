import { RemoteChatConversation } from './RemoteChatConversation';
import type { RemoteChatTranslator } from './host';

export type RemoteChatClientDevice = Awaited<
    ReturnType<TauriTavernRemoteChatApi['client']['listPairedDevices']>
>[number];

export type RemoteChatView = 'devices' | 'owners' | 'chats' | 'conversation';
export type RemoteChatViewMessage = TauriTavernRemoteChatMessage & { key: string };

type Props = {
    view: RemoteChatView;
    devices: RemoteChatClientDevice[];
    devicesLoaded: boolean;
    busy: boolean;
    catalog: TauriTavernRemoteChatCatalog | null;
    selectedOwnerName: string | undefined;
    chats: TauriTavernRemoteChatSummary[];
    title: string;
    messages: RemoteChatViewMessage[];
    hasOlderHistory: boolean;
    loadingOlderHistory: boolean;
    draft: string;
    active: boolean;
    onConnect: (device: RemoteChatClientDevice) => void;
    onDisconnect: () => void;
    onChooseOwner: (owner: TauriTavernRemoteChatOwner) => void;
    onChooseChat: (chat: TauriTavernRemoteChatSummary) => void;
    onBackToOwners: () => void;
    onBackToChats: () => void;
    onDraftChange: (value: string) => void;
    onSend: () => void;
    onStop: () => void;
    onLoadOlder: () => void;
    tr: RemoteChatTranslator;
};

export function RemoteChatClientView({
    view,
    devices,
    devicesLoaded,
    busy,
    catalog,
    selectedOwnerName,
    chats,
    title,
    messages,
    hasOlderHistory,
    loadingOlderHistory,
    draft,
    active,
    onConnect,
    onDisconnect,
    onChooseOwner,
    onChooseChat,
    onBackToOwners,
    onBackToChats,
    onDraftChange,
    onSend,
    onStop,
    onLoadOlder,
    tr,
}: Props) {
    if (view === 'devices') {
        return (
            <div className="tt-remote-chat__list">
                <h3>{tr('chooseDevice')}</h3>
                {devices.length === 0 && devicesLoaded && !busy && <p>{tr('emptyDevices')}</p>}
                {devices.map(device => (
                    <button
                        type="button"
                        className="tt-remote-chat__list-item"
                        key={device.device_id}
                        disabled={busy}
                        onClick={() => onConnect(device)}
                    >
                        <strong>{device.device_name || device.device_id}</strong>
                        <span>{device.platform || device.last_known_address || device.device_id}</span>
                    </button>
                ))}
                {(busy || !devicesLoaded) && <p>{tr('loading')}</p>}
            </div>
        );
    }

    if (view === 'owners' && catalog) {
        return (
            <div className="tt-remote-chat__list">
                <button type="button" className="tt-remote-chat__back" onClick={onDisconnect}>
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
                        onClick={() => onChooseOwner({
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
                        onClick={() => onChooseOwner({ kind: 'group', groupId: group.groupId })}
                    >
                        <strong>{group.name}</strong>
                    </button>
                ))}
                {busy && <p>{tr('loading')}</p>}
            </div>
        );
    }

    if (view === 'chats') {
        return (
            <div className="tt-remote-chat__list">
                <button type="button" className="tt-remote-chat__back" onClick={onBackToOwners}>
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
                        onClick={() => onChooseChat(chat)}
                    >
                        <strong>{chat.title}</strong>
                        <span>{chat.preview}</span>
                    </button>
                ))}
                {busy && <p>{tr('loading')}</p>}
            </div>
        );
    }

    if (view === 'conversation') {
        return (
            <RemoteChatConversation
                title={title}
                messages={messages}
                hasOlderHistory={hasOlderHistory}
                loadingOlderHistory={loadingOlderHistory}
                draft={draft}
                active={active}
                busy={busy}
                onDraftChange={onDraftChange}
                onBack={onBackToChats}
                onDisconnect={onDisconnect}
                onSend={onSend}
                onStop={onStop}
                onLoadOlder={onLoadOlder}
                tr={tr}
            />
        );
    }

    return null;
}
