const SITE_HOSTS = new Set(['animoro.in', 'www.animoro.in']);
const RETIRED_PATHS = /^\/(?:anime(?:\.html)?(?:\/|$)|upcoming-anime(?:\.html)?(?:\/|$)|anime-calendar\.html\/?$)/i;

export function isRetiredPublicRoute(value) {
  if (typeof value !== 'string' || !value.trim()) return false;

  try {
    const url = new URL(value.trim(), 'https://www.animoro.in/');
    return SITE_HOSTS.has(url.hostname.toLowerCase()) && RETIRED_PATHS.test(url.pathname);
  } catch {
    return false;
  }
}
