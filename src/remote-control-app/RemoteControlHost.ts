import { invoke } from '../tauri-bridge.js';

import type {
    RemoteChatCompletionSettings,
    RemoteControlActions,
    RemoteControlDevice,
    RemoteExtension,
    RemoteSettingsPage,
    RemoteSettingsPageData,
} from './RemoteControlContract';

function requireRecord(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`电脑返回了无效的${label}`);
    }
    return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
    if (typeof value !== 'string') {
        throw new Error(`电脑返回了无效的${label}`);
    }
    return value;
}

function requireBoolean(value: unknown, label: string): boolean {
    if (typeof value !== 'boolean') {
        throw new Error(`电脑返回了无效的${label}`);
    }
    return value;
}

function requireFiniteNumber(value: unknown, label: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`电脑返回了无效的${label}`);
    }
    return value;
}

function requireStringArray(value: unknown, label: string): string[] {
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
        throw new Error(`电脑返回了无效的${label}`);
    }
    return value;
}

function parseExtension(value: unknown): RemoteExtension {
    const extension = requireRecord(value, '扩展信息');
    const extensionType = extension.extension_type;
    if (extensionType !== 'System' && extensionType !== 'Local' && extensionType !== 'Global') {
        throw new Error(`电脑返回了未知的扩展类型：${String(extensionType)}`);
    }
    const enabled = extension.enabled;
    if (enabled !== null && enabled !== undefined && typeof enabled !== 'boolean') {
        throw new Error(`电脑返回了无效的扩展状态：${String(extension.name)}`);
    }

    return {
        name: requireString(extension.name, '扩展名称'),
        extensionType,
        enabled: typeof enabled === 'boolean' ? enabled : null,
    };
}

function parseChatCompletionSettings(value: unknown): RemoteChatCompletionSettings {
    const settings = requireRecord(value, '模型设置');
    if (!Array.isArray(settings.sources)) {
        throw new Error('电脑返回了无效的模型服务商列表');
    }

    const sources = settings.sources.map(item => {
        const source = requireRecord(item, '模型服务商');
        return {
            value: requireString(source.value, '模型服务商标识'),
            label: requireString(source.label, '模型服务商名称'),
        };
    });

    return {
        source: requireString(settings.source, '当前模型服务商'),
        sources,
        customApiFormat: requireString(settings.customApiFormat, '自定义 API 格式'),
        customApiFormats: requireStringArray(settings.customApiFormats, '自定义 API 格式列表'),
        model: requireString(settings.model, '模型名称'),
        supportsCustomModels: requireBoolean(settings.supportsCustomModels, '自定义模型能力'),
        customUrl: requireString(settings.customUrl, '自定义 API 地址'),
        reverseProxy: requireString(settings.reverseProxy, '反向代理地址'),
        apiKeySupported: requireBoolean(settings.apiKeySupported, 'API Key 能力'),
        apiKeyConfigured: requireBoolean(settings.apiKeyConfigured, 'API Key 状态'),
        credentialLabel: requireString(settings.credentialLabel, 'API 凭据名称'),
        chatCompletionActive: requireBoolean(settings.chatCompletionActive, 'Chat Completion 状态'),
    };
}

