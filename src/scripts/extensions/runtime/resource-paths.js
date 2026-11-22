import { getCurrentLocale } from '../../i18n.js';
import { toRemoteThirdPartyResourceUrl } from '../../../tauri/remote-control/resource-paths.js';

export function normalizeExtensionResourcePath(resourcePath) {
    const locale = getCurrentLocale();
    return String(resourcePath || '')
        .replace(/^\/+/, '')
        .replace(/\$\{locale\}/g, locale);
}

export function getExtensionResourceUrl(name, resourcePath) {
    const normalizedPath = normalizeExtensionResourcePath(resourcePath);
    const remote = typeof window === 'undefined' ? null : window.__TAURITAVERN_REMOTE_CONTROL__;
    if (remote && isThirdPartyExtension(name)) {
        const queryIndex = normalizedPath.indexOf('?');
        const path = queryIndex < 0 ? normalizedPath : normalizedPath.slice(0, queryIndex);
        const query = queryIndex < 0 ? '' : normalizedPath.slice(queryIndex);
        const resourceUrlPath = `/scripts/extensions/${name}/${path}`;
        const encodedResourceUrlPath = resourceUrlPath
            .split('/')
            .map(segment => encodeURIComponent(segment))
            .join('/');
        const remoteUrl = toRemoteThirdPartyResourceUrl(
            `${encodedResourceUrlPath}${query}`,
            remote,
        );
        if (remoteUrl) {
            return remoteUrl;
        }
    }
    return `/scripts/extensions/${name}/${normalizedPath}`;
}

export function isThirdPartyExtension(name) {
    return String(name || '').startsWith('third-party/');
}
