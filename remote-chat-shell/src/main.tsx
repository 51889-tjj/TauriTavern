import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { RemoteChatApp } from '../../src/scripts/extensions/remote-chat/src/RemoteChatApp';
import type { RemoteChatMessageKey } from '../../src/scripts/extensions/remote-chat/src/host';
import '../../src/scripts/extensions/remote-chat/style.css';
import './style.css';

type ShellWindow = Window & {
    __TAURI__?: {
        core?: {
            invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
        };
        barcodeScanner?: {
            Format?: { QRCode?: string };
            requestPermissions?: () => Promise<boolean>;
            scan?: (options: { formats: string[] }) => Promise<{ content?: string }>;
        };
    };
};

type PairedDevice = {
    device_id: string;
    device_name: string;
    platform?: string | null;
    last_known_address?: string | null;
};

function hasDesktopDevice(devices: PairedDevice[]): boolean {
    return devices.some(device => (
        ['windows', 'macos', 'linux'].includes(String(device.platform || '').toLowerCase())
    ));
}

const shellWindow = window as ShellWindow;

const shellMessages: Record<RemoteChatMessageKey, string> = {
    title: '远程聊天',
    open: '远程聊天',
    hostMode: '作为主机',
    clientMode: '连接电脑',
    hostDescription: '聊天由电脑上的 TauriTavern 提供。',
    startHost: '启动远程聊天',
    stopHost: '停止远程聊天',
    hostActive: '远程聊天已启动',
    hostInactive: '远程聊天未启动',
    chooseDevice: '选择电脑',
    connect: '连接',
    disconnect: '断开连接',
    chooseCharacter: '选择角色或群组',
    characters: '角色',
    groups: '群组',
    chooseChat: '选择聊天',
    back: '返回',
    send: '发送',
    stop: '停止生成',
    messagePlaceholder: '输入消息…',
    emptyChats: '没有找到聊天记录。',
    emptyDevices: '没有已配对的电脑。点击右上角按钮进行配对。',
    hostNotActive: '请先在电脑端启动 Remote Chat 会话。',
    loading: '加载中…',
    close: '配对电脑',
    unknownError: '远程聊天请求失败。',
};

function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    const invokeCommand = shellWindow.__TAURI__?.core?.invoke as
        ((name: string, args?: Record<string, unknown>) => Promise<unknown>) | undefined;
    if (!invokeCommand) {
        return Promise.reject(new Error('The native Remote Chat bridge is unavailable.'));
    }
    return invokeCommand(command, args) as Promise<T>;
}

const remoteChatApi: TauriTavernRemoteChatApi = {
    host: {
        available: false,
        status: async () => ({ active: false }),
        startSession: async () => ({ active: false }),
        stopSession: async () => undefined,
    },
    client: {
        listPairedDevices: () => invoke<PairedDevice[]>('lan_sync_list_devices'),
        connect: deviceId => invoke('remote_chat_client_connect', { deviceId }),
        disconnect: deviceId => invoke('remote_chat_client_disconnect', { deviceId }),
        status: deviceId => invoke('remote_chat_client_status', { deviceId }),
        listCatalog: (deviceId, sessionId) => invoke(
            'remote_chat_client_list_catalog',
            { deviceId, sessionId },
        ),
        listChats: (deviceId, sessionId, owner) => invoke(
            'remote_chat_client_list_chats',
            { deviceId, sessionId, owner },
        ),
        getHistory: (deviceId, sessionId, target) => invoke(
            'remote_chat_client_get_history',
            { deviceId, sessionId, target },
        ),
        submit: (deviceId, sessionId, request) => invoke(
            'remote_chat_client_submit',
            { deviceId, sessionId, request },
        ),
        readEvents: (deviceId, sessionId, afterSequence) => invoke(
            'remote_chat_client_read_events',
            { deviceId, sessionId, afterSequence },
        ),
        stopGeneration: (deviceId, sessionId, requestId) => invoke(
            'remote_chat_client_stop_generation',
            { deviceId, sessionId, requestId },
        ),
    },
};

