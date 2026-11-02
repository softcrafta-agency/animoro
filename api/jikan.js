import { createJikanError, getJikanRequestUrl, isValidJikanPayload } from './_lib/jikan.js';

const UPSTREAM_TIMEOUT_MS = 9000;
const CACHE_CONTROL = 'public, s-maxage=3600, stale-while-revalidate=86400';

function sendJson(response, statusCode, payload, cacheControl = 'no-store') {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', cacheControl);
  response.setHeader('X-Jikan-Proxy', '1');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(JSON.stringify(payload));
}

export function createJikanHandler({ fetchImpl = fetch, logger = console, timeoutMs = UPSTREAM_TIMEOUT_MS } = {}) {
  return async function jikanHandler(request, response) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      return sendJson(response, 405, { error: 'Method Not Allowed' });
    }

    const query = request.query || {};
    const url = getJikanRequestUrl(query);
    if (!url) return sendJson(response, 400, { error: 'Unsupported Jikan request.' });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const upstream = await fetchImpl(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      let payload = null;
      try {
        payload = await upstream.json();
      } catch {
        if (upstream.ok) throw createJikanError(502, 'Jikan returned invalid JSON.');
      }
      if (!upstream.ok) {
        throw createJikanError(upstream.status || 502, payload?.message || 'Anime data is temporarily unavailable.');
      }
      if (!isValidJikanPayload(payload, query.resource)) {
        throw createJikanError(502, 'Jikan returned an invalid anime data response.');
      }
      return sendJson(response, 200, request.method === 'HEAD' ? {} : payload, CACHE_CONTROL);
    } catch (error) {
      const status = error?.name === 'AbortError' ? 504 : Number(error?.status) || 502;
      if (status >= 500) logger.warn?.('Jikan proxy request failed.', error?.message || error);
      const responseStatus = status === 429 || status === 504
        ? status
        : status >= 400 && status < 500 ? status : 502;
      return sendJson(response, responseStatus, {
        error: error?.message || 'Anime data is temporarily unavailable.',
      });
    } finally {
      clearTimeout(timeout);
    }
  };
}

export default createJikanHandler();
