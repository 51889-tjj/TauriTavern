// Core Tauri bridge for frontend modules.

import { isLocalRemoteShellCommand, toRemoteControlOperation } from './tauri/remote-control/operations.js';

function getTauri() {
    if (typeof window === 'undefined') {
        return null;
    }

    return window.__TAURI__ || null;
}

function isPlainObject(value) {
    if (Object.prototype.toString.call(value) !== '[object Object]') {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === null || prototype === Object.prototype;
}

function withTauriArgumentAliases(args) {
    if (!isPlainObject(args)) {
        return args;
    }

    const aliased = { ...args };
    for (const [key, value] of Object.entries(args)) {
        if (!key.includes('_')) {
            continue;
        }

        const camelCaseKey = key.replace(/_+([a-zA-Z0-9])/g, (_, char) => char.toUpperCase());
        if (!Object.prototype.hasOwnProperty.call(aliased, camelCaseKey)) {
            aliased[camelCaseKey] = value;
        }
    }

    return aliased;
}

export const invoke = (...args) => {
    const remote = typeof window === 'undefined' ? null : window.__TAURITAVERN_REMOTE_CONTROL__;
    const [command, commandArgs, options] = args;
    if (
        remote
        && typeof command === 'string'
        && !isLocalRemoteShellCommand(command)
    ) {
        if (!remote.deviceId || !remote.sessionId) {
            throw new Error('Remote Control is not connected to a computer');
        }
        const fn = getTauri()?.core?.invoke;
        if (typeof fn !== 'function') {
            throw new Error('Tauri invoke is unavailable');
        }
        const normalizedArgs = args.length >= 2 && isPlainObject(commandArgs)
            ? withTauriArgumentAliases(commandArgs)
            : commandArgs;
        if (command === 'get_sillytavern_settings') {
            return fn('remote_control_client_get_sillytavern_settings', {
                deviceId: remote.deviceId,
                sessionId: remote.sessionId,
            });
        }
        if (command === 'open_chat_payload_json') {
            return fn('remote_control_client_get_chat_payload', {
                deviceId: remote.deviceId,
                sessionId: remote.sessionId,
                target: normalizedArgs?.target,
                allowNotFound: Boolean(normalizedArgs?.allowNotFound),
            });
        }
        const operation = toRemoteControlOperation(command, normalizedArgs, options);
        return fn('remote_control_client_invoke', {
            deviceId: remote.deviceId,
            sessionId: remote.sessionId,
            requestId: crypto.randomUUID(),
            operation,
        }).then(value => {
            if (value?.kind === 'json') {
                return value.value;
            }
            throw new Error('Remote Control returned an invalid response');
        });
    }

    const fn = getTauri()?.core?.invoke;
    if (typeof fn !== 'function') {
        throw new Error('Tauri invoke is unavailable');
    }

    if (args.length === 2 && isPlainObject(args[1])) {
        return fn(args[0], withTauriArgumentAliases(args[1]));
    }

    return fn(...args);
};

function getHostSafeInvoke() {
    if (typeof window === 'undefined') {
        return null;
    }

    const fn = window.__TAURITAVERN__?.invoke?.safeInvoke;
    return typeof fn === 'function' ? fn : null;
}

async function invokeWithHostNormalization(command, args) {
    const safeInvoke = getHostSafeInvoke();
    if (safeInvoke) {
        return safeInvoke(command, args);
    }

    return args === undefined ? invoke(command) : invoke(command, args);
}

export const listen = (...args) => {
    const fn = getTauri()?.event?.listen;
    if (typeof fn !== 'function') {
        throw new Error('Tauri listen is unavailable');
    }
    return fn(...args);
};

export function createChannel(onmessage) {
    const Channel = getTauri()?.core?.Channel;
    if (typeof Channel !== 'function') {
        throw new Error('Tauri Channel is unavailable');
    }

    return new Channel(onmessage);
}

export function getCurrentWindow() {
    const getCurrentWindow = getTauri()?.window?.getCurrentWindow;
    if (typeof getCurrentWindow !== 'function') {
        throw new Error('Tauri window API is unavailable');
    }
    return getCurrentWindow();
}

// Optional plugin: absence is a valid state, not an error.
export function getBarcodeScanner() {
    return getTauri()?.barcodeScanner;
}

export const convertFileSrc = (path, protocol = 'asset') => {
    const fn = getTauri()?.core?.convertFileSrc;
    if (typeof fn !== 'function') {
        throw new Error('Tauri convertFileSrc is unavailable');
    }
    return fn(path, protocol);
};

export async function getClientVersion() {
    return invoke('get_client_version');
}

export async function checkForUpdate(channel) {
    return invokeWithHostNormalization('check_for_update', { channel });
}

export async function getTauriTavernSettings() {
    return invoke('get_tauritavern_settings');
}

export async function getChatBackupStorageStats() {
    return invoke('get_chat_backup_storage_stats');
}

export async function updateTauriTavernSettings(dto) {
    if (!isPlainObject(dto)) {
        throw new Error('Invalid TauriTavern settings DTO');
    }

    return invokeWithHostNormalization('update_tauritavern_settings', { dto });
}

export async function getRuntimePaths() {
    return invoke('get_runtime_paths');
}

export async function setDataRoot(dataRoot) {
    if (typeof dataRoot !== 'string' || dataRoot.trim() === '') {
        throw new Error('Invalid data root path');
    }
    return invokeWithHostNormalization('set_data_root', { data_root: dataRoot });
}

export async function openDialog(options = {}) {
    if (!isPlainObject(options)) {
        throw new Error('Invalid dialog options: expected an object');
    }

    Object.freeze(options);

    return invokeWithHostNormalization('plugin:dialog|open', { options });
}

export function writeClipboardText(text) {
    return invoke('plugin:clipboard-manager|write_text', { text });
}

function normalizeExternalUrl(url) {
    const value = String(url instanceof URL ? url.href : url ?? '').trim();
    if (!value) {
        throw new Error('External URL is required');
    }

    try {
        return new URL(value, window.location.href).toString();
    } catch {
        throw new Error(`Invalid external URL: ${value}`);
    }
}

export async function openExternalUrl(url, openWith) {
    const href = normalizeExternalUrl(url);
    return invoke('plugin:opener|open_url', {
        url: href,
        with: openWith,
    });
}
