import { useEffect, useState } from 'react';

import { RemoteControlHostPanel } from './RemoteControlHostPanel';
import type { RemoteChatTranslator } from './host';

type Props = {
    api: TauriTavernRemoteChatApi;
    remoteControlApi?: TauriTavernRemoteControlApi;
    tr: RemoteChatTranslator;
};

function errorText(error: unknown, fallback: string): string {
    if (error instanceof Error) {
        return error.message;
    }
    return typeof error === 'string' && error ? error : fallback;
}

export function RemoteChatHostView({ api, remoteControlApi, tr }: Props) {
    const [status, setStatus] = useState<TauriTavernRemoteChatSessionStatus | null>(null);
    const [busy, setBusy] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!api.host.available) {
            return;
        }
        let alive = true;
        void api.host.status()
            .then(value => {
                if (alive) {
                    setStatus(value);
                }
            })
            .catch(reason => {
                if (alive) {
                    setError(errorText(reason, tr('unknownError')));
                }
            })
            .finally(() => {
                if (alive) {
                    setBusy(false);
                }
            });
        return () => {
            alive = false;
        };
    }, [api, tr]);

    const setSession = async (active: boolean) => {
        setBusy(true);
        setError('');
        try {
            if (active) {
                setStatus(await api.host.startSession());
            } else {
                await api.host.stopSession();
                setStatus({ active: false });
            }
        } catch (reason) {
            setError(errorText(reason, tr('unknownError')));
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <div className="tt-remote-chat__host">
                <p>{tr('hostDescription')}</p>
                <p className={status?.active ? 'tt-remote-chat__status is-active' : 'tt-remote-chat__status'}>
                    {status?.active ? tr('hostActive') : tr('hostInactive')}
                </p>
                {error && <p className="tt-remote-chat__error" role="alert">{error}</p>}
                {status?.active
                    ? <button type="button" disabled={busy} onClick={() => void setSession(false)}>{tr('stopHost')}</button>
                    : <button type="button" disabled={busy} onClick={() => void setSession(true)}>{tr('startHost')}</button>}
            </div>
            {remoteControlApi?.host.available && (
                <RemoteControlHostPanel api={remoteControlApi} tr={tr} />
            )}
        </>
    );
}
