import { listen } from '../../../../tauri-bridge.js';

const REMOTE_CONTROL_COMMAND_EVENT = 'tauritavern-remote-control-command';
const MAX_REMOTE_CONTROL_ERROR_CHARS = 8_192;

function errorText(error) {
    const message = error instanceof Error ? error.message : String(error ?? 'Remote command failed');
    return message.slice(0, MAX_REMOTE_CONTROL_ERROR_CHARS);
}

function requireRecord(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`Remote Control received invalid ${label}`);
    }
    return value;
}

function requireBoolean(value, label) {
    if (typeof value !== 'boolean') {
        throw new Error(`Remote Control received invalid ${label}`);
    }
    return value;
}

function requireString(value, label) {
    if (typeof value !== 'string') {
        throw new Error(`Remote Control received invalid ${label}`);
    }
    return value;
}

function requireNumber(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`Remote Control received invalid ${label}`);
    }
    return value;
}

function requireStringArray(value, label) {
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
        throw new Error(`Remote Control received invalid ${label}`);
    }
    return value;
}

async function getTauriTavernSettingsPage(page, safeInvoke) {
    const raw = requireRecord(await safeInvoke('get_tauritavern_settings'), 'TauriTavern settings');

    switch (page) {
        case 'chat':
            return {
                page,
                chatVirtualizationEnabled: requireBoolean(raw.chat_virtualization_enabled, 'chat virtualization setting'),
                coldSwipesEnabled: requireBoolean(raw.cold_swipes_enabled, 'cold swipes setting'),
                codeMirrorEditorEnabled: requireBoolean(raw.codemirror_editor_enabled, 'CodeMirror editor setting'),
            };
        case 'backups': {
            const backups = requireRecord(raw.chat_backups, 'chat backup settings');
            return {
                page,
                automaticEnabled: requireBoolean(backups.automatic_enabled, 'automatic chat backups setting'),
                zstdCompressionEnabled: requireBoolean(backups.zstd_compression_enabled, 'chat backup compression setting'),
                maxFilesPerPrefix: requireNumber(backups.max_files_per_prefix, 'chat backup per-prefix limit'),
                maxTotalFiles: requireNumber(backups.max_total_files, 'chat backup file limit'),
                maxTotalBytes: requireNumber(backups.max_total_bytes, 'chat backup byte limit'),
            };
        }
        case 'appearance': {
            const theme = requireRecord(raw.dynamic_theme, 'dynamic theme settings');
            return {
                page,
                avatarPersonaOriginalImagesEnabled: requireBoolean(
                    raw.avatar_persona_original_images_enabled,
                    'original avatar image setting',
                ),
                dynamicTheme: {
                    enabled: requireBoolean(theme.enabled, 'dynamic theme enabled setting'),
                    dayTheme: requireString(theme.day_theme, 'day theme'),
                    nightTheme: requireString(theme.night_theme, 'night theme'),
                    wallpaperEnabled: requireBoolean(theme.wallpaper_enabled, 'dynamic wallpaper setting'),
                    dayWallpaper: requireString(theme.day_wallpaper, 'day wallpaper'),
                    nightWallpaper: requireString(theme.night_wallpaper, 'night wallpaper'),
                },
            };
        }
        case 'network': {
            const proxy = requireRecord(raw.request_proxy, 'request proxy settings');
            return {
                page,
                requestProxy: {
                    enabled: requireBoolean(proxy.enabled, 'request proxy enabled setting'),
                    url: requireString(proxy.url, 'request proxy URL'),
                    bypass: requireStringArray(proxy.bypass, 'request proxy bypass list'),
                },
            };
        }
        case 'privacy':
            return {
                page,
                allowKeysExposure: requireBoolean(raw.allow_keys_exposure, 'API key exposure setting'),
            };
        case 'models': {
            const models = requireRecord(raw.models, 'model settings');
            const claude = requireRecord(models.claude, 'Claude model settings');
            return {
                page,
                promptCacheTtl: requireString(claude.prompt_cache_ttl, 'Claude prompt cache TTL'),
            };
        }
        case 'agent': {
            const agent = requireRecord(raw.agent, 'Agent settings');
            const retention = requireRecord(agent.retention, 'Agent retention settings');
            return {
                page,
                retention: {
                    autoPruneEnabled: requireBoolean(retention.auto_prune_enabled, 'Agent auto-prune setting'),
                    keepRecentTerminalRuns: requireNumber(retention.keep_recent_terminal_runs, 'Agent terminal run retention'),
                    keepFullRecentRuns: requireNumber(retention.keep_full_recent_runs, 'Agent full run retention'),
                },
            };
        }
        default:
            throw new Error(`Remote Control does not support this settings page: ${String(page)}`);
    }
}

