const API_ORIGIN = 'https://api.mangadex.org';
const MIN_REQUEST_GAP_MS = 1100;

let requestChain = Promise.resolve();
let lastRequestAt = 0;
const inFlightRequests = new Map();

function wait(milliseconds) {
  return new Promise(resolve => globalThis.setTimeout(resolve, milliseconds));
}

function getRetryDelay(response) {
  const retryAfter = response.headers?.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(1000, seconds * 1000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay) && dateDelay > 0) return dateDelay;
  }
  return 5000;
}

async function fetchMangaDex(url) {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 10000);
  let response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('MangaDex request timed out. Please try again.');
      timeoutError.type = 'Timeout';
      throw timeoutError;
    }
    const requestError = new Error('MangaDex could not be reached. Check your connection and try again.');
    requestError.cause = error;
    throw requestError;
  } finally {
    globalThis.clearTimeout(timeout);
  }

  if (!response.ok) {
    const error = new Error(
      response.status === 429
        ? 'MangaDex rate limit reached. Please wait a moment and retry.'
        : `MangaDex request failed (${response.status}).`
    );
    error.status = response.status;
    error.retryAfter = response.status === 429 ? getRetryDelay(response) : 0;
    throw error;
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    const error = new Error(`MangaDex returned an invalid response (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  if (payload?.result !== 'ok' || !Array.isArray(payload.data) && !payload.data) {
    throw new Error('MangaDex returned an invalid metadata response.');
  }
  return payload;
}

function enqueueRequest(url) {
  const run = requestChain.then(async () => {
    const waitTime = Math.max(0, lastRequestAt + MIN_REQUEST_GAP_MS - Date.now());
    if (waitTime) await wait(waitTime);
    lastRequestAt = Date.now();
    try {
      return await fetchMangaDex(url);
    } catch (error) {
      if (Number(error?.status) !== 429) throw error;
      await wait(error.retryAfter || 5000);
      return fetchMangaDex(url);
    }
  });
  requestChain = run.catch(() => undefined);
  return run;
}

export async function requestMangaDex(path, params = {}) {
  if (typeof path !== 'string' || !/^\/manga(?:\/[0-9a-f-]{36})?$/i.test(path)) {
    throw new TypeError('A valid MangaDex manga endpoint is required.');
  }
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach(item => searchParams.append(key, String(item)));
    else if (value !== null && value !== undefined && value !== '') searchParams.set(key, String(value));
  }
  const query = searchParams.toString();
  const url = `${API_ORIGIN}${path}${query ? `?${query}` : ''}`;
  const pendingRequest = inFlightRequests.get(url);
  if (pendingRequest) return pendingRequest;

  const request = enqueueRequest(url);
  inFlightRequests.set(url, request);
  try {
    return await request;
  } finally {
    inFlightRequests.delete(url);
  }
}

export function searchMangaDex({ title = '', limit = 12, offset = 0 } = {}) {
  const safeLimit = Math.min(100, Math.max(1, Math.floor(Number(limit) || 12)));
  const safeOffset = Math.max(0, Math.floor(Number(offset) || 0));
  const params = {
    limit: safeLimit,
    offset: safeOffset,
    'includes[]': ['cover_art', 'author', 'artist'],
    'order[updatedAt]': 'desc',
  };
  const query = String(title || '').trim();
  if (query) {
    params.title = query;
    params['order[relevance]'] = 'desc';
    delete params['order[updatedAt]'];
  }
  return requestMangaDex('/manga', params);
}

export function getMangaDexDetails(id) {
  return requestMangaDex(`/manga/${id}`, {
    'includes[]': ['cover_art', 'author', 'artist'],
  }).catch(error => {
    if (Number(error?.status) === 404) error.notFound = true;
    throw error;
  });
}
