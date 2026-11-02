import assert from 'node:assert/strict';
import test from 'node:test';
import { createJikanHandler } from './jikan.js';

function createResponse() {
  return {
    headers: {},
    statusCode: 0,
    body: '',
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(body = '') {
      this.body = body;
    },
  };
}

test('proxies supported Jikan requests and enables shared caching', async () => {
  let requestedUrl;
  const handler = createJikanHandler({
    fetchImpl: async url => {
      requestedUrl = url.toString();
      return { ok: true, status: 200, json: async () => ({ data: [] }) };
    },
  });
  const response = createResponse();

  await handler({ method: 'GET', query: { resource: 'anime', q: 'Naruto' } }, response);

  assert.equal(requestedUrl, 'https://api.jikan.moe/v4/anime?page=1&limit=24&q=Naruto');
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['cache-control'], 'public, s-maxage=3600, stale-while-revalidate=86400');
  assert.deepEqual(JSON.parse(response.body), { data: [] });
});

test('routes upcoming and detail requests to the matching Jikan resources', async () => {
  const requestedUrls = [];
  const handler = createJikanHandler({
    fetchImpl: async url => {
      requestedUrls.push(url.toString());
      const data = url.pathname.includes('/full') ? { mal_id: 20 } : [];
      return { ok: true, status: 200, json: async () => ({ data }) };
    },
  });
  const upcomingResponse = createResponse();
  const detailResponse = createResponse();

  await handler({ method: 'GET', query: { resource: 'upcoming', page: '2', limit: '12' } }, upcomingResponse);
  await handler({ method: 'GET', query: { resource: 'detail', id: '20' } }, detailResponse);

  assert.deepEqual(requestedUrls, [
    'https://api.jikan.moe/v4/seasons/upcoming?page=2&limit=12',
    'https://api.jikan.moe/v4/anime/20/full',
  ]);
  assert.equal(upcomingResponse.statusCode, 200);
  assert.equal(detailResponse.statusCode, 200);
});

test('preserves upstream rate-limit responses without caching them', async () => {
  const handler = createJikanHandler({
    fetchImpl: async () => ({
      ok: false,
      status: 429,
      json: async () => ({ message: 'Rate limit exceeded.' }),
    }),
    logger: { warn() {} },
  });
  const response = createResponse();

  await handler({ method: 'GET', query: { resource: 'upcoming' } }, response);

  assert.equal(response.statusCode, 429);
  assert.equal(response.headers['x-jikan-proxy'], '1');
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.deepEqual(JSON.parse(response.body), { error: 'Rate limit exceeded.' });
});

test('preserves upstream rate limits even when the response body is malformed', async () => {
  const handler = createJikanHandler({
    fetchImpl: async () => ({
      ok: false,
      status: 429,
      json: async () => { throw new SyntaxError('No JSON body'); },
    }),
    logger: { warn() {} },
  });
  const response = createResponse();

  await handler({ method: 'GET', query: { resource: 'upcoming' } }, response);

  assert.equal(response.statusCode, 429);
  assert.deepEqual(JSON.parse(response.body), { error: 'Anime data is temporarily unavailable.' });
});

test('rejects unsupported methods without making an upstream request', async () => {
  let fetched = false;
  const handler = createJikanHandler({
    fetchImpl: async () => {
      fetched = true;
      throw new Error('Unexpected request.');
    },
  });
  const response = createResponse();

  await handler({ method: 'POST', query: { resource: 'anime' } }, response);

  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.allow, 'GET, HEAD');
  assert.equal(fetched, false);
});

test('returns gateway timeout for an aborted upstream request', async () => {
  const handler = createJikanHandler({
    fetchImpl: async () => {
      const error = new Error('Request timed out.');
      error.name = 'AbortError';
      throw error;
    },
    logger: { warn() {} },
  });
  const response = createResponse();

  await handler({ method: 'GET', query: { resource: 'detail', id: '20' } }, response);

  assert.equal(response.statusCode, 504);
  assert.equal(response.headers['cache-control'], 'no-store');
});

test('aborts an upstream request that exceeds the timeout', async () => {
  const handler = createJikanHandler({
    timeoutMs: 5,
    fetchImpl: (_url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => {
        const error = new Error('Request aborted.');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    }),
    logger: { warn() {} },
  });
  const response = createResponse();

  await handler({ method: 'GET', query: { resource: 'upcoming' } }, response);

  assert.equal(response.statusCode, 504);
  assert.equal(response.headers['cache-control'], 'no-store');
});

test('rejects malformed JSON and unexpected response shapes', async () => {
  const malformedHandler = createJikanHandler({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('Unexpected token'); },
    }),
    logger: { warn() {} },
  });
  const malformedResponse = createResponse();
  await malformedHandler({ method: 'GET', query: { resource: 'upcoming' } }, malformedResponse);

  const invalidShapeHandler = createJikanHandler({
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ data: {} }) }),
    logger: { warn() {} },
  });
  const invalidShapeResponse = createResponse();
  await invalidShapeHandler({ method: 'GET', query: { resource: 'upcoming' } }, invalidShapeResponse);

  assert.equal(malformedResponse.statusCode, 502);
  assert.deepEqual(JSON.parse(malformedResponse.body), { error: 'Jikan returned invalid JSON.' });
  assert.equal(invalidShapeResponse.statusCode, 502);
  assert.deepEqual(JSON.parse(invalidShapeResponse.body), { error: 'Jikan returned an invalid anime data response.' });
});