function parseSettingsPage(page: RemoteSettingsPage, value: unknown): RemoteSettingsPageData {
    const result = requireRecord(value, '设置页面');
    if (result.page !== page) {
        throw new Error(`电脑返回了错误的设置页面：${String(result.page)}`);
    }

    switch (page) {
        case 'chat':
            return {
                page,
                chatVirtualizationEnabled: requireBoolean(result.chatVirtualizationEnabled, '聊天虚拟化设置'),
                coldSwipesEnabled: requireBoolean(result.coldSwipesEnabled, '冷 Swipe 设置'),
                codeMirrorEditorEnabled: requireBoolean(result.codeMirrorEditorEnabled, 'CodeMirror 设置'),
            };
        case 'backups':
            return {
                page,
                automaticEnabled: requireBoolean(result.automaticEnabled, '自动聊天备份设置'),
                zstdCompressionEnabled: requireBoolean(result.zstdCompressionEnabled, '聊天备份压缩设置'),
                maxFilesPerPrefix: requireFiniteNumber(result.maxFilesPerPrefix, '每个前缀的备份数量'),
                maxTotalFiles: requireFiniteNumber(result.maxTotalFiles, '备份文件数量上限'),
                maxTotalBytes: requireFiniteNumber(result.maxTotalBytes, '备份总空间上限'),
            };
        case 'appearance': {
            const dynamicTheme = requireRecord(result.dynamicTheme, '动态主题设置');
            return {
                page,
                avatarPersonaOriginalImagesEnabled: requireBoolean(
                    result.avatarPersonaOriginalImagesEnabled,
                    '头像原图设置',
                ),
                dynamicTheme: {
                    enabled: requireBoolean(dynamicTheme.enabled, '动态主题开关'),
                    dayTheme: requireString(dynamicTheme.dayTheme, '日间主题'),
                    nightTheme: requireString(dynamicTheme.nightTheme, '夜间主题'),
                    wallpaperEnabled: requireBoolean(dynamicTheme.wallpaperEnabled, '动态壁纸开关'),
                    dayWallpaper: requireString(dynamicTheme.dayWallpaper, '日间壁纸'),
                    nightWallpaper: requireString(dynamicTheme.nightWallpaper, '夜间壁纸'),
                },
            };
        }
        case 'network': {
            const requestProxy = requireRecord(result.requestProxy, '网络代理设置');
            return {
                page,
                requestProxy: {
                    enabled: requireBoolean(requestProxy.enabled, '网络代理开关'),
                    url: requireString(requestProxy.url, '网络代理地址'),
                    bypass: requireStringArray(requestProxy.bypass, '代理绕过列表'),
                },
            };
        }
        case 'privacy':
            return {
                page,
                allowKeysExposure: requireBoolean(result.allowKeysExposure, '密钥展示设置'),
            };
        case 'models': {
            const promptCacheTtl = requireString(result.promptCacheTtl, 'Claude 提示缓存时间');
            if (promptCacheTtl !== 'off' && promptCacheTtl !== '5m' && promptCacheTtl !== '1h') {
                throw new Error(`电脑返回了未知的 Claude 提示缓存时间：${promptCacheTtl}`);
            }
            return { page, promptCacheTtl };
        }
        case 'agent': {
            const retention = requireRecord(result.retention, 'Agent 历史保留设置');
            return {
                page,
                retention: {
                    autoPruneEnabled: requireBoolean(retention.autoPruneEnabled, 'Agent 自动清理设置'),
                    keepRecentTerminalRuns: requireFiniteNumber(
                        retention.keepRecentTerminalRuns,
                        'Agent 终态运行保留数量',
                    ),
                    keepFullRecentRuns: requireFiniteNumber(
                        retention.keepFullRecentRuns,
                        'Agent 完整历史保留数量',
                    ),
                },
            };
        }
        case 'generation': {
            if (!Array.isArray(result.mainApiOptions)) {
                throw new Error('电脑返回了无效的主 API 选项');
            }
            return {
                page,
                responseLength: requireFiniteNumber(result.responseLength, '回复长度'),
                contextLength: requireFiniteNumber(result.contextLength, '上下文长度'),
                swipesEnabled: requireBoolean(result.swipesEnabled, 'Swipe 设置'),
                mainApi: requireString(result.mainApi, '当前主 API'),
                mainApiOptions: result.mainApiOptions.map(value => {
                    const option = requireRecord(value, '主 API 选项');
                    return {
                        value: requireString(option.value, '主 API 标识'),
                        label: requireString(option.label, '主 API 名称'),
                    };
                }),
            };
        }
        case 'interface':
            return {
                page,
                timestampsEnabled: requireBoolean(result.timestampsEnabled, '时间戳显示设置'),
                messageTokenCountEnabled: requireBoolean(result.messageTokenCountEnabled, '消息 Token 数设置'),
                hideChatAvatarsEnabled: requireBoolean(result.hideChatAvatarsEnabled, '聊天头像设置'),
                reducedMotionEnabled: requireBoolean(result.reducedMotionEnabled, '减少动画设置'),
                compactInputAreaEnabled: requireBoolean(result.compactInputAreaEnabled, '紧凑输入区设置'),
            };
    }
}