function PairComputer({ onPaired, onContinue }: {
    onPaired: () => void;
    onContinue: () => void;
}) {
    const [pairUri, setPairUri] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [hasPairedDevice, setHasPairedDevice] = useState(false);

    useEffect(() => {
        void invoke<PairedDevice[]>('lan_sync_list_devices')
            .then(devices => setHasPairedDevice(hasDesktopDevice(devices)))
            .catch(reason => setError(String(reason)));
    }, []);

    const scanQrCode = async () => {
        const scanner = shellWindow.__TAURI__?.barcodeScanner;
        if (!scanner?.requestPermissions || !scanner.scan || !scanner.Format?.QRCode) {
            setError('The QR scanner is unavailable.');
            return;
        }
        setError('');
        try {
            if (!await scanner.requestPermissions()) {
                throw new Error('Camera permission is required to scan the pairing code.');
            }
            const result = await scanner.scan({ formats: [scanner.Format.QRCode] });
            if (result.content?.trim()) {
                setPairUri(result.content.trim());
            }
        } catch (reason) {
            const message = String(reason);
            if (!message.toLowerCase().includes('cancel')) {
                setError(message);
            }
        }
    };

    const pair = async () => {
        if (!pairUri.trim() || busy) {
            return;
        }
        setBusy(true);
        setError('');
        try {
            await invoke('lan_sync_request_pairing', { pairUri: pairUri.trim() });
            onPaired();
        } catch (reason) {
            setError(String(reason));
        } finally {
            setBusy(false);
        }
    };

    return (
        <main className="shell-pair">
            <div className="shell-brand" aria-hidden="true">TT</div>
            <h1>连接电脑</h1>
            <p className="shell-pair__description">
                手机只显示和输入聊天内容。角色、聊天记录、模型与生成都由电脑上的 TauriTavern 提供。
            </p>
            <ol className="shell-pair__steps">
                <li>先在电脑端启动局域网同步服务，再到「设置 → 同步 → 局域网同步」打开配对二维码。</li>
                <li>扫描二维码，并在电脑上确认配对请求。</li>
            </ol>
            <button
                className="shell-primary shell-pair__scan"
                type="button"
                disabled={busy}
                onClick={() => void scanQrCode()}
            >
                扫描电脑二维码
            </button>
            <label className="shell-pair__label" htmlFor="pair-uri">或粘贴配对链接</label>
            <textarea
                id="pair-uri"
                autoCapitalize="off"
                autoCorrect="off"
                value={pairUri}
                onChange={event => setPairUri(event.currentTarget.value)}
                placeholder="tauritavern://lan-sync/pair?..."
                spellCheck={false}
            />
            {error && <p className="shell-error" role="alert">{error}</p>}
            <button
                className="shell-primary"
                type="button"
                disabled={!pairUri.trim() || busy}
                onClick={() => void pair()}
            >
                {busy ? '等待电脑确认…' : '请求配对'}
            </button>
            {hasPairedDevice && (
                <button className="shell-secondary" type="button" onClick={onContinue}>
                    返回聊天
                </button>
            )}
        </main>
    );
}

function App() {
    const [showPairing, setShowPairing] = useState<boolean | null>(null);

    useEffect(() => {
        void invoke<PairedDevice[]>('lan_sync_list_devices')
            .then(devices => setShowPairing(!hasDesktopDevice(devices)))
            .catch(() => setShowPairing(true));
    }, []);

    if (showPairing === null) {
        return <main className="shell-loading">正在读取配对状态…</main>;
    }

    return (
        <div className="shell-app">
            {showPairing
                ? (
                    <PairComputer
                        onPaired={() => setShowPairing(false)}
                        onContinue={() => setShowPairing(false)}
                    />
                )
                : (
                    <RemoteChatApp
                        api={remoteChatApi}
                        tr={key => shellMessages[key]}
                        onClose={() => setShowPairing(true)}
                    />
                )}
        </div>
    );
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
