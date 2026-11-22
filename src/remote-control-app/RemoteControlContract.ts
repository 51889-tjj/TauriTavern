export type RemoteControlDevice = {
    deviceId: string;
    deviceName: string;
    platform: string;
};

export type RemoteExtension = {
    name: string;
    extensionType: 'System' | 'Local' | 'Global';
    enabled: boolean | null;
};

export type RemoteSettingsPage =
    | 'chat'
    | 'backups'
    | 'appearance'
    | 'network'
    | 'privacy'
    | 'models'
    | 'agent'
    | 'generation'
    | 'interface';

export type RemoteSettingsPageData =
    | {
        page: 'chat';
        chatVirtualizationEnabled: boolean;
        coldSwipesEnabled: boolean;
        codeMirrorEditorEnabled: boolean;
    }
    | {
        page: 'backups';
        automaticEnabled: boolean;
        zstdCompressionEnabled: boolean;
        maxFilesPerPrefix: number;
        maxTotalFiles: number;
        maxTotalBytes: number;
    }
    | {
        page: 'appearance';
        avatarPersonaOriginalImagesEnabled: boolean;
        dynamicTheme: {
            enabled: boolean;
            dayTheme: string;
            nightTheme: string;
            wallpaperEnabled: boolean;
            dayWallpaper: string;
            nightWallpaper: string;
        };
    }
    | {
        page: 'network';
        requestProxy: {
            enabled: boolean;
            url: string;
            bypass: string[];
        };
    }
    | {
        page: 'privacy';
        allowKeysExposure: boolean;
    }
    | {
        page: 'models';
        promptCacheTtl: 'off' | '5m' | '1h';
    }
    | {
        page: 'agent';
        retention: {
            autoPruneEnabled: boolean;
            keepRecentTerminalRuns: number;
            keepFullRecentRuns: number;
        };
    }
    | {
        page: 'generation';
        responseLength: number;
        contextLength: number;
        swipesEnabled: boolean;
        mainApi: string;
        mainApiOptions: Array<{ value: string; label: string }>;
    }
    | {
        page: 'interface';
        timestampsEnabled: boolean;
        messageTokenCountEnabled: boolean;
        hideChatAvatarsEnabled: boolean;
        reducedMotionEnabled: boolean;
        compactInputAreaEnabled: boolean;
    };

export type RemoteChatCompletionSettings = {
    source: string;
    sources: Array<{ value: string; label: string }>;
    customApiFormat: string;
    customApiFormats: string[];
    model: string;
    supportsCustomModels: boolean;
    customUrl: string;
    reverseProxy: string;
    apiKeySupported: boolean;
    apiKeyConfigured: boolean;
    credentialLabel: string;
    chatCompletionActive: boolean;
};

export type RemoteControlActions = {
    remoteChat: TauriTavernRemoteChatApi;
    listExtensions: () => Promise<RemoteExtension[]>;
    setExtensionEnabled: (
        extensionName: string,
        enabled: boolean,
    ) => Promise<{ enabled: boolean; reloadRequired: boolean }>;
    installExtension: (
        url: string,
        branch?: string,
    ) => Promise<{ installed: boolean; reloadRequired: boolean }>;
    updateExtension: (
        extensionName: string,
    ) => Promise<{ isUpToDate: boolean; shortCommitHash: string; reloadRequired: boolean }>;
    deleteExtension: (
        extensionName: string,
    ) => Promise<{ deleted: boolean; reloadRequired: boolean }>;
    getChatCompletionSettings: (source?: string) => Promise<RemoteChatCompletionSettings>;
    updateChatCompletionSettings: (settings: {
        source: string;
        customApiFormat: string;
        model?: string;
        customUrl: string;
        reverseProxy: string;
    }) => Promise<RemoteChatCompletionSettings>;
    writeChatCompletionApiKey: (
        source: string,
        value: string,
        label?: string,
    ) => Promise<void>;
    deleteChatCompletionApiKey: (source: string) => Promise<void>;
    listLlmConnections: () => Promise<{ connections: TauriTavernLlmConnectionSummary[] }>;
    loadLlmConnection: (connectionId: string) => Promise<TauriTavernLlmConnectionDefinition | null>;
    saveLlmConnection: (connection: TauriTavernLlmConnectionDefinition) => Promise<void>;
    deleteLlmConnection: (connectionId: string) => Promise<void>;
    getSettingsPage: (page: RemoteSettingsPage) => Promise<RemoteSettingsPageData>;
    updateSettingsPage: (data: RemoteSettingsPageData) => Promise<void>;
    disconnect: () => Promise<void>;
};