function requireOnlyKeys(value, allowed, label) {
    const record = requireRecord(value, label);
    const unknown = Object.keys(record).find(key => !allowed.includes(key));
    if (unknown) {
        throw new Error(`Remote Control does not allow ${label} field: ${unknown}`);
    }
    return record;
}

export function validateTauriTavernSettingsPagePatch(page, value) {
    const patch = requireRecord(value, 'TauriTavern settings update');
    switch (page) {
        case 'chat':
            return requireOnlyKeys(patch, [
                'chat_virtualization_enabled',
                'cold_swipes_enabled',
                'codemirror_editor_enabled',
            ], 'chat settings');
        case 'backups': {
            requireOnlyKeys(patch, ['chat_backups'], 'backup settings');
            const backups = requireOnlyKeys(patch.chat_backups, [
                'automatic_enabled',
                'zstd_compression_enabled',
                'max_files_per_prefix',
                'max_total_files',
                'max_total_bytes',
            ], 'chat backup settings');
            return { chat_backups: backups };
        }
        case 'appearance': {
            requireOnlyKeys(patch, ['avatar_persona_original_images_enabled', 'dynamic_theme'], 'appearance settings');
            if (patch.dynamic_theme === undefined) {
                return { avatar_persona_original_images_enabled: patch.avatar_persona_original_images_enabled };
            }
            const dynamicTheme = requireOnlyKeys(patch.dynamic_theme, [
                'enabled',
                'day_theme',
                'night_theme',
                'wallpaper_enabled',
                'day_wallpaper',
                'night_wallpaper',
            ], 'dynamic theme settings');
            return {
                ...(patch.avatar_persona_original_images_enabled === undefined
                    ? {}
                    : { avatar_persona_original_images_enabled: patch.avatar_persona_original_images_enabled }),
                dynamic_theme: dynamicTheme,
            };
        }
        case 'network': {
            requireOnlyKeys(patch, ['request_proxy'], 'network settings');
            const requestProxy = requireOnlyKeys(patch.request_proxy, [
                'enabled',
                'url',
                'bypass',
            ], 'request proxy settings');
            return { request_proxy: requestProxy };
        }
        case 'privacy':
            return requireOnlyKeys(patch, ['allow_keys_exposure'], 'privacy settings');
        case 'models': {
            requireOnlyKeys(patch, ['models'], 'model settings');
            const models = requireOnlyKeys(patch.models, ['claude'], 'model settings');
            const claude = requireOnlyKeys(models.claude, ['prompt_cache_ttl'], 'Claude model settings');
            return { models: { claude } };
        }
        case 'agent': {
            requireOnlyKeys(patch, ['agent'], 'Agent settings');
            const agent = requireOnlyKeys(patch.agent, ['retention'], 'Agent settings');
            const retention = requireOnlyKeys(agent.retention, [
                'auto_prune_enabled',
                'keep_recent_terminal_runs',
                'keep_full_recent_runs',
            ], 'Agent retention settings');
            return { agent: { retention } };
        }
        default:
            throw new Error(`Remote Control does not support this settings page: ${String(page)}`);
    }
}

