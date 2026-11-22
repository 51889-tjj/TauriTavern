import { useCallback, useEffect, useState } from 'react';

import type { RemoteChatCompletionSettings, RemoteControlActions } from './RemoteControlContract';

type Props = {
    actions: RemoteControlActions;
};

type Draft = {
    source: string;
    customApiFormat: string;
    model: string;
    customUrl: string;
    reverseProxy: string;
};

function toDraft(settings: RemoteChatCompletionSettings): Draft {
    return {
        source: settings.source,
        customApiFormat: settings.customApiFormat,
        model: settings.model,
        customUrl: settings.customUrl,
        reverseProxy: settings.reverseProxy,
    };
}

export function RemoteChatCompletionSettingsPanel({ actions }: Props) {
    const [settings, setSettings] = useState<RemoteChatCompletionSettings | null>(null);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [apiKey, setApiKey] = useState('');
    const [apiKeyLabel, setApiKeyLabel] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const load = useCallback(async (source?: string) => {
        setLoading(true);
        setError('');
        setSettings(null);
        setDraft(null);
        try {
            const result = await actions.getChatCompletionSettings(source);
            setSettings(result);
            setDraft(toDraft(result));
            return true;
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
            return false;
        } finally {
            setLoading(false);
        }
    }, [actions]);

    useEffect(() => {
        void load();
    }, [load]);

    const updateDraft = (patch: Partial<Draft>) => {
        setDraft(current => current ? { ...current, ...patch } : current);
    };

    const changeSource = async (source: string) => {
        if (!draft || source === draft.source) {
            return;
        }
        setDraft(current => current ? { ...current, source } : current);
        setNotice('');
        await load(source);
    };

    const saveSettings = async () => {
        if (!draft || saving) {
            return;
        }
        setSaving(true);
        setError('');
        setNotice('');
        try {
            const settingsToSave = {
                ...draft,
            };
            const model = draft.model.trim();
            if (model) {
                settingsToSave.model = model;
            }
            const result = await actions.updateChatCompletionSettings(settingsToSave);
            setSettings(result);
            setDraft(toDraft(result));
            setNotice('模型设置已保存到电脑。');
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setSaving(false);
        }
    };

    const saveApiKey = async () => {
        if (!settings?.apiKeySupported || !settings.chatCompletionActive || !apiKey.trim() || saving) {
            return;
        }
        setSaving(true);
        setError('');
        setNotice('');
        try {
            await actions.writeChatCompletionApiKey(settings.source, apiKey, apiKeyLabel);
            setApiKey('');
            setApiKeyLabel('');
            if (await load(settings.source)) {
                setNotice('API Key 已安全保存到电脑。手机不会保存密钥。');
            }
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setSaving(false);
        }
    };

    const deleteApiKey = async () => {
        if (!settings?.apiKeySupported || !settings.chatCompletionActive || saving) {
            return;
        }
        if (!window.confirm(`从电脑删除“${settings.source}”的 API Key？`)) {
            return;
        }
        setSaving(true);
        setError('');
        setNotice('');
        try {
            await actions.deleteChatCompletionApiKey(settings.source);
            if (await load(settings.source)) {
                setNotice('API Key 已从电脑删除。');
            }
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="tt-panel-stack">
            <p className="tt-remote-page__description">
                这里只请求当前 Chat Completion 服务商的模型设置。API Key 只发送给电脑并写入电脑密钥库，不会回传或保存在手机。
            </p>
            {error && <p className="tt-message tt-message--error" role="alert">{error}</p>}
            {notice && <p className="tt-message" role="status">{notice}</p>}
            {loading && <p className="tt-empty">正在读取电脑上的当前模型设置…</p>}

            {!loading && settings && draft && (
                <>
                    <section className="tt-card tt-form-card">
                        <label className="tt-field">
                            <span>服务商</span>
                            <select
                                value={draft.source}
                                disabled={saving}
                                onChange={event => void changeSource(event.currentTarget.value)}
                            >
                                {settings.sources.map(source => (
                                    <option key={source.value} value={source.value}>{source.label}</option>
                                ))}
                            </select>
                        </label>

                        {draft.source === 'custom' && (
                            <>
                                <label className="tt-field">
                                    <span>自定义 API 格式</span>
                                    <select
                                        value={draft.customApiFormat}
                                        disabled={saving}
                                        onChange={event => updateDraft({ customApiFormat: event.currentTarget.value })}
                                    >
                                        {settings.customApiFormats.map(format => (
                                            <option key={format} value={format}>{format}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="tt-field">
                                    <span>自定义 API 地址</span>
                                    <input
                                        value={draft.customUrl}
                                        inputMode="url"
                                        autoCapitalize="off"
                                        autoCorrect="off"
                                        disabled={saving}
                                        onChange={event => updateDraft({ customUrl: event.currentTarget.value })}
                                    />
                                </label>
                            </>
                        )}

                        {settings.model !== '' || settings.supportsCustomModels ? (
                            <label className="tt-field">
                                <span>模型 ID</span>
                                <input
                                    value={draft.model}
                                    autoCapitalize="off"
                                    autoCorrect="off"
                                    disabled={saving}
                                    onChange={event => updateDraft({ model: event.currentTarget.value })}
                                />
                            </label>
                        ) : (
                            <p className="tt-field-hint">此服务商暂未提供可在手机编辑的模型字段。</p>
                        )}

                        <label className="tt-field">
                            <span>反向代理地址</span>
                            <input
                                value={draft.reverseProxy}
                                inputMode="url"
                                autoCapitalize="off"
                                autoCorrect="off"
                                disabled={saving}
                                onChange={event => updateDraft({ reverseProxy: event.currentTarget.value })}
                            />
                        </label>
                        <button type="button" className="tt-button tt-button--primary" disabled={saving} onClick={() => void saveSettings()}>
                            {saving ? '保存中…' : '保存模型设置到电脑'}
                        </button>
                    </section>

                    <section className="tt-card tt-form-card">
                        <div className="tt-card__heading">
                            <div>
                                <h3>API Key</h3>
                                <p>
                                    {settings.chatCompletionActive
                                        ? settings.apiKeyConfigured ? '电脑上已配置密钥。' : '电脑上尚未配置密钥。'
                                        : '当前主 API 不是 Chat Completion，暂不能在此修改密钥。'}
                                </p>
                            </div>
                        </div>
                        <label className="tt-field">
                            <span>新 {settings.credentialLabel}</span>
                            <input
                                type="password"
                                value={apiKey}
                                autoComplete="new-password"
                                autoCapitalize="off"
                                autoCorrect="off"
                                spellCheck={false}
                                disabled={!settings.apiKeySupported || !settings.chatCompletionActive || saving}
                                onChange={event => setApiKey(event.currentTarget.value)}
                            />
                        </label>
                        <label className="tt-field">
                            <span>密钥标签（可选）</span>
                            <input
                                value={apiKeyLabel}
                                disabled={!settings.apiKeySupported || !settings.chatCompletionActive || saving}
                                onChange={event => setApiKeyLabel(event.currentTarget.value)}
                            />
                        </label>
                        <div className="tt-button-row">
                            <button
                                type="button"
                                className="tt-button tt-button--primary"
                                disabled={!apiKey.trim() || !settings.apiKeySupported || !settings.chatCompletionActive || saving}
                                onClick={() => void saveApiKey()}
                            >
                                保存密钥到电脑
                            </button>
                            {settings.apiKeyConfigured && (
                                <button
                                    type="button"
                                    className="tt-button tt-button--danger"
                                    disabled={!settings.chatCompletionActive || saving}
                                    onClick={() => void deleteApiKey()}
                                >
                                    删除密钥
                                </button>
                            )}
                        </div>
                    </section>
                </>
            )}
        </div>
    );
}
