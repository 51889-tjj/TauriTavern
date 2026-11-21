import { listen } from '../../../../tauri-bridge.js';

const REMOTE_CHAT_MAX_EVENT_TEXT_CHARS = 8_192;
const REMOTE_CHAT_COMMAND_EVENT = 'tauritavern-remote-chat-command';

/**
 * Connects authenticated LAN commands to the existing SillyTavern chat controls.
 * Generation remains owned by the desktop frontend so its normal extension hooks run.
 */
export async function installRemoteChatDesktopBridge({
    safeInvoke,
    getSessionId,
    markSessionEnded,
}) {
    const host = window.__TAURITAVERN__?.api?.remoteChat?.host;
    if (!host?.available) {
        return null;
    }

    let activeRequest = null;
    let runtimePromise = null;

    const getRuntime = () => {
        runtimePromise ??= import('../../../../scripts/st-context.js');
        return runtimePromise;
    };

    const publishEvent = async (requestId, kind, text, error) => {
        if (text && text.length > REMOTE_CHAT_MAX_EVENT_TEXT_CHARS) {
            throw new Error('Remote Chat output chunk exceeded the allowed size');
        }
        await safeInvoke('remote_chat_publish_event', { event: {
            sequence: 0,
            requestId,
            kind,
            ...(text === undefined ? {} : { text }),
            ...(error === undefined ? {} : { error }),
        } });
    };

    const handleStop = async (command) => {
        const current = activeRequest;
        if (!current || current.requestId !== command.requestId || current.sessionId !== command.sessionId) {
            return;
        }
        try {
            current.stopRequested = true;
            const st = await getRuntime();
            st.getContext().stopGeneration();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await safeInvoke('remote_chat_publish_event', { event: {
                sequence: 0,
                requestId: current.requestId,
                kind: 'failed',
                error: message,
            } });
        }
    };

    const handleEndSession = (command) => {
        markSessionEnded(command.sessionId);
    };

    const handleSend = async (command) => {
        if (activeRequest) {
            return;
        }

        const sessionId = getSessionId();
        if (!sessionId || command.sessionId !== sessionId) {
            return;
        }

        const current = {
            requestId: command.requestId,
            sessionId,
            stopRequested: false,
        };
        activeRequest = current;

        let context;
        let tokenListener;
        let stoppedListener;
        let publishTail = Promise.resolve();
        const queueEvent = (kind, text, error) => {
            publishTail = publishTail.then(
                () => publishEvent(current.requestId, kind, text, error),
                () => publishEvent(current.requestId, kind, text, error),
            );
            return publishTail;
        };

        try {
            if (document.body.dataset.generating === 'true') {
                throw new Error('The desktop is already generating a reply');
            }

            const st = await getRuntime();
            context = st.getContext();
            const textarea = document.querySelector('#send_textarea');
            if (!(textarea instanceof HTMLTextAreaElement)) {
                throw new Error('Desktop chat input is unavailable');
            }
            if (textarea.value.trim()) {
                throw new Error('Desktop chat input contains an unsent draft');
            }
            if (command.target?.kind === 'character') {
                const character = context.characters.find(
                    item => item.name === command.target.characterName,
                );
                if (!character) {
                    throw new Error(`Character is not available on desktop: ${command.target.characterName}`);
                }
                await context.openCharacterChat(command.target.fileName, character.avatar);
            } else if (command.target?.kind === 'group') {
                await context.openGroupChat(command.target.groupId, command.target.chatId);
            } else {
                throw new Error('Remote Chat target is invalid');
            }

            if (typeof command.text !== 'string' || !command.text.trim()) {
                throw new Error('Remote Chat message is empty');
            }

            tokenListener = (token) => {
                if (typeof token !== 'string' || !token) {
                    return;
                }
                void queueEvent('token', token).catch(error => {
                    console.error('[Remote Chat] Failed to publish a reply chunk:', error);
                });
            };
            context.eventSource.on(context.eventTypes.STREAM_TOKEN_RECEIVED, tokenListener);
            stoppedListener = () => {
                if (activeRequest === current) {
                    current.stopRequested = true;
                }
            };
            context.eventSource.on(context.eventTypes.GENERATION_STOPPED, stoppedListener);

            textarea.value = command.text;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            if (document.body.dataset.agentGuidanceReady === 'true') {
                textarea.value = '';
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                throw new Error('Finish the active Agent run before sending a Remote Chat message');
            }
            await context.sendTextareaMessage();
            await publishTail;
            await queueEvent(current.stopRequested ? 'stopped' : 'completed');
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            try {
                await publishTail;
                await queueEvent('failed', undefined, message);
            } catch (publishError) {
                console.error('[Remote Chat] Failed to report a desktop error:', publishError);
            }
        } finally {
            if (context && tokenListener) {
                context.eventSource.removeListener(
                    context.eventTypes.STREAM_TOKEN_RECEIVED,
                    tokenListener,
                );
            }
            if (context && stoppedListener) {
                context.eventSource.removeListener(
                    context.eventTypes.GENERATION_STOPPED,
                    stoppedListener,
                );
            }
            activeRequest = null;
        }
    };

    const unlisten = await listen(REMOTE_CHAT_COMMAND_EVENT, ({ payload }) => {
        void Promise.resolve().then(async () => {
            if (payload?.kind === 'send_message') {
                await handleSend(payload);
            } else if (payload?.kind === 'stop_generation') {
                await handleStop(payload);
            } else if (payload?.kind === 'end_session') {
                handleEndSession(payload);
            }
        }).catch(error => {
            console.error('[Remote Chat] Desktop command handler failed:', error);
        });
    });

    window.addEventListener('pagehide', () => {
        void unlisten();
    }, { once: true });

    return unlisten;
}
