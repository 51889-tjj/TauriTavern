// Window geometry excludes the keyboard. Content viewport geometry stays in browser APIs.
import { isMobileHost } from './host-identity.js';

let snapshot = null;
const subscribers = new Set();

export function getWindowSnapshot() { return snapshot; }
export function isWindowPortrait() { return snapshot ? snapshot.height >= snapshot.width : window.matchMedia('(orientation: portrait)').matches; }
export function subscribeWindowSnapshot(handler) { subscribers.add(handler); if (snapshot) handler(snapshot); return () => subscribers.delete(handler); }

export async function installWindowLayout(context) {
    if (!isMobileHost()) return;
    const receive = (next) => {
        if (!next || (snapshot && next.revision <= snapshot.revision)) return;
        snapshot = Object.freeze({ ...next, insets: Object.freeze(next.insets) });
        const background = document.getElementById('bg1');
        background.classList.add('tt-window-background');
        for (const [name, value] of Object.entries({ x: -next.insets.left, y: -next.insets.top, width: next.width, height: next.height })) {
            background.style.setProperty(`--tt-window-${name}`, `${value / next.scale}px`);
        }
        for (const handler of subscribers) handler(snapshot);
    };
    window.addEventListener('tt-window-changed', (event) => receive(event.detail));
    try {
        receive(await context.safeInvoke('get_window_snapshot'));
    } catch (error) {
        console.warn('[TauriTavern] Native window snapshot unavailable:', error);
        receive({ revision: 1, width: Math.round(window.innerWidth * devicePixelRatio), height: Math.round(window.innerHeight * devicePixelRatio), scale: devicePixelRatio, insets: { top: 0, right: 0, bottom: 0, left: 0 } });
    }
}
