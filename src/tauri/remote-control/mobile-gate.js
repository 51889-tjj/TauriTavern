import { getBarcodeScanner, invoke } from '../../tauri-bridge.js';
import { isMobileHost } from '../../scripts/util/host-identity.js';

const GATE_STYLE = `
    .tt-remote-gate {
        position: fixed;
        z-index: 2147483000;
        inset: 0;
        display: grid;
        place-items: center;
        box-sizing: border-box;
        overflow: auto;
        padding: max(24px, env(safe-area-inset-top)) 20px max(24px, env(safe-area-inset-bottom));
        color: #f5f5f7;
        background: #171719;
        font: 16px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .tt-remote-gate__card {
        box-sizing: border-box;
        width: min(100%, 480px);
        border: 1px solid #38383d;
        border-radius: 20px;
        padding: 24px;
        background: #222225;
        box-shadow: 0 20px 60px #0008;
    }
    .tt-remote-gate h1 { margin: 0 0 8px; font-size: 25px; }
    .tt-remote-gate p { margin: 8px 0; color: #c8c8cf; }
    .tt-remote-gate__brand { color: #a9a2ff; font-size: 13px; font-weight: 700; letter-spacing: .12em; }
    .tt-remote-gate__devices { display: grid; gap: 10px; margin: 20px 0; }
    .tt-remote-gate__device, .tt-remote-gate__button {
        width: 100%;
        min-height: 48px;
        border: 1px solid #55555c;
        border-radius: 12px;
        padding: 10px 14px;
        color: inherit;
        background: #303035;
        font: inherit;
        text-align: left;
    }
    .tt-remote-gate__device { display: grid; gap: 2px; }
    .tt-remote-gate__device small { color: #b6b6c0; }
    .tt-remote-gate__button { text-align: center; }
    .tt-remote-gate__button--primary {
        border-color: #8178fa;
        color: #fff;
        background: #6259d8;
        font-weight: 700;
    }
    .tt-remote-gate__button:disabled { opacity: .55; }
    .tt-remote-gate__pair { display: grid; gap: 10px; margin-top: 12px; }
    .tt-remote-gate textarea {
        box-sizing: border-box;
        width: 100%;
        min-height: 80px;
        border: 1px solid #55555c;
        border-radius: 10px;
        padding: 10px;
        color: inherit;
        background: #171719;
        font: 13px/1.4 ui-monospace, monospace;
    }
    .tt-remote-gate__error { color: #ff9b9b !important; overflow-wrap: anywhere; }
    .tt-remote-gate__hint { font-size: 13px; }
    .tt-remote-connection {
        position: fixed;
        z-index: 2147482000;
        top: max(8px, env(safe-area-inset-top));
        right: 10px;
        max-width: 48vw;
        border: 1px solid #7771;
        border-radius: 999px;
        padding: 6px 11px;
        color: #fff;
        background: #24242be8;
        box-shadow: 0 2px 10px #0006;
        font: 12px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
`;

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) {
        node.className = className;
    }
    if (text !== undefined) {
        node.textContent = text;
    }
    return node;
}

function devicePlatform(device) {
    return String(device.platform || '').toLowerCase();
}

function isDesktop(device) {
    return ['windows', 'macos', 'linux'].includes(devicePlatform(device));
}

function installConnectionIndicator(deviceName, deviceId) {
    const button = element('button', 'tt-remote-connection', `电脑：${deviceName} · 断开`);
    button.type = 'button';
    button.title = '断开远程电脑连接';
    button.addEventListener('click', async () => {
        if (!window.confirm(`断开与“${deviceName}”的连接？`)) {
            return;
        }
        try {
            await invoke('remote_control_client_disconnect', { deviceId });
        } finally {
            delete window.__TAURITAVERN_REMOTE_CONTROL__;
            window.location.reload();
        }
    });
    document.body.append(button);
}

