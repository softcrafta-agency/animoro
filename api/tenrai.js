import {
  createTenraiRequestError,
  getTenraiCacheControl,
  getTenraiRequestUrl,
  isValidTenraiPayload,
} from './_lib/tenrai.js';

const UPSTREAM_TIMEOUT_MS = 10000;

function sendJson(response, statusCode, payload, cacheControl = 'no-store') {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', cacheControl);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Tenrai-Proxy', '1');
  response.end(JSON.stringify(payload));
}

export function createTenraiHandler({ fetchImpl = fetch, logger = console, timeoutMs = UPSTREAM_TIMEOUT_MS } = {}) {
  return async function tenraiHandler(request, response) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      return sendJson(response, 405, { error: 'Method Not Allowed' });
    }

    const query = request.query || {};
    let url;
    try {
      url = getTenraiRequestUrl(query);
    } catch (error) {
      if (Number(error?.status) === 400) {
        return sendJson(response, 400, { error: error.message, type: 'InvalidRequest' });
      }
      throw error;
    }
    if (!url) return sendJson(response, 400, { error: 'Unsupported Tenrai request.', type: 'InvalidRequest' });

    const resource = String(query.resource || '');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const upstream = await fetchImpl(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      let payload;
      try {
        payload = await upstream.json();
      } catch {
        if (upstream.ok) throw createTenraiRequestError(502, 'Tenrai returned invalid JSON.');
        payload = null;
      }
      if (!upstream.ok) {
        const error = createTenraiRequestError(
          upstream.status || 502,
          payload?.message || payload?.error || `Tenrai request failed (${upstream.status || 502}).`
        );
        error.retryAfter = upstream.headers?.get('retry-after');
        throw error;
      }
      if (!isValidTenraiPayload(payload, resource)) {
        throw createTenraiRequestError(502, 'Tenrai returned an invalid anime data response.');
      }
      if (request.method === 'HEAD') {
        response.statusCode = 200;
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.setHeader('Cache-Control', getTenraiCacheControl(resource));
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.setHeader('X-Tenrai-Proxy', '1');
        return response.end();
      }
      return sendJson(response, 200, payload, getTenraiCacheControl(resource));
    } catch (error) {
      const upstreamStatus = error?.name === 'AbortError' ? 504 : Number(error?.status) || 502;
      if (upstreamStatus >= 500) logger.warn?.('Tenrai proxy request failed.', error?.message || error);
      const status = upstreamStatus >= 400 && upstreamStatus <= 599 ? upstreamStatus : 502;
      if (error?.retryAfter) response.setHeader('Retry-After', error.retryAfter);
      return sendJson(response, status, {
        error: error?.message || 'Tenrai is temporarily unavailable.',
        type: status === 429 ? 'RateLimitExceeded' : status >= 500 ? 'UpstreamUnavailable' : 'UpstreamRequestError',
      });
    } finally {
      clearTimeout(timeout);
    }
  };
}

export default createTenraiHandler();