async function getRemoteExtensions(safeInvoke) {
    const extensions = await safeInvoke('get_extensions');
    if (!Array.isArray(extensions)) {
        throw new Error('Remote Control received an invalid extension list');
    }
    const { findExtension } = await import('../../../../scripts/extensions.js');
    return extensions.map(value => {
        const extension = requireRecord(value, 'extension entry');
        const name = requireString(extension.name, 'extension name');
        const state = findExtension(name);
        return {
            ...extension,
            enabled: state?.enabled ?? null,
        };
    });
}

async function setRemoteExtensionEnabled(operation, safeInvoke) {
    const extensionName = requireString(operation.extensionName, 'extension name');
    const enabled = requireBoolean(operation.enabled, 'extension enabled state');
    const extensions = await safeInvoke('get_extensions');
    if (!Array.isArray(extensions)) {
        throw new Error('Remote Control received an invalid extension list');
    }
    const installed = extensions
        .map(value => requireRecord(value, 'extension entry'))
        .find(extension => extension.name === extensionName);
    if (!installed) {
        throw new Error(`Extension is not installed on the computer: ${extensionName}`);
    }
    if (!['Local', 'Global'].includes(installed.extension_type)) {
        throw new Error('Remote Control can only toggle installed third-party extensions');
    }

    const extensionApi = await import('../../../../scripts/extensions.js');
    const state = extensionApi.findExtension(extensionName);
    if (!state) {
        throw new Error(`Extension state is unavailable on the computer: ${extensionName}`);
    }
    if (state.enabled !== enabled) {
        if (enabled) {
            await extensionApi.enableExtension(state.name, false);
        } else {
            await extensionApi.disableExtension(state.name, false);
        }
    }
    return { enabled, reloadRequired: state.enabled !== enabled };
}

async function requireRemoteThirdPartyExtension(extensionName, safeInvoke) {
    const name = requireString(extensionName, 'extension name');
    const extensions = await safeInvoke('get_extensions');
    if (!Array.isArray(extensions)) {
        throw new Error('Remote Control received an invalid extension list');
    }
    const extension = extensions
        .map(value => requireRecord(value, 'extension entry'))
        .find(candidate => candidate.name === name);
    if (!extension || !['Local', 'Global'].includes(extension.extension_type)) {
        throw new Error(`Remote Control only manages installed third-party extensions: ${name}`);
    }
    return name;
}

async function runRemoteExtensionOperation(operation, operationName, safeInvoke) {
    const name = await requireRemoteThirdPartyExtension(operation.extensionName, safeInvoke);
    const extensionApi = await import('../../../../scripts/extensions.js');
    const run = extensionApi[operationName];
    if (typeof run !== 'function') {
        throw new Error(`Desktop extension management is unavailable: ${operationName}`);
    }
    return run(name);
}