function showGate(onConnect) {
    const style = element('style');
    style.textContent = GATE_STYLE;
    document.head.append(style);

    const root = element('main', 'tt-remote-gate');
    const card = element('section', 'tt-remote-gate__card');
    root.append(card);
    document.body.append(root);

    const showError = message => {
        const previous = card.querySelector('.tt-remote-gate__error');
        previous?.remove();
        if (message) {
            const error = element('p', 'tt-remote-gate__error', message);
            error.setAttribute('role', 'alert');
            card.append(error);
        }
    };

    const render = async () => {
        card.replaceChildren();
        card.append(
            element('div', 'tt-remote-gate__brand', 'TAURITAVERN · REMOTE'),
            element('h1', '', '连接电脑'),
            element('p', '', '连接后显示电脑上的 TauriTavern 界面与配置。设置和操作都由电脑执行并保存，手机不保存第二份角色、聊天或配置数据。'),
        );

        const devices = element('div', 'tt-remote-gate__devices');
        card.append(devices);
        const listButton = element('button', 'tt-remote-gate__button', '刷新已配对电脑');
        listButton.type = 'button';
        listButton.addEventListener('click', () => void loadDevices());
        card.append(listButton);

        const pairButton = element('button', 'tt-remote-gate__button', '配对新电脑');
        pairButton.type = 'button';
        pairButton.addEventListener('click', () => {
            pairForm.hidden = !pairForm.hidden;
        });
        card.append(pairButton);

        const pairForm = element('div', 'tt-remote-gate__pair');
        pairForm.hidden = true;
        const instructions = element('p', 'tt-remote-gate__hint', '先在电脑「设置 → 同步 → 局域网同步」启动服务并显示配对二维码；电脑上需要确认配对请求。连接远程控制时，还要在「扩展菜单 → Remote Chat → 作为主机」中开启 Remote Control。');
        const scanButton = element('button', 'tt-remote-gate__button', '扫描二维码');
        scanButton.type = 'button';
        scanButton.addEventListener('click', () => void scanQrCode());
        const pairUri = element('textarea');
        pairUri.autocapitalize = 'off';
        pairUri.autocorrect = 'off';
        pairUri.placeholder = '也可以粘贴 tauritavern:// 配对链接';
        pairUri.spellcheck = false;
        const pairSubmit = element('button', 'tt-remote-gate__button tt-remote-gate__button--primary', '请求配对');
        pairSubmit.type = 'button';
        pairSubmit.addEventListener('click', () => void requestPairing(pairUri.value, pairSubmit));
        pairForm.append(instructions, scanButton, pairUri, pairSubmit);
        card.append(pairForm);

        async function loadDevices() {
            devices.replaceChildren(element('p', '', '正在读取已配对电脑…'));
            showError('');
            try {
                const paired = await invoke('lan_sync_list_devices');
                if (!Array.isArray(paired)) {
                    throw new Error('电脑返回了无效的配对设备列表');
                }
                const desktops = paired.filter(isDesktop);
                devices.replaceChildren();
                if (desktops.length === 0) {
                    devices.append(element('p', '', '还没有已配对的电脑。'));
                }
                for (const device of desktops) {
                    const connect = element('button', 'tt-remote-gate__device');
                    connect.type = 'button';
                    connect.append(
                        element('strong', '', device.device_name || device.device_id),
                        element('small', '', device.last_known_address || device.platform || device.device_id),
                    );
                    connect.addEventListener('click', () => void connectToComputer(device, connect));
                    devices.append(connect);
                }
            } catch (error) {
                devices.replaceChildren();
                showError(error instanceof Error ? error.message : String(error));
            }
        }

        async function scanQrCode() {
            const scanner = getBarcodeScanner();
            if (!scanner?.requestPermissions || !scanner.scan || !scanner.Format?.QRCode) {
                showError('当前设备无法使用二维码扫描，请粘贴电脑上的配对链接。');
                return;
            }
            showError('');
            try {
                if (!await scanner.requestPermissions()) {
                    throw new Error('需要相机权限才能扫描配对二维码');
                }
                const result = await scanner.scan({ formats: [scanner.Format.QRCode] });
                if (result.content?.trim()) {
                    pairUri.value = result.content.trim();
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                if (!message.toLowerCase().includes('cancel')) {
                    showError(message);
                }
            }
        }

        async function requestPairing(uri, button) {
            if (!uri.trim() || button.disabled) {
                showError('请先扫描二维码或粘贴配对链接。');
                return;
            }
            button.disabled = true;
            button.textContent = '等待电脑确认…';
            showError('');
            try {
                await invoke('lan_sync_request_pairing', { pairUri: uri.trim() });
                pairUri.value = '';
                pairForm.hidden = true;
                await loadDevices();
            } catch (error) {
                showError(error instanceof Error ? error.message : String(error));
            } finally {
                button.disabled = false;
                button.textContent = '请求配对';
            }
        }

        await loadDevices();
    };

    async function connectToComputer(device, button) {
        button.disabled = true;
        showError('');
        try {
            const status = await invoke(
                'remote_control_client_connect',
                { deviceId: device.device_id },
            );
            if (!status?.active || typeof status.sessionId !== 'string' || !status.sessionId) {
                throw new Error('请先在电脑「扩展菜单 → Remote Chat → 作为主机」中开启 Remote Control。');
            }
            Object.defineProperty(window, '__TAURITAVERN_REMOTE_CONTROL__', {
                configurable: true,
                value: Object.freeze({
                    deviceId: device.device_id,
                    sessionId: status.sessionId,
                }),
            });
            root.remove();
            installConnectionIndicator(device.device_name || device.device_id, device.device_id);
            onConnect();
        } catch (error) {
            showError(error instanceof Error ? error.message : String(error));
            button.disabled = false;
        }
    }

    void render().catch(error => {
        showError(error instanceof Error ? error.message : String(error));
    });
}

export function waitForRemoteShellConnection() {
    if (window.__TAURITAVERN_REMOTE_SHELL__ !== true) {
        return Promise.resolve();
    }
    if (!isMobileHost()) {
        return Promise.reject(new Error('Remote Control shell requires a mobile host identity'));
    }

    return new Promise(resolve => showGate(resolve));
}
