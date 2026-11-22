import { useCallback, useEffect, useState } from 'react';

import type {
    RemoteControlActions,
    RemoteSettingsPage,
    RemoteSettingsPageData,
} from './RemoteControlContract';

type Props = {
    actions: RemoteControlActions;
};

const SETTINGS_PAGES: Array<{ id: RemoteSettingsPage; label: string }> = [
    { id: 'generation', label: '生成' },
    { id: 'interface', label: '界面' },
    { id: 'chat', label: '聊天' },
    { id: 'backups', label: '备份' },
    { id: 'appearance', label: '外观' },
    { id: 'network', label: '网络' },
    { id: 'models', label: '模型' },
    { id: 'agent', label: 'Agent' },
    { id: 'privacy', label: '隐私' },
];

function ToggleRow({
    label,
    description,
    checked,
    disabled,
    onChange,
}: {
    label: string;
    description?: string;
    checked: boolean;
    disabled: boolean;
    onChange: (value: boolean) => void;
}) {
    return (
        <label className="tt-toggle-row">
            <span>
                <strong>{label}</strong>
                {description && <small>{description}</small>}
            </span>
            <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={event => onChange(event.currentTarget.checked)}
            />
        </label>
    );
}

function NumberField({
    label,
    value,
    disabled,
    min = 0,
    max,
    onChange,
}: {
    label: string;
    value: number;
    disabled: boolean;
    min?: number;
    max?: number;
    onChange: (value: number) => void;
}) {
    return (
        <label className="tt-field">
            <span>{label}</span>
            <input
                type="number"
                inputMode="numeric"
                min={min}
                max={max}
                step={1}
                value={String(value)}
                disabled={disabled}
                onChange={event => {
                    const parsed = Number(event.currentTarget.value);
                    if (event.currentTarget.value !== '' && Number.isInteger(parsed)) {
                        onChange(parsed);
                    }
                }}
            />
        </label>
    );
}

function updateChat(
    data: RemoteSettingsPageData,
    patch: Partial<Extract<RemoteSettingsPageData, { page: 'chat' }>>,
): RemoteSettingsPageData {
    return data.page === 'chat' ? { ...data, ...patch } : data;
}

function updateBackups(
    data: RemoteSettingsPageData,
    patch: Partial<Extract<RemoteSettingsPageData, { page: 'backups' }>>,
): RemoteSettingsPageData {
    return data.page === 'backups' ? { ...data, ...patch } : data;
}

function updateAppearance(
    data: RemoteSettingsPageData,
    update: (current: Extract<RemoteSettingsPageData, { page: 'appearance' }>) => Extract<RemoteSettingsPageData, { page: 'appearance' }>,
): RemoteSettingsPageData {
    return data.page === 'appearance' ? update(data) : data;
}

function updateNetwork(
    data: RemoteSettingsPageData,
    update: (current: Extract<RemoteSettingsPageData, { page: 'network' }>) => Extract<RemoteSettingsPageData, { page: 'network' }>,
): RemoteSettingsPageData {
    return data.page === 'network' ? update(data) : data;
}

function updatePrivacy(
    data: RemoteSettingsPageData,
    patch: Partial<Extract<RemoteSettingsPageData, { page: 'privacy' }>>,
): RemoteSettingsPageData {
    return data.page === 'privacy' ? { ...data, ...patch } : data;
}

function updateModels(
    data: RemoteSettingsPageData,
    patch: Partial<Extract<RemoteSettingsPageData, { page: 'models' }>>,
): RemoteSettingsPageData {
    return data.page === 'models' ? { ...data, ...patch } : data;
}

function updateAgent(
    data: RemoteSettingsPageData,
    update: (current: Extract<RemoteSettingsPageData, { page: 'agent' }>) => Extract<RemoteSettingsPageData, { page: 'agent' }>,
): RemoteSettingsPageData {
    return data.page === 'agent' ? update(data) : data;
}

