const RELOAD_PARAM = '__sellio_reload';

export function getAppAssetVersion(doc, baseUrl) {
  const origin = new URL(baseUrl).origin;
  const assets = [...doc.querySelectorAll('script[type="module"][src], link[rel="stylesheet"][href]')]
    .map(el => el.getAttribute('src') || el.getAttribute('href'))
    .map(src => new URL(src, baseUrl))
    .filter(url => url.origin === origin && /\/assets\/[^/]+\.(js|css)$/.test(url.pathname))
    .map(url => url.pathname + url.search);
  return [...new Set(assets)].sort().join('|') || null;
}

export async function fetchPublishedAppVersion(origin, { fetcher = fetch, timeoutMs = 8000 } = {}) {
  const url = new URL('/', origin);
  url.searchParams.set('__sellio_update_check', String(Date.now()));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url.href, {
      cache: 'no-store', credentials: 'same-origin', signal: controller.signal,
    });
    if (!response.ok) throw new Error('Could not check for app updates.');
    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
    const version = getAppAssetVersion(doc, origin);
    if (!version) throw new Error('Could not check for app updates.');
    return version;
  } finally {
    clearTimeout(timer);
  }
}

export function getAppReloadUrl(href) {
  const url = new URL(href);
  url.searchParams.set(RELOAD_PARAM, String(Date.now()));
  return url.href;
}

export function removeAppReloadParam() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(RELOAD_PARAM)) return;
  url.searchParams.delete(RELOAD_PARAM);
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
}
