import { useState } from 'react';

import { RemoteChatApp } from '../scripts/extensions/remote-chat/src/RemoteChatApp';
import type { RemoteChatMessageKey } from '../scripts/extensions/remote-chat/src/host';
import type { RemoteControlActions, RemoteControlDevice } from './RemoteControlContract';
import { RemoteExtensionsPanel } from './RemoteExtensionsPanel';
import { RemoteModelsPanel } from './RemoteModelsPanel';
import { RemoteSettingsPanel } from './RemoteSettingsPanel';

type Tab = 'chat' | 'extensions' | 'models' | 'settings';

type Props = {
    device: RemoteControlDevice;
    actions: RemoteControlActions;
};

const TAB_ITEMS: Array<{ id: Tab; icon: string; label: string }> = [
    { id: 'chat', icon: '▤', label: '聊天' },
    { id: 'extensions', icon: '◇', label: '扩展' },
    { id: 'models', icon: '⌘', label: '模型 / API' },
    { id: 'settings', icon: '⚙', label: '设置' },
];

const CHAT_MESSAGES: Record<RemoteChatMessageKey, string> = {
    title: '远程聊天',
    open: '远程聊天',
    hostMode: '本机作为电脑主机',
    clientMode: '连接电脑',
    hostDescription: '已配对设备可以在临时会话期间访问本机角色和聊天。',
    startHost: '开启远程聊天',
    stopHost: '关闭远程聊天',
    hostActive: '远程聊天已开启',
    hostInactive: '远程聊天未开启',
    chooseDevice: '选择此电脑的 Remote Chat 会话',
    connect: '连接',
    disconnect: '断开连接',
    chooseCharacter: '选择角色或群组',
    characters: '角色',
    groups: '群组',
    chooseChat: '选择聊天记录',
    loadOlder: '加载更早的消息',
    back: '返回',
    send: '发送',
    stop: '停止生成',
    messagePlaceholder: '输入消息…',
    emptyChats: '没有找到聊天记录。',
    emptyDevices: '没有已配对设备，请先在局域网同步中将手机与电脑配对。',
    hostNotActive: '请先在电脑上开启 Remote Chat。',
    loading: '正在加载…',
    close: '关闭',
    unknownError: '远程聊天请求失败。',
    controlDescription: '已配对手机可以在临时 Remote Control 会话期间控制这台电脑。',
    controlStartHost: '开启 Remote Control',
    controlStopHost: '关闭 Remote Control',
    controlActive: 'Remote Control 已开启',
    controlInactive: 'Remote Control 未开启',
};

function translateChat(key: RemoteChatMessageKey): string {
    return CHAT_MESSAGES[key];
}

export function RemoteControlApp({ device, actions }: Props) {
    const [tab, setTab] = useState<Tab>('chat');
    const [disconnecting, setDisconnecting] = useState(false);
    const [disconnectError, setDisconnectError] = useState('');

    const disconnect = async () => {
        if (disconnecting || !window.confirm(`断开与“${device.deviceName}”的连接？`)) {
            return;
        }
        setDisconnecting(true);
        setDisconnectError('');
        try {
            await actions.disconnect();
            window.location.reload();
        } catch (error) {
            setDisconnectError(error instanceof Error ? error.message : String(error));
            setDisconnecting(false);
        }
    };

    return (
        <main className="tt-remote-app">
            <header className="tt-remote-app__header">
                <div className="tt-remote-app__brand">
                    <span>TAURITAVERN</span>
                    <h1>{TAB_ITEMS.find(item => item.id === tab)?.label}</h1>
                    <p>已连接 · {device.deviceName}</p>
                    {tab === 'chat' && <small>聊天功能需在电脑单独开启 Remote Chat</small>}
                </div>
                <button
                    type="button"
                    className="tt-remote-app__disconnect"
                    disabled={disconnecting}
                    onClick={() => void disconnect()}
                >
                    {disconnecting ? '断开中…' : '断开'}
                </button>
            </header>

            {disconnectError && <p className="tt-remote-app__error" role="alert">{disconnectError}</p>}

            <section className="tt-remote-app__content">
                {tab === 'chat' && (
                    <RemoteChatApp
                        api={actions.remoteChat}
                        tr={translateChat}
                    />
                )}
                {tab === 'extensions' && <RemoteExtensionsPanel actions={actions} />}
                {tab === 'models' && <RemoteModelsPanel actions={actions} />}
                {tab === 'settings' && <RemoteSettingsPanel actions={actions} />}
            </section>

            <nav className="tt-remote-app__tabs" aria-label="远程控制页面">
                {TAB_ITEMS.map(item => (
                    <button
                        key={item.id}
                        type="button"
                        aria-pressed={tab === item.id}
                        onClick={() => setTab(item.id)}
                    >
                        <span className="tt-remote-app__tab-icon" aria-hidden="true">{item.icon}</span>
                        <span>{item.label}</span>
                    </button>
                ))}
            </nav>
        </main>
    );
}
