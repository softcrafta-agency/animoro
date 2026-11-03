const ANILIST_ENDPOINT = 'https://graphql.anilist.co';
const REQUEST_GAP_MS = 2100;

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

  const reset = Number(response.headers?.get('x-ratelimit-reset'));
  if (Number.isFinite(reset) && reset > 0) {
    return Math.max(1000, reset * 1000 - Date.now());
  }
  return 5000;
}

async function postGraphQL(query, variables) {
  let response;
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 10000);
  try {
    response = await fetch(ANILIST_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('AniList request timed out. Please try again.');
      timeoutError.type = 'Timeout';
      throw timeoutError;
    }
    const requestError = new Error('AniList could not be reached. Check your connection and try again.');
    requestError.cause = error;
    throw requestError;
  } finally {
    globalThis.clearTimeout(timeout);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    const error = new Error(`AniList returned an invalid response (${response.status}).`);
    error.status = response.status;
    throw error;
  }

  if (!response.ok) {
    const error = new Error(
      response.status === 429
        ? 'AniList rate limit reached. Please wait a moment and retry.'
        : `AniList request failed (${response.status}).`
    );
    error.status = response.status;
    error.retryAfter = response.status === 429 ? getRetryDelay(response) : 0;
    if (
      response.status === 404 &&
      Number.isSafeInteger(variables?.id) &&
      variables.id > 0 &&
      Object.hasOwn(payload?.data || {}, 'Media') &&
      payload.data.Media === null &&
      Array.isArray(payload.errors) &&
      payload.errors.some(item =>
        Number(item?.status) === 404 && /^not found\.?$/i.test(String(item?.message || '').trim())
      )
    ) {
      error.notFound = true;
    }
    throw error;
  }
  if (!payload || !Object.hasOwn(payload, 'data')) {
    throw new Error('AniList returned an invalid GraphQL response.');
  }
  if (Array.isArray(payload.errors) && payload.errors.length) {
    const error = new Error(payload.errors.map(item => item.message).filter(Boolean).join(' ') ||
      'AniList could not complete this request.');
    error.status = response.status;
    throw error;
  }
  return payload.data;
}

function enqueueRequest(task) {
  const run = requestChain.then(async () => {
    const waitTime = Math.max(0, lastRequestAt + REQUEST_GAP_MS - Date.now());
    if (waitTime) await wait(waitTime);
    lastRequestAt = Date.now();
    return task();
  });
  requestChain = run.catch(() => undefined);
  return run;
}

export async function requestAniList(query, variables = {}) {
  if (typeof query !== 'string' || !query.trim()) {
    throw new TypeError('An AniList GraphQL query is required.');
  }
  const key = JSON.stringify([query, variables]);
  const pendingRequest = inFlightRequests.get(key);
  if (pendingRequest) return pendingRequest;

  const request = enqueueRequest(async () => {
    try {
      return await postGraphQL(query, variables);
    } catch (error) {
      if (Number(error?.status) !== 429) throw error;
      await wait(error.retryAfter || 5000);
      return postGraphQL(query, variables);
    }
  });
  inFlightRequests.set(key, request);
  try {
    return await request;
  } finally {
    inFlightRequests.delete(key);
  }
}
