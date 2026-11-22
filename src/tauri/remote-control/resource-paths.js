export const THIRD_PARTY_EXTENSION_RESOURCE_PREFIX = '/scripts/extensions/third-party/';

export function toRemoteThirdPartyResourceUrl(path, remote) {
    if (
        typeof remote?.sessionId !== 'string'
        || !/^[a-zA-Z0-9-]{1,63}$/u.test(remote.sessionId)
        || typeof path !== 'string'
    ) {
        return null;
    }

    const resourceUrl = new URL(path, 'https://tauritavern.invalid');
    if (
        resourceUrl.origin !== 'https://tauritavern.invalid'
        || !resourceUrl.pathname.startsWith(THIRD_PARTY_EXTENSION_RESOURCE_PREFIX)
    ) {
        return null;
    }

    return `tt-remote://${remote.sessionId}.localhost${resourceUrl.pathname}${resourceUrl.search}`;
}