function settingsPatch(data: RemoteSettingsPageData): Record<string, unknown> {
    switch (data.page) {
        case 'chat':
            return {
                chat_virtualization_enabled: data.chatVirtualizationEnabled,
                cold_swipes_enabled: data.coldSwipesEnabled,
                codemirror_editor_enabled: data.codeMirrorEditorEnabled,
            };
        case 'backups':
            return {
                chat_backups: {
                    automatic_enabled: data.automaticEnabled,
                    zstd_compression_enabled: data.zstdCompressionEnabled,
                    max_files_per_prefix: data.maxFilesPerPrefix,
                    max_total_files: data.maxTotalFiles,
                    max_total_bytes: data.maxTotalBytes,
                },
            };
        case 'appearance':
            return {
                avatar_persona_original_images_enabled: data.avatarPersonaOriginalImagesEnabled,
                dynamic_theme: {
                    enabled: data.dynamicTheme.enabled,
                    day_theme: data.dynamicTheme.dayTheme,
                    night_theme: data.dynamicTheme.nightTheme,
                    wallpaper_enabled: data.dynamicTheme.wallpaperEnabled,
                    day_wallpaper: data.dynamicTheme.dayWallpaper,
                    night_wallpaper: data.dynamicTheme.nightWallpaper,
                },
            };
        case 'network':
            return {
                request_proxy: {
                    enabled: data.requestProxy.enabled,
                    url: data.requestProxy.url,
                    bypass: data.requestProxy.bypass,
                },
            };
        case 'privacy':
            return { allow_keys_exposure: data.allowKeysExposure };
        case 'models':
            return { models: { claude: { prompt_cache_ttl: data.promptCacheTtl } } };
        case 'agent':
            return {
                agent: {
                    retention: {
                        auto_prune_enabled: data.retention.autoPruneEnabled,
                        keep_recent_terminal_runs: data.retention.keepRecentTerminalRuns,
                        keep_full_recent_runs: data.retention.keepFullRecentRuns,
                    },
                },
            };
        case 'generation':
            return {
                responseLength: data.responseLength,
                contextLength: data.contextLength,
                swipesEnabled: data.swipesEnabled,
                mainApi: data.mainApi,
            };
        case 'interface':
            return {
                timestampsEnabled: data.timestampsEnabled,
                messageTokenCountEnabled: data.messageTokenCountEnabled,
                hideChatAvatarsEnabled: data.hideChatAvatarsEnabled,
                reducedMotionEnabled: data.reducedMotionEnabled,
                compactInputAreaEnabled: data.compactInputAreaEnabled,
            };
    }
}

