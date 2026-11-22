import { useCallback, useEffect, useState } from 'react';

import type { RemoteControlActions } from './RemoteControlContract';

type Props = {
    actions: RemoteControlActions;
};

type Draft = {
    id: string;
    displayName: string;
    description: string;
    chatCompletionSource: string;
    baseUrl: string;
};

function newConnection(): TauriTavernLlmConnectionDefinition {
    return {
        schemaVersion: 1,
        kind: 'tauritavern.llmConnection',
        id: `mobile-${Date.now().toString(36)}`,
        displayName: '',
        provider: {
            chatCompletionSource: 'openai',
        },
        auth: {},
    };
}

export function RemoteLlmConnectionsPanel({ actions }: Props) {
    const [connections, setConnections] = useState<TauriTavernLlmConnectionSummary[]>([]);
    const [base, setBase] = useState<TauriTavernLlmConnectionDefinition | null>(null);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const loadConnections = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const result = await actions.listLlmConnections();
            setConnections(result.connections);
            return true;
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
            return false;
        } finally {
            setLoading(false);
        }
    }, [actions]);

    useEffect(() => {
        void loadConnections();
    }, [loadConnections]);

    const openEditor = async (connectionId?: string) => {
        setLoading(true);
        setError('');
        setNotice('');
        try {
            const connection = connectionId
                ? await actions.loadLlmConnection(connectionId)
                : newConnection();
            if (!connection) {
                throw new Error(`电脑上找不到模型连接：${connectionId}`);
            }
            setBase(connection);
            setDraft({
                id: connection.id,
                displayName: connection.displayName,
                description: connection.description ?? '',
                chatCompletionSource: connection.provider.chatCompletionSource,
                baseUrl: connection.endpoint?.baseUrl ?? '',
            });
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setLoading(false);
        }
    };

    const closeEditor = () => {
        setBase(null);
        setDraft(null);
        setError('');
        setNotice('');
    };

    const save = async () => {
        if (!base || !draft || saving) {
            return;
        }
        const id = draft.id.trim();
        if (!/^[a-z0-9_-]{1,128}$/u.test(id)) {
            setError('连接 ID 只能包含小写字母、数字、连字符和下划线，长度不超过 128。');
            return;
        }
        if (!draft.displayName.trim() || !draft.chatCompletionSource.trim()) {
            setError('连接名称和服务商不能为空。');
            return;
        }

        setSaving(true);
        setError('');
        setNotice('');
        try {
            const endpoint: NonNullable<TauriTavernLlmConnectionDefinition['endpoint']> = {
                ...base.endpoint,
            };
            const baseUrl = draft.baseUrl.trim();
            if (baseUrl) {
                endpoint.baseUrl = baseUrl;
            } else {
                delete endpoint.baseUrl;
            }
            const endpointPatch = Object.keys(endpoint).length > 0 ? { endpoint } : {};
            const connection: TauriTavernLlmConnectionDefinition = {
                ...base,
                id,
                displayName: draft.displayName.trim(),
                ...(draft.description.trim()
                    ? { description: draft.description.trim() }
                    : {}),
                provider: {
                    ...base.provider,
                    chatCompletionSource: draft.chatCompletionSource.trim(),
                },
                ...endpointPatch,
                auth: base.auth,
            };
            await actions.saveLlmConnection(connection);
            if (!await loadConnections()) {
                setError('连接已保存到电脑，但无法重新读取连接列表。');
                return;
            }
            setBase(null);
            setDraft(null);
            setNotice('模型连接已保存到电脑。');
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        if (!base || saving || !window.confirm(`从电脑删除模型连接“${base.displayName}”？`)) {
            return;
        }
        setSaving(true);
        setError('');
        setNotice('');
        try {
            await actions.deleteLlmConnection(base.id);
            const refreshed = await loadConnections();
            setBase(null);
            setDraft(null);
            if (refreshed) {
                setNotice('模型连接已从电脑删除。');
            } else {
                setError('连接已从电脑删除，但无法重新读取连接列表。');
            }
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="tt-panel-stack">
            <div className="tt-inline-heading">
                <p className="tt-remote-page__description">
                    管理电脑保存的 TauriTavern LLM 连接（供 Agent / Model Target 引用）。密钥值不会读取到手机。
                </p>
                {!draft && (
                    <button type="button" className="tt-button tt-button--primary" disabled={loading} onClick={() => void openEditor()}>
                        新建连接
                    </button>
                )}
            </div>
            {error && <p className="tt-message tt-message--error" role="alert">{error}</p>}
            {notice && <p className="tt-message" role="status">{notice}</p>}

            {draft && base ? (
                <section className="tt-card tt-form-card">
                    <div className="tt-card__heading">
                        <h3>{connections.some(connection => connection.id === base.id) ? '编辑连接' : '新建连接'}</h3>
                        <button type="button" className="tt-text-button" disabled={saving} onClick={closeEditor}>返回列表</button>
                    </div>
                    <label className="tt-field">
                        <span>连接 ID</span>
                        <input
                            value={draft.id}
                            autoCapitalize="off"
                            autoCorrect="off"
                            disabled={saving || connections.some(connection => connection.id === base.id)}
                            onChange={event => setDraft({ ...draft, id: event.currentTarget.value })}
                        />
                    </label>
                    <label className="tt-field">
                        <span>显示名称</span>
                        <input
                            value={draft.displayName}
                            disabled={saving}
                            onChange={event => setDraft({ ...draft, displayName: event.currentTarget.value })}
                        />
                    </label>
                    <label className="tt-field">
                        <span>服务商 ID</span>
                        <input
                            value={draft.chatCompletionSource}
                            autoCapitalize="off"
                            autoCorrect="off"
                            disabled={saving}
                            onChange={event => setDraft({ ...draft, chatCompletionSource: event.currentTarget.value })}
                        />
                    </label>
                    <label className="tt-field">
                        <span>API 地址（可选）</span>
                        <input
                            value={draft.baseUrl}
                            inputMode="url"
                            autoCapitalize="off"
                            autoCorrect="off"
                            disabled={saving}
                            onChange={event => setDraft({ ...draft, baseUrl: event.currentTarget.value })}
                        />
                    </label>
                    <label className="tt-field">
                        <span>说明（可选）</span>
                        <textarea
                            value={draft.description}
                            disabled={saving}
                            rows={3}
                            onChange={event => setDraft({ ...draft, description: event.currentTarget.value })}
                        />
                    </label>
                    <p className="tt-field-hint">已有密钥引用和高级服务商设置会保留；密钥值只由电脑的密钥库管理。</p>
                    <div className="tt-button-row">
                        <button type="button" className="tt-button tt-button--primary" disabled={saving} onClick={() => void save()}>
                            {saving ? '保存中…' : '保存到电脑'}
                        </button>
                        {connections.some(connection => connection.id === base.id) && (
                            <button type="button" className="tt-button tt-button--danger" disabled={saving} onClick={() => void remove()}>
                                删除连接
                            </button>
                        )}
                    </div>
                </section>
            ) : (
                <>
                    {loading && <p className="tt-empty">正在读取电脑上的模型连接…</p>}
                    {!loading && connections.length === 0 && <p className="tt-empty">电脑上还没有 LLM 连接。</p>}
                    <div className="tt-card-list">
                        {connections.map(connection => (
                            <button
                                type="button"
                                className="tt-card tt-connection-card"
                                key={connection.id}
                                disabled={loading}
                                onClick={() => void openEditor(connection.id)}
                            >
                                <span className="tt-connection-card__copy">
                                    <strong>{connection.displayName}</strong>
                                    <span>{connection.chatCompletionSource}{connection.customApiFormat ? ` · ${connection.customApiFormat}` : ''}</span>
                                    <small>{connection.description || connection.id}</small>
                                </span>
                                <span className="tt-connection-card__chevron" aria-hidden="true">›</span>
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