export function RemoteSettingsPanel({ actions }: Props) {
    const [page, setPage] = useState<RemoteSettingsPage>('chat');
    const [data, setData] = useState<RemoteSettingsPageData | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const load = useCallback(async (target: RemoteSettingsPage = page) => {
        setLoading(true);
        setError('');
        setNotice('');
        try {
            setData(await actions.getSettingsPage(target));
            return true;
        } catch (reason) {
            setData(null);
            setError(reason instanceof Error ? reason.message : String(reason));
            return false;
        } finally {
            setLoading(false);
        }
    }, [actions, page]);

    useEffect(() => {
        void load(page);
    }, [load, page]);

    const save = async () => {
        if (!data || saving) {
            return;
        }
        if (data.page === 'backups'
            && [data.maxFilesPerPrefix, data.maxTotalFiles, data.maxTotalBytes].some(value => value < 0)) {
            setError('备份限制不能小于 0。');
            return;
        }
        if (data.page === 'agent') {
            if (data.retention.keepRecentTerminalRuns < 0 || data.retention.keepRecentTerminalRuns > 10_000) {
                setError('Agent 终态运行保留数量需在 0 到 10,000 之间。');
                return;
            }
            if (
                data.retention.keepFullRecentRuns < 0
                || data.retention.keepFullRecentRuns > data.retention.keepRecentTerminalRuns
            ) {
                setError('Agent 完整历史保留数量不能大于终态运行保留数量。');
                return;
            }
        }
        if (data.page === 'generation') {
            if (!Number.isInteger(data.responseLength) || data.responseLength < 1) {
                setError('回复长度必须是正整数。');
                return;
            }
            if (!Number.isInteger(data.contextLength) || data.contextLength < 1) {
                setError('上下文长度必须是正整数。');
                return;
            }
        }

        setSaving(true);
        setError('');
        setNotice('');
        try {
            await actions.updateSettingsPage(data);
            if (await load(data.page)) {
                setNotice('设置已保存到电脑。');
            }
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setSaving(false);
        }
    };

    const updateDraft = (update: (current: RemoteSettingsPageData) => RemoteSettingsPageData) => {
        setData(current => current ? update(current) : current);
    };

    return (
        <section className="tt-remote-page">
            <div className="tt-remote-page__heading">
                <div>
                    <p className="tt-remote-page__eyebrow">按需读取当前设置页</p>
                    <h2>设置</h2>
                </div>
                <button type="button" className="tt-button tt-button--quiet" disabled={loading} onClick={() => void load(page)}>
                    刷新
                </button>
            </div>
            <p className="tt-remote-page__description">
                手机只请求当前分类所需字段；完整 SillyTavern 设置不会加载或发送到手机，电脑端使用原有控件与保存流程。
            </p>
            <div className="tt-settings-nav" role="tablist" aria-label="设置类别">
                {SETTINGS_PAGES.map(item => (
                    <button
                        key={item.id}
                        type="button"
                        role="tab"
                        aria-selected={page === item.id}
                        onClick={() => setPage(item.id)}
                    >
                        {item.label}
                    </button>
                ))}
            </div>

            {error && <p className="tt-message tt-message--error" role="alert">{error}</p>}
            {notice && <p className="tt-message" role="status">{notice}</p>}
            {loading && <p className="tt-empty">正在从电脑读取此分类…</p>}
            {!loading && data && (
                <div className="tt-settings-editor">
                    {data.page === 'chat' && (
                        <section className="tt-card tt-form-card">
                            <ToggleRow
                                label="聊天 DOM 虚拟化"
                                description="仅在电脑端影响聊天消息的渲染方式。"
                                checked={data.chatVirtualizationEnabled}
                                disabled={saving}
                                onChange={value => updateDraft(current => updateChat(current, { chatVirtualizationEnabled: value }))}
                            />
                            <ToggleRow
                                label="冷 Swipe"
                                checked={data.coldSwipesEnabled}
                                disabled={saving}
                                onChange={value => updateDraft(current => updateChat(current, { coldSwipesEnabled: value }))}
                            />
                            <ToggleRow
                                label="CodeMirror 编辑器"
                                checked={data.codeMirrorEditorEnabled}
                                disabled={saving}
                                onChange={value => updateDraft(current => updateChat(current, { codeMirrorEditorEnabled: value }))}
                            />
                        </section>
                    )}

                    {data.page === 'backups' && (
                        <section className="tt-card tt-form-card">
                            <ToggleRow
                                label="自动聊天备份"
                                checked={data.automaticEnabled}
                                disabled={saving}
                                onChange={value => updateDraft(current => updateBackups(current, { automaticEnabled: value }))}
                            />
                            <ToggleRow
                                label="Zstandard 压缩"
                                checked={data.zstdCompressionEnabled}
                                disabled={saving}
                                onChange={value => updateDraft(current => updateBackups(current, { zstdCompressionEnabled: value }))}
                            />
                            <NumberField
                                label="每个前缀保留文件数"
                                value={data.maxFilesPerPrefix}
                                disabled={saving}
                                onChange={value => updateDraft(current => updateBackups(current, { maxFilesPerPrefix: value }))}
                            />
                            <NumberField
                                label="备份文件总数上限"
                                value={data.maxTotalFiles}
                                disabled={saving}
                                onChange={value => updateDraft(current => updateBackups(current, { maxTotalFiles: value }))}
                            />
                            <NumberField
                                label="备份总空间上限（字节）"
                                value={data.maxTotalBytes}
                                disabled={saving}
                                onChange={value => updateDraft(current => updateBackups(current, { maxTotalBytes: value }))}
                            />
                            <p className="tt-field-hint">将上限设为 0 表示不限制。数据只保存在电脑。</p>
                        </section>
                    )}

                    {data.page === 'appearance' && (
                        <section className="tt-card tt-form-card">
                            <ToggleRow
                                label="启用动态主题"
                                checked={data.dynamicTheme.enabled}
                                disabled={saving}
                                onChange={value => updateDraft(current => updateAppearance(current, current => ({
                                    ...current,
                                    dynamicTheme: { ...current.dynamicTheme, enabled: value },
                                })))}
                            />
                            <label className="tt-field">
                                <span>日间主题</span>
                                <input
                                    value={data.dynamicTheme.dayTheme}
                                    disabled={saving}
                                    onChange={event => {
                                        const value = event.currentTarget.value;
                                        updateDraft(current => updateAppearance(current, current => ({
                                            ...current,
                                            dynamicTheme: { ...current.dynamicTheme, dayTheme: value },
                                        })));
                                    }}
                                />
                            </label>
                            <label className="tt-field">
                                <span>夜间主题</span>
                                <input
                                    value={data.dynamicTheme.nightTheme}
                                    disabled={saving}
                                    onChange={event => {
                                        const value = event.currentTarget.value;
                                        updateDraft(current => updateAppearance(current, current => ({
                                            ...current,
                                            dynamicTheme: { ...current.dynamicTheme, nightTheme: value },
                                        })));
                                    }}
                                />
                            </label>
                            <ToggleRow
                                label="启用动态壁纸"
                                checked={data.dynamicTheme.wallpaperEnabled}
                                disabled={saving}
                                onChange={value => updateDraft(current => updateAppearance(current, current => ({
                                    ...current,
                                    dynamicTheme: { ...current.dynamicTheme, wallpaperEnabled: value },
                                })))}
                            />
                            <label className="tt-field">
                                <span>日间壁纸名称</span>
                                <input
                                    value={data.dynamicTheme.dayWallpaper}
                                    disabled={saving}
                                    onChange={event => {
                                        const value = event.currentTarget.value;
                                        updateDraft(current => updateAppearance(current, current => ({
                                            ...current,
                                            dynamicTheme: { ...current.dynamicTheme, dayWallpaper: value },
                                        })));
                                    }}
                                />
                            </label>
                            <label className="tt-field">
                                <span>夜间壁纸名称</span>
                                <input
                                    value={data.dynamicTheme.nightWallpaper}
                                    disabled={saving}
                                    onChange={event => {
                                        const value = event.currentTarget.value;
                                        updateDraft(current => updateAppearance(current, current => ({
                                            ...current,
                                            dynamicTheme: { ...current.dynamicTheme, nightWallpaper: value },
                                        })));
                                    }}
                                />
                            </label>
                            <ToggleRow
                                label="使用头像 / Persona 原图"
                                checked={data.avatarPersonaOriginalImagesEnabled}
                                disabled={saving}
                                onChange={value => updateDraft(current => updateAppearance(current, current => ({
                                    ...current,
                                    avatarPersonaOriginalImagesEnabled: value,
                                })))}
                            />
                        </section>
                    )}

                    {data.page === 'network' && (
                        <section className="tt-card tt-form-card">
                            <ToggleRow
                                label="启用请求代理"
                                checked={data.requestProxy.enabled}
                                disabled={saving}
                                onChange={value => updateDraft(current => updateNetwork(current, current => ({
                                    ...current,
                                    requestProxy: { ...current.requestProxy, enabled: value },
                                })))}
                            />
                            <label className="tt-field">
                                <span>代理地址</span>
                                <input
                                    value={data.requestProxy.url}
                                    inputMode="url"
                                    autoCapitalize="off"
                                    autoCorrect="off"
                                    disabled={saving}
                                    onChange={event => {
                                        const value = event.currentTarget.value;
                                        updateDraft(current => updateNetwork(current, current => ({
                                            ...current,
                                            requestProxy: { ...current.requestProxy, url: value },
                                        })));
                                    }}
                                />
                            </label>
                            <label className="tt-field">
                                <span>绕过代理的主机 / 网段（每行一项）</span>
                                <textarea
                                    value={data.requestProxy.bypass.join('\n')}
                                    rows={6}
                                    autoCapitalize="off"
                                    autoCorrect="off"
                                    disabled={saving}
                                    onChange={event => {
                                        const bypass = event.currentTarget.value
                                            .split(/\r?\n/u)
                                            .map(value => value.trim())
                                            .filter(Boolean);
                                        updateDraft(current => updateNetwork(current, current => ({
                                            ...current,
                                            requestProxy: { ...current.requestProxy, bypass },
                                        })));
                                    }}
                                />
                            </label>
                        </section>
                    )}

                    {data.page === 'privacy' && (
                        <section className="tt-card tt-form-card">
                            <ToggleRow
                                label="允许在电脑界面展示 API Key"
                                description="开启会增加电脑 WebView 中密钥被页面代码读取的风险。"
                                checked={data.allowKeysExposure}
                                disabled={saving}
                                onChange={value => updateDraft(current => updatePrivacy(current, { allowKeysExposure: value }))}
                            />
                        </section>
                    )}

                    {data.page === 'models' && (
                        <section className="tt-card tt-form-card">
                            <label className="tt-field">
                                <span>Claude Prompt Caching 时长</span>
                                <select
                                    value={data.promptCacheTtl}
                                    disabled={saving}
                                    onChange={event => {
                                        const value = event.currentTarget.value;
                                        if (value === 'off' || value === '5m' || value === '1h') {
                                            updateDraft(current => updateModels(current, { promptCacheTtl: value }));
                                        }
                                    }}
                                >
                                    <option value="off">关闭</option>
                                    <option value="5m">5 分钟</option>
                                    <option value="1h">1 小时</option>
                                </select>
                            </label>
                        </section>
                    )}

                    {data.page === 'agent' && (
                        <section className="tt-card tt-form-card">
                            <ToggleRow
                                label="自动清理已完成的运行"
                                checked={data.retention.autoPruneEnabled}
                                disabled={saving}
                                onChange={value => updateDraft(current => updateAgent(current, current => ({
                                    ...current,
                                    retention: { ...current.retention, autoPruneEnabled: value },
                                })))}
                            />
                            <NumberField
                                label="保留的终态运行数量"
                                value={data.retention.keepRecentTerminalRuns}
                                max={10_000}
                                disabled={saving}
                                onChange={value => updateDraft(current => updateAgent(current, current => ({
                                    ...current,
                                    retention: { ...current.retention, keepRecentTerminalRuns: value },
                                })))}
                            />
                            <NumberField
                                label="保留完整历史的运行数量"
                                value={data.retention.keepFullRecentRuns}
                                max={data.retention.keepRecentTerminalRuns}
                                disabled={saving}
                                onChange={value => updateDraft(current => updateAgent(current, current => ({
                                    ...current,
                                    retention: { ...current.retention, keepFullRecentRuns: value },
                                })))}
                            />
                        </section>
                    )}

                    {data.page === 'generation' && (
                        <section className="tt-card tt-form-card">
                            <NumberField
                                label="回复长度（Token）"
                                value={data.responseLength}
                                min={1}
                                max={99_999}
                                disabled={saving}
                                onChange={value => updateDraft(current => (
                                    current.page === 'generation'
                                        ? { ...current, responseLength: value }
                                        : current
                                ))}
                            />
                            <NumberField
                                label="上下文长度（Token）"
                                value={data.contextLength}
                                min={1}
                                max={512 * 1024}
                                disabled={saving}
                                onChange={value => updateDraft(current => (
                                    current.page === 'generation'
                                        ? { ...current, contextLength: value }
                                        : current
                                ))}
                            />
                            <ToggleRow
                                label="允许 Swipe"
                                description="控制电脑聊天中是否显示消息 Swipe 操作。"
                                checked={data.swipesEnabled}
                                disabled={saving}
                                onChange={value => updateDraft(current => (
                                    current.page === 'generation'
                                        ? { ...current, swipesEnabled: value }
                                        : current
                                ))}
                            />
                            <label className="tt-field">
                                <span>主 API</span>
                                <select
                                    value={data.mainApi}
                                    disabled={saving}
                                    onChange={event => {
                                        const mainApi = event.currentTarget.value;
                                        updateDraft(current => current.page === 'generation'
                                            ? { ...current, mainApi }
                                            : current);
                                    }}
                                >
                                    {data.mainApiOptions.map(option => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </label>
                        </section>
                    )}

                    {data.page === 'interface' && (
                        <section className="tt-card tt-form-card">
                            <ToggleRow
                                label="显示时间戳"
                                checked={data.timestampsEnabled}
                                disabled={saving}
                                onChange={value => updateDraft(current => current.page === 'interface'
                                    ? { ...current, timestampsEnabled: value }
                                    : current)}
                            />
                            <ToggleRow
                                label="显示消息 Token 数"
                                checked={data.messageTokenCountEnabled}
                                disabled={saving}
                                onChange={value => updateDraft(current => current.page === 'interface'
                                    ? { ...current, messageTokenCountEnabled: value }
                                    : current)}
                            />
                            <ToggleRow
                                label="隐藏聊天头像"
                                checked={data.hideChatAvatarsEnabled}
                                disabled={saving}
                                onChange={value => updateDraft(current => current.page === 'interface'
                                    ? { ...current, hideChatAvatarsEnabled: value }
                                    : current)}
                            />
                            <ToggleRow
                                label="减少动画"
                                checked={data.reducedMotionEnabled}
                                disabled={saving}
                                onChange={value => updateDraft(current => current.page === 'interface'
                                    ? { ...current, reducedMotionEnabled: value }
                                    : current)}
                            />
                            <ToggleRow
                                label="紧凑输入区"
                                checked={data.compactInputAreaEnabled}
                                disabled={saving}
                                onChange={value => updateDraft(current => current.page === 'interface'
                                    ? { ...current, compactInputAreaEnabled: value }
                                    : current)}
                            />
                        </section>
                    )}

                    <button type="button" className="tt-button tt-button--primary tt-settings-save" disabled={saving} onClick={() => void save()}>
                        {saving ? '保存中…' : '保存此分类'}
                    </button>
                </div>
            )}
        </section>
    );
}
