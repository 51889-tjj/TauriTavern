import { listen } from '../../../../tauri-bridge.js';

const REMOTE_CONTROL_COMMAND_EVENT = 'tauritavern-remote-control-command';
const MAX_REMOTE_CONTROL_ERROR_CHARS = 8_192;

function errorText(error) {
    const message = error instanceof Error ? error.message : String(error ?? 'Remote command failed');
    return message.slice(0, MAX_REMOTE_CONTROL_ERROR_CHARS);
}

function bytesFrom(value) {
    if (value instanceof Uint8Array) {
        return value;
    }
    if (value instanceof ArrayBuffer) {
        return new Uint8Array(value);
    }
    throw new Error('Desktop returned an invalid settings byte response');
}

function base64From(value) {
    const bytes = bytesFrom(value);
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
}

async function invokeOperation(operation, { safeInvoke, invokeTransport }) {
    switch (operation?.kind) {
        case 'wait_for_backend_ready':
            return safeInvoke('wait_for_backend_ready');
        case 'backend_error_bridge_ready':
            return safeInvoke('backend_error_bridge_ready');
        case 'get_client_version':
            return safeInvoke('get_client_version');
        case 'get_tauri_tavern_settings':
            return safeInvoke('get_tauritavern_settings');
        case 'update_tauri_tavern_settings':
            return safeInvoke('update_tauritavern_settings', { dto: operation.dto });
        case 'get_sillytavern_settings':
            return {
                kind: 'bytes_base64',
                value: base64From(await safeInvoke('get_sillytavern_settings')),
            };
        case 'get_personas':
            return safeInvoke('get_personas');
        case 'get_bootstrap_metadata':
            return safeInvoke('get_bootstrap_metadata');
        case 'get_extensions':
            return safeInvoke('get_extensions');
        case 'get_all_backgrounds':
            return safeInvoke('get_all_backgrounds');
        case 'get_all_background_metadata':
            return safeInvoke('get_all_background_metadata', { prefix: operation.prefix });
        case 'get_background_folders':
            return safeInvoke('get_background_folders');
        case 'get_chat_completions_status':
            return safeInvoke('get_chat_completions_status');
        case 'list_active_agent_runs':
            return safeInvoke('list_active_agent_runs');
        case 'read_frontend_template':
            return safeInvoke('read_frontend_template', { name: operation.name });
        case 'read_frontend_extension_template':
            return safeInvoke('read_frontend_extension_template', {
                extension: operation.extension,
                name: operation.name,
            });
        case 'save_theme':
            return safeInvoke('save_theme', { dto: operation.dto });
        case 'delete_theme':
            return safeInvoke('delete_theme', { dto: operation.dto });
        case 'save_quick_reply_set':
            return safeInvoke('save_quick_reply_set', { payload: operation.payload });
        case 'delete_quick_reply_set':
            return safeInvoke('delete_quick_reply_set', { payload: operation.payload });
        case 'save_preset':
            return safeInvoke('save_preset', { dto: operation.dto });
        case 'delete_preset':
            return safeInvoke('delete_preset', { dto: operation.dto });
        case 'restore_preset':
            return safeInvoke('restore_preset', { dto: operation.dto });
        case 'read_secret_state':
            return safeInvoke('read_secret_state');
        case 'read_secret_settings':
            return safeInvoke('read_secret_settings');
        case 'write_secret':
            return safeInvoke('write_secret', { dto: operation.dto });
        case 'delete_secret':
            return safeInvoke('delete_secret', { dto: operation.dto });
        case 'list_llm_connections':
            return safeInvoke('list_llm_connections');
        case 'load_llm_connection':
            return safeInvoke('load_llm_connection', { dto: operation.dto });
        case 'save_llm_connection':
            return safeInvoke('save_llm_connection', { dto: operation.dto });
        case 'delete_llm_connection':
            return safeInvoke('delete_llm_connection', { dto: operation.dto });
        case 'begin_settings_commit':
            return invokeTransport('begin_settings_commit', {
                expectedRevision: operation.expectedRevision ?? null,
            });
        case 'append_settings_commit_chunk':
            return invokeTransport(
                'append_settings_commit_chunk',
                Uint8Array.from(operation.data ?? []),
                { headers: operation.headers ?? {} },
            );
        case 'finish_settings_commit':
            return invokeTransport('finish_settings_commit', {
                sessionId: operation.sessionId,
                expectedSize: operation.expectedSize,
            });
        case 'abort_settings_commit':
            return invokeTransport('abort_settings_commit', {
                sessionId: operation.sessionId,
            });
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
 *   invokeTransport: (command: string, args?: any, options?: any) => Promise<any>,
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
                outcome = result?.kind === 'bytes_base64' && typeof result.value === 'string'
                    ? { kind: 'success', value: result }
                    : {
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
