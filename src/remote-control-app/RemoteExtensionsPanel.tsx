import { useCallback, useEffect, useState } from 'react';

import type { RemoteControlActions, RemoteExtension } from './RemoteControlContract';

type Props = {
    actions: RemoteControlActions;
};

function extensionTypeLabel(type: RemoteExtension['extensionType']): string {
    switch (type) {
        case 'System':
            return '内置';
        case 'Local':
            return '本地扩展';
        case 'Global':
            return '全局扩展';
    }
}

export function RemoteExtensionsPanel({ actions }: Props) {
    const [extensions, setExtensions] = useState<RemoteExtension[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyName, setBusyName] = useState('');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [installOpen, setInstallOpen] = useState(false);
    const [installUrl, setInstallUrl] = useState('');
    const [installBranch, setInstallBranch] = useState('');

    const loadExtensions = useCallback(async (): Promise<boolean> => {
        setLoading(true);
        setError('');
        setNotice('');
        try {
            const result = await actions.listExtensions();
            setExtensions(result.slice().sort((left, right) => left.name.localeCompare(right.name)));
            return true;
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
            return false;
        } finally {
            setLoading(false);
        }
    }, [actions]);

    useEffect(() => {
        void loadExtensions();
    }, [loadExtensions]);

    const toggle = async (extension: RemoteExtension) => {
        const nextEnabled = !extension.enabled;
        const prompt = nextEnabled
            ? `将在电脑上启用扩展“${extension.name}”。扩展代码会在电脑重新加载界面后运行。继续？`
            : `将在电脑上禁用扩展“${extension.name}”。重载电脑界面前，当前已加载代码可能仍在运行。继续？`;
        if (busyName || !window.confirm(prompt)) {
            return;
        }

        setBusyName(extension.name);
        setError('');
        setNotice('');
        try {
            const result = await actions.setExtensionEnabled(extension.name, nextEnabled);
            setExtensions(current => current.map(item => (
                item.name === extension.name ? { ...item, enabled: result.enabled } : item
            )));
            setNotice(result.reloadRequired
                ? '状态已保存到电脑。该扩展会在电脑重新加载界面后生效。'
                : '扩展状态没有变化。');
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setBusyName('');
        }
    };

    const install = async () => {
        const url = installUrl.trim();
        if (!url || busyName) {
            setError('请先输入扩展仓库 URL。');
            return;
        }
        if (!window.confirm(`请求电脑从此地址安装第三方扩展？\n${url}`)) {
            return;
        }

        setBusyName('install');
        setError('');
        setNotice('');
        try {
            const result = await actions.installExtension(url, installBranch.trim() || undefined);
            setInstallUrl('');
            setInstallBranch('');
            setInstallOpen(false);
            if (await loadExtensions()) {
                setNotice(result.reloadRequired
                    ? '扩展已安装到电脑。重新加载电脑界面后才会发现和运行。'
                    : '扩展已安装到电脑。');
            } else {
                setError('扩展已安装到电脑，但无法刷新扩展列表。');
            }
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setBusyName('');
        }
    };

    const update = async (extension: RemoteExtension) => {
        if (busyName || !window.confirm(`在电脑上更新扩展“${extension.name}”？`)) {
            return;
        }

        setBusyName(`update:${extension.name}`);
        setError('');
        setNotice('');
        try {
            const result = await actions.updateExtension(extension.name);
            if (await loadExtensions()) {
                setNotice(result.isUpToDate
                    ? `扩展“${extension.name}”已经是最新版本。`
                    : `扩展“${extension.name}”已更新${result.shortCommitHash ? `（${result.shortCommitHash}）` : ''}；需要重载电脑界面后生效。`);
            } else {
                setError('扩展更新操作已完成，但无法刷新扩展列表。');
            }
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setBusyName('');
        }
    };

    const remove = async (extension: RemoteExtension) => {
        if (busyName || !window.confirm(`从电脑删除扩展“${extension.name}”？不会运行 clean 数据清理 Hook。`)) {
            return;
        }

        setBusyName(`delete:${extension.name}`);
        setError('');
        setNotice('');
        try {
            const result = await actions.deleteExtension(extension.name);
            setExtensions(current => current.filter(item => item.name !== extension.name));
            setNotice(result.reloadRequired
                ? `扩展“${extension.name}”已从电脑删除，电脑界面将重新加载。`
                : `扩展“${extension.name}”已从电脑删除。`);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setBusyName('');
        }
    };

    return (
        <section className="tt-remote-page">
            <div className="tt-remote-page__heading">
                <div>
                    <p className="tt-remote-page__eyebrow">电脑上的扩展</p>
                    <h2>扩展</h2>
                </div>
                <div className="tt-button-row">
                    <button
                        type="button"
                        className="tt-button tt-button--quiet"
                        disabled={loading || Boolean(busyName)}
                        onClick={() => void loadExtensions()}
                    >
                        刷新
                    </button>
                    <button
                        type="button"
                        className="tt-button tt-button--primary"
                        disabled={Boolean(busyName)}
                        onClick={() => setInstallOpen(value => !value)}
                    >
                        {installOpen ? '取消' : '安装'}
                    </button>
                </div>
            </div>
            <p className="tt-remote-page__description">
                扩展安装、更新和删除均由电脑执行。手机不会下载或执行扩展代码；变更后需按提示重载电脑界面。
            </p>

            {error && <p className="tt-message tt-message--error" role="alert">{error}</p>}
            {notice && <p className="tt-message" role="status">{notice}</p>}
            {installOpen && (
                <section className="tt-card tt-form-card">
                    <h3>从仓库安装到电脑</h3>
                    <label className="tt-field">
                        <span>Git 仓库 URL</span>
                        <input
                            value={installUrl}
                            inputMode="url"
                            autoCapitalize="off"
                            autoCorrect="off"
                            spellCheck={false}
                            disabled={busyName === 'install'}
                            onChange={event => setInstallUrl(event.currentTarget.value)}
                        />
                    </label>
                    <label className="tt-field">
                        <span>分支（可选）</span>
                        <input
                            value={installBranch}
                            autoCapitalize="off"
                            autoCorrect="off"
                            disabled={busyName === 'install'}
                            onChange={event => setInstallBranch(event.currentTarget.value)}
                        />
                    </label>
                    <p className="tt-field-hint">安装在电脑的本地扩展目录；电脑端可能还会显示第三方扩展确认。</p>
                    <button
                        type="button"
                        className="tt-button tt-button--primary"
                        disabled={busyName === 'install'}
                        onClick={() => void install()}
                    >
                        {busyName === 'install' ? '电脑正在安装…' : '确认在电脑安装'}
                    </button>
                </section>
            )}
            {loading && <p className="tt-empty">正在读取电脑上的扩展…</p>}
            {!loading && extensions.length === 0 && <p className="tt-empty">电脑上没有可管理的扩展。</p>}

            <div className="tt-card-list">
                {extensions.map(extension => (
                    <article className="tt-card tt-extension-card" key={`${extension.extensionType}:${extension.name}`}>
                        <div className="tt-extension-card__copy">
                            <strong>{extension.name}</strong>
                            <span>{extensionTypeLabel(extension.extensionType)}</span>
                        </div>
                        <div className="tt-extension-card__action">
                            <span className={`tt-state${extension.enabled ? ' is-active' : ''}`}>
                                {extension.enabled === null
                                    ? '状态未知'
                                    : extension.enabled
                                        ? '已启用'
                                        : '已停用'}
                            </span>
                            <button
                                type="button"
                                className="tt-button tt-button--small"
                                disabled={extension.extensionType === 'System' || extension.enabled === null || Boolean(busyName)}
                                onClick={() => void toggle(extension)}
                            >
                                {busyName === extension.name
                                    ? '保存中…'
                                    : extension.enabled
                                        ? '停用'
                                        : '启用'}
                            </button>
                            {extension.extensionType !== 'System' && (
                                <div className="tt-extension-card__management">
                                    <button
                                        type="button"
                                        className="tt-text-button"
                                        disabled={Boolean(busyName)}
                                        onClick={() => void update(extension)}
                                    >
                                        {busyName === `update:${extension.name}` ? '更新中…' : '更新'}
                                    </button>
                                    <button
                                        type="button"
                                        className="tt-text-button tt-text-button--danger"
                                        disabled={Boolean(busyName)}
                                        onClick={() => void remove(extension)}
                                    >
                                        {busyName === `delete:${extension.name}` ? '删除中…' : '删除'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </article>
                ))}
            </div>
        </section>
    );
}