function createRemoteChatApi(device: RemoteControlDevice): TauriTavernRemoteChatApi {
    const unavailableHostOperation = async (): Promise<never> => {
        throw new Error('手机 Remote Control 壳不能作为 Remote Chat 主机');
    };

    return {
        host: {
            available: false,
            status: unavailableHostOperation,
            startSession: unavailableHostOperation,
            stopSession: unavailableHostOperation,
        },
        client: {
            listPairedDevices: async () => [{
                device_id: device.deviceId,
                device_name: device.deviceName,
                platform: device.platform,
            }],
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
            getHistory: (deviceId, sessionId, target, beforeCursor) => invoke(
                'remote_chat_client_get_history',
                { deviceId, sessionId, target, beforeCursor: beforeCursor ?? null },
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
}

function parseLlmConnection(value: unknown): TauriTavernLlmConnectionDefinition {
    const connection = requireRecord(value, '模型连接');
    requireString(connection.id, '模型连接 ID');
    requireString(connection.displayName, '模型连接名称');
    requireRecord(connection.provider, '模型连接服务商');
    requireRecord(connection.auth, '模型连接认证设置');
    if (connection.kind !== 'tauritavern.llmConnection') {
        throw new Error('电脑返回了不支持的模型连接格式');
    }
    return value as TauriTavernLlmConnectionDefinition;
}

export function createRemoteControlActions(device: RemoteControlDevice): RemoteControlActions {
    const remoteChat = createRemoteChatApi(device);

    return {
        remoteChat,
        async listExtensions() {
            const result: unknown = await invoke('get_extensions');
            if (!Array.isArray(result)) {
                throw new Error('电脑返回了无效的扩展列表');
            }
            return result.map(parseExtension);
        },
        async setExtensionEnabled(extensionName, enabled) {
            const result = requireRecord(await invoke(
                'remote_control_set_extension_enabled',
                { extensionName, enabled },
            ), '扩展操作结果');
            return {
                enabled: requireBoolean(result.enabled, '扩展启用状态'),
                reloadRequired: requireBoolean(result.reloadRequired, '扩展重载状态'),
            };
        },
        async installExtension(url, branch) {
            const result = requireRecord(await invoke(
                'remote_control_install_extension',
                { url, branch },
            ), '扩展安装结果');
            return {
                installed: requireBoolean(result.installed, '扩展安装状态'),
                reloadRequired: requireBoolean(result.reloadRequired, '扩展重载状态'),
            };
        },
        async updateExtension(extensionName) {
            const result = requireRecord(await invoke(
                'remote_control_update_extension',
                { extensionName },
            ), '扩展更新结果');
            return {
                isUpToDate: requireBoolean(result.isUpToDate, '扩展版本状态'),
                shortCommitHash: requireString(result.shortCommitHash, '扩展版本号'),
                reloadRequired: requireBoolean(result.reloadRequired, '扩展重载状态'),
            };
        },
        async deleteExtension(extensionName) {
            const result = requireRecord(await invoke(
                'remote_control_delete_extension',
                { extensionName },
            ), '扩展删除结果');
            return {
                deleted: requireBoolean(result.deleted, '扩展删除状态'),
                reloadRequired: requireBoolean(result.reloadRequired, '扩展重载状态'),
            };
        },
        async getChatCompletionSettings(source) {
            return parseChatCompletionSettings(await invoke(
                'remote_control_get_chat_completion_settings',
                source ? { source } : undefined,
            ));
        },
        async updateChatCompletionSettings(settings) {
            return parseChatCompletionSettings(await invoke(
                'remote_control_update_chat_completion_settings',
                { dto: settings },
            ));
        },
        writeChatCompletionApiKey(source, value, label) {
            return invoke('remote_control_set_chat_completion_api_key', {
                source,
                value,
                label,
            });
        },
        deleteChatCompletionApiKey(source) {
            return invoke('remote_control_delete_chat_completion_api_key', { source });
        },
        async listLlmConnections() {
            const result = requireRecord(await invoke('list_llm_connections'), '模型连接列表');
            if (!Array.isArray(result.connections)) {
                throw new Error('电脑返回了无效的模型连接列表');
            }
            const connections = result.connections.map(value => {
                const connection = requireRecord(value, '模型连接摘要');
                const source = requireString(connection.chatCompletionSource, '模型连接服务商');
                return {
                    id: requireString(connection.id, '模型连接 ID'),
                    displayName: requireString(connection.displayName, '模型连接名称'),
                    chatCompletionSource: source,
                    ...(typeof connection.description === 'string'
                        ? { description: connection.description }
                        : {}),
                    ...(typeof connection.customApiFormat === 'string'
                        ? { customApiFormat: connection.customApiFormat }
                        : {}),
                };
            });
            return { connections };
        },
        async loadLlmConnection(connectionId) {
            const result = requireRecord(await invoke(
                'load_llm_connection',
                { dto: { connectionId } },
            ), '模型连接详情');
            return result.connection == null ? null : parseLlmConnection(result.connection);
        },
        saveLlmConnection(connection) {
            return invoke('save_llm_connection', { dto: { connection } });
        },
        deleteLlmConnection(connectionId) {
            return invoke('delete_llm_connection', { dto: { connectionId } });
        },
        async getSettingsPage(page) {
            const result: unknown = await invoke(
                page === 'generation' || page === 'interface'
                    ? 'remote_control_get_sillytavern_settings_page'
                    : 'remote_control_get_tauritavern_settings_page',
                { page },
            );
            return parseSettingsPage(page, result);
        },
        updateSettingsPage(data) {
            const command = data.page === 'generation' || data.page === 'interface'
                ? 'remote_control_update_sillytavern_settings_page'
                : 'remote_control_update_tauritavern_settings_page';
            return invoke(command, { page: data.page, dto: settingsPatch(data) });
        },
        disconnect() {
            return invoke('remote_control_client_disconnect', { deviceId: device.deviceId });
        },
    };
}
