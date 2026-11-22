import { useEffect, useState } from 'react';

type Translator = (key: import('./host').RemoteChatMessageKey) => string;

function errorText(error: unknown, fallback: string): string {
    if (error instanceof Error) {
        return error.message;
    }
    return typeof error === 'string' && error ? error : fallback;
}

export function RemoteControlHostPanel({
    api,
    tr,
}: {
    api: TauriTavernRemoteControlApi;
    tr: Translator;
}) {
    const [status, setStatus] = useState<TauriTavernRemoteChatSessionStatus | null>(null);
    const [busy, setBusy] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
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
        <div className="tt-remote-chat__host">
            <p>{tr('controlDescription')}</p>
            <p className={status?.active ? 'tt-remote-chat__status is-active' : 'tt-remote-chat__status'}>
                {status?.active ? tr('controlActive') : tr('controlInactive')}
            </p>
            {error && <p className="tt-remote-chat__error" role="alert">{error}</p>}
            <button
                type="button"
                disabled={busy}
                onClick={() => void setSession(!status?.active)}
            >
                {status?.active ? tr('controlStopHost') : tr('controlStartHost')}
            </button>
        </div>
    );
}
