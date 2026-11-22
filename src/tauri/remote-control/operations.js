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
]);

export function isLocalRemoteShellCommand(command) {
    return LOCAL_REMOTE_SHELL_COMMANDS.has(command);
}

/**
 * Convert only the dedicated mobile UI's operations into the host allowlist.
 * @param {string} command
 * @param {any} args
 */
export function toRemoteControlOperation(command, args) {
    switch (command) {
        case 'remote_control_get_tauritavern_settings_page':
            return {
                kind: 'get_tauri_tavern_settings_page',
                page: args?.page,
            };
        case 'remote_control_update_tauritavern_settings_page':
            return {
                kind: 'update_tauri_tavern_settings_page',
                page: args?.page,
                dto: args?.dto,
            };
        case 'remote_control_get_sillytavern_settings_page':
            return {
                kind: 'get_silly_tavern_settings_page',
                page: args?.page,
            };
        case 'remote_control_update_sillytavern_settings_page':
            return {
                kind: 'update_silly_tavern_settings_page',
                page: args?.page,
                dto: args?.dto,
            };
        case 'remote_control_get_chat_completion_settings':
            return {
                kind: 'get_chat_completion_settings',
                source: args?.source ?? null,
            };
        case 'remote_control_update_chat_completion_settings':
            return {
                kind: 'update_chat_completion_settings',
                dto: args?.dto,
            };
        case 'remote_control_set_chat_completion_api_key':
            return {
                kind: 'set_chat_completion_api_key',
                source: args?.source,
                value: args?.value,
                label: args?.label ?? null,
            };
        case 'remote_control_delete_chat_completion_api_key':
            return {
                kind: 'delete_chat_completion_api_key',
                source: args?.source,
            };
        case 'get_extensions':
            return { kind: 'get_extensions' };
        case 'remote_control_set_extension_enabled':
            return {
                kind: 'set_extension_enabled',
                extensionName: args?.extensionName ?? args?.extension_name,
                enabled: args?.enabled,
            };
        case 'remote_control_install_extension':
            return {
                kind: 'install_extension',
                url: args?.url,
                branch: args?.branch ?? null,
            };
        case 'remote_control_update_extension':
            return {
                kind: 'update_extension',
                extensionName: args?.extensionName ?? args?.extension_name,
            };
        case 'remote_control_delete_extension':
            return {
                kind: 'delete_extension',
                extensionName: args?.extensionName ?? args?.extension_name,
            };
        case 'list_llm_connections':
            return { kind: 'list_llm_connections' };
        case 'load_llm_connection':
            return { kind: 'load_llm_connection', dto: args?.dto };
        case 'save_llm_connection':
            return { kind: 'save_llm_connection', dto: args?.dto };
        case 'delete_llm_connection':
            return { kind: 'delete_llm_connection', dto: args?.dto };
        default:
            throw new Error(`Remote Control does not support this operation yet: ${command}`);
    }
}
