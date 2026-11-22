const LOCAL_REMOTE_SHELL_COMMANDS = new Set([
    'get_window_snapshot',
    'lan_sync_list_devices',
    'lan_sync_request_pairing',
    'remote_chat_client_connect',
    'remote_chat_client_disconnect',
    'remote_chat_client_status',
    'remote_chat_client_list_catalog',
    'remote_chat_client_list_chats',
    'remote_chat_client_get_history',
    'remote_chat_client_submit',
    'remote_chat_client_read_events',
    'remote_chat_client_stop_generation',
    'remote_control_client_connect',
    'remote_control_client_disconnect',
    'remote_control_client_status',
    'remote_control_client_invoke',
    'remote_control_client_get_sillytavern_settings',
]);

function isByteBuffer(value) {
    return value instanceof Uint8Array || value instanceof ArrayBuffer;
}

function bytesArray(value) {
    if (value instanceof Uint8Array) {
        return Array.from(value);
    }
    if (value instanceof ArrayBuffer) {
        return Array.from(new Uint8Array(value));
    }
    throw new Error('Remote settings commit requires a byte buffer');
}

function headerRecord(headers) {
    const normalized = new Headers(headers ?? {});
    return Object.fromEntries(normalized.entries());
}

export function isLocalRemoteShellCommand(command) {
    return LOCAL_REMOTE_SHELL_COMMANDS.has(command);
}

/**
 * Convert the front-end Tauri ABI into the explicit Remote Control operation contract.
 * @param {string} command
 * @param {any} args
 * @param {{ headers?: HeadersInit } | undefined} options
 */
export function toRemoteControlOperation(command, args, options) {
    switch (command) {
        case 'wait_for_backend_ready':
            return { kind: 'wait_for_backend_ready' };
        case 'backend_error_bridge_ready':
            return { kind: 'backend_error_bridge_ready' };
        case 'get_client_version':
            return { kind: 'get_client_version' };
        case 'get_tauritavern_settings':
            return { kind: 'get_tauri_tavern_settings' };
        case 'update_tauritavern_settings':
            return { kind: 'update_tauri_tavern_settings', dto: args?.dto };
        case 'get_personas':
            return { kind: 'get_personas' };
        case 'get_bootstrap_metadata':
            return { kind: 'get_bootstrap_metadata' };
        case 'get_extensions':
            return { kind: 'get_extensions' };
        case 'get_all_characters':
            return { kind: 'get_all_characters', shallow: args?.shallow ?? null };
        case 'get_all_groups':
            return { kind: 'get_all_groups' };
        case 'list_recent_chat_summaries':
            return {
                kind: 'list_recent_chat_summaries',
                characterFilter: args?.character_filter ?? args?.characterFilter ?? null,
                includeMetadata: args?.include_metadata ?? args?.includeMetadata ?? null,
                maxEntries: args?.max_entries ?? args?.maxEntries ?? null,
                pinned: args?.pinned ?? null,
            };
        case 'list_recent_group_chat_summaries':
            return {
                kind: 'list_recent_group_chat_summaries',
                chatIds: args?.chat_ids ?? args?.chatIds ?? null,
                includeMetadata: args?.include_metadata ?? args?.includeMetadata ?? null,
                maxEntries: args?.max_entries ?? args?.maxEntries ?? null,
                pinned: args?.pinned ?? null,
            };
        case 'get_all_backgrounds':
            return { kind: 'get_all_backgrounds' };
        case 'get_all_background_metadata':
            return {
                kind: 'get_all_background_metadata',
                prefix: args?.prefix ?? null,
            };
        case 'get_background_folders':
            return { kind: 'get_background_folders' };
        case 'get_chat_completions_status':
            return { kind: 'get_chat_completions_status' };
        case 'list_active_agent_runs':
            return { kind: 'list_active_agent_runs' };
        case 'read_frontend_template':
            return { kind: 'read_frontend_template', name: args?.name };
        case 'read_frontend_extension_template':
            return {
                kind: 'read_frontend_extension_template',
                extension: args?.extension,
                name: args?.name,
            };
        case 'save_theme':
            return { kind: 'save_theme', dto: args?.dto };
        case 'delete_theme':
            return { kind: 'delete_theme', dto: args?.dto };
        case 'save_quick_reply_set':
            return { kind: 'save_quick_reply_set', payload: args?.payload };
        case 'delete_quick_reply_set':
            return { kind: 'delete_quick_reply_set', payload: args?.payload };
        case 'save_preset':
            return { kind: 'save_preset', dto: args?.dto };
        case 'delete_preset':
            return { kind: 'delete_preset', dto: args?.dto };
        case 'restore_preset':
            return { kind: 'restore_preset', dto: args?.dto };
        case 'read_secret_state':
            return { kind: 'read_secret_state' };
        case 'read_secret_settings':
            return { kind: 'read_secret_settings' };
        case 'write_secret':
            return { kind: 'write_secret', dto: args?.dto };
        case 'delete_secret':
            return { kind: 'delete_secret', dto: args?.dto };
        case 'list_llm_connections':
            return { kind: 'list_llm_connections' };
        case 'load_llm_connection':
            return { kind: 'load_llm_connection', dto: args?.dto };
        case 'save_llm_connection':
            return { kind: 'save_llm_connection', dto: args?.dto };
        case 'delete_llm_connection':
            return { kind: 'delete_llm_connection', dto: args?.dto };
        case 'begin_settings_commit':
            return {
                kind: 'begin_settings_commit',
                expectedRevision: args?.expectedRevision ?? null,
            };
        case 'append_settings_commit_chunk':
            if (!isByteBuffer(args)) {
                throw new Error('Remote settings commit requires a byte buffer');
            }
            return {
                kind: 'append_settings_commit_chunk',
                data: bytesArray(args),
                headers: headerRecord(options?.headers),
            };
        case 'finish_settings_commit':
            return {
                kind: 'finish_settings_commit',
                sessionId: args?.sessionId,
                expectedSize: args?.expectedSize,
            };
        case 'abort_settings_commit':
            return {
                kind: 'abort_settings_commit',
                sessionId: args?.sessionId,
            };
        default:
            throw new Error(`Remote Control does not support this operation yet: ${command}`);
    }
}