async function invokeOperation(operation, { safeInvoke }) {
    switch (operation?.kind) {
        case 'get_tauri_tavern_settings_page':
            return getTauriTavernSettingsPage(operation.page, safeInvoke);
        case 'update_tauri_tavern_settings_page':
            return safeInvoke('update_tauritavern_settings', {
                dto: validateTauriTavernSettingsPagePatch(operation.page, operation.dto),
            });
        case 'get_silly_tavern_settings_page': {
            const settingsPages = await import('./sillytavern-settings-pages.js');
            return settingsPages.getSillyTavernSettingsPage(operation.page);
        }
        case 'update_silly_tavern_settings_page': {
            const settingsPages = await import('./sillytavern-settings-pages.js');
            return settingsPages.updateSillyTavernSettingsPage(operation.page, operation.dto);
        }
        case 'get_chat_completion_settings': {
            const api = await import('../../../../scripts/openai.js');
            return api.getRemoteChatCompletionSettings(operation.source ?? undefined);
        }
        case 'update_chat_completion_settings': {
            const api = await import('../../../../scripts/openai.js');
            return api.updateRemoteChatCompletionSettings(operation.dto);
        }
        case 'set_chat_completion_api_key': {
            const api = await import('../../../../scripts/openai.js');
            return api.writeRemoteChatCompletionApiKey(
                operation.source,
                operation.value,
                operation.label ?? undefined,
            );
        }
        case 'delete_chat_completion_api_key': {
            const api = await import('../../../../scripts/openai.js');
            return api.deleteRemoteChatCompletionApiKey(operation.source);
        }
        case 'get_extensions':
            return getRemoteExtensions(safeInvoke);
        case 'set_extension_enabled':
            return setRemoteExtensionEnabled(operation, safeInvoke);
        case 'install_extension': {
            const url = requireString(operation.url, 'extension URL');
            const branch = typeof operation.branch === 'string' ? operation.branch : '';
            const extensionApi = await import('../../../../scripts/extensions.js');
            return extensionApi.installExtensionFromRemote(url, branch);
        }
        case 'update_extension':
            return runRemoteExtensionOperation(operation, 'updateExtensionFromRemote', safeInvoke);
        case 'delete_extension':
            return runRemoteExtensionOperation(operation, 'deleteExtensionFromRemote', safeInvoke);
        case 'list_llm_connections':
            return safeInvoke('list_llm_connections');
        case 'load_llm_connection':
            return safeInvoke('load_llm_connection', { dto: operation.dto });
        case 'save_llm_connection':
            return safeInvoke('save_llm_connection', { dto: operation.dto });
        case 'delete_llm_connection':
            return safeInvoke('delete_llm_connection', { dto: operation.dto });
        default:
            throw new Error(
                `Remote Control received an unsupported operation: ${String(operation?.kind ?? 'unknown')}`,
            );
    }
}

/**
 * Runs allowlisted remote operations through the existing desktop invoke service.
 * @param {{
 *   safeInvoke: (command: string, args?: any) => Promise<any>,
 *   getSessionId: () => string | null,
 *   markSessionStarted: (sessionId: string) => void,
 *   markSessionEnded: (sessionId: string) => void,
 * }} options
 */
export async function installRemoteControlDesktopBridge(options) {
    if (!window.__TAURITAVERN__?.api?.remoteControl?.host?.available) {
        return null;
    }

    const unlisten = await listen(REMOTE_CONTROL_COMMAND_EVENT, ({ payload }) => {
        void Promise.resolve().then(async () => {
            if (payload?.kind === 'end_session') {
                options.markSessionEnded(payload.sessionId);
                return;
            }
            if (payload?.kind !== 'invoke') {
                return;
            }
            if (typeof payload.sessionId !== 'string' || typeof payload.requestId !== 'string') {
                return;
            }

            let outcome;
            try {
                let activeSessionId = options.getSessionId();
                if (!activeSessionId) {
                    const status = await options.safeInvoke('remote_control_get_host_status');
                    activeSessionId = status?.sessionId ?? null;
                    if (activeSessionId) {
                        options.markSessionStarted(activeSessionId);
                    }
                }
                if (!activeSessionId || payload.sessionId !== activeSessionId) {
                    throw new Error('Remote Control session is no longer active');
                }

                const result = await invokeOperation(payload.operation, options);
                outcome = {
                    kind: 'success',
                    value: { kind: 'json', value: result === undefined ? null : result },
                };
            } catch (error) {
                outcome = { kind: 'failure', value: errorText(error) };
            }

            await options.safeInvoke('remote_control_publish_result', {
                result: {
                    sessionId: payload.sessionId,
                    requestId: payload.requestId,
                    outcome,
                },
            });
        }).catch(error => {
            console.error('[Remote Control] Desktop command handler failed:', error);
        });
    });

    window.addEventListener('pagehide', () => {
        void unlisten();
    }, { once: true });

    return unlisten;
}
