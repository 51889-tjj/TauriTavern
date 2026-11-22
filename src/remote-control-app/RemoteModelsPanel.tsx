import { useState } from 'react';

import type { RemoteControlActions } from './RemoteControlContract';
import { RemoteChatCompletionSettingsPanel } from './RemoteChatCompletionSettingsPanel';
import { RemoteLlmConnectionsPanel } from './RemoteLlmConnectionsPanel';

type Props = {
    actions: RemoteControlActions;
};

type ModelView = 'chat-api' | 'connections';

export function RemoteModelsPanel({ actions }: Props) {
    const [view, setView] = useState<ModelView>('chat-api');

    return (
        <section className="tt-remote-page">
            <div className="tt-remote-page__heading">
                <div>
                    <p className="tt-remote-page__eyebrow">电脑上的模型配置</p>
                    <h2>模型 / API</h2>
                </div>
            </div>
            <nav className="tt-segmented" aria-label="模型设置类别">
                <button
                    type="button"
                    aria-pressed={view === 'chat-api'}
                    onClick={() => setView('chat-api')}
                >
                    Chat API
                </button>
                <button
                    type="button"
                    aria-pressed={view === 'connections'}
                    onClick={() => setView('connections')}
                >
                    LLM 连接
                </button>
            </nav>
            {view === 'chat-api'
                ? <RemoteChatCompletionSettingsPanel actions={actions} />
                : <RemoteLlmConnectionsPanel actions={actions} />}
        </section>
    );
}
