import assert from 'node:assert/strict';
import test from 'node:test';
import { createTenraiHandler } from './tenrai.js';

function createResponse() {
  return {
    headers: {},
    statusCode: 0,
    body: '',
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(value = '') {
      this.body = value;
    },
  };
}

function responseWith(status, payload, headers = new Headers()) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    json: async () => payload,
  };
}

test('Tenrai proxy builds the documented catalogue endpoint and applies cache headers', async () => {
  let upstreamUrl;
  const handler = createTenraiHandler({
    fetchImpl: async url => {
      upstreamUrl = url;
      return responseWith(200, {
        data: [{ mal_id: 20, title: 'Naruto' }],
        pagination: { has_next_page: false },
      });
    },
  });
  const response = createResponse();

  await handler({ method: 'GET', query: { resource: 'anime', q: 'naruto', page: '1', limit: '1' } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(upstreamUrl.pathname, '/v1/anime');
  assert.equal(upstreamUrl.searchParams.get('q'), 'naruto');
  assert.equal(upstreamUrl.searchParams.get('limit'), '1');
  assert.match(response.headers['cache-control'], /s-maxage=/);
  assert.equal(JSON.parse(response.body).data[0].mal_id, 20);
});

test('Tenrai proxy rejects unsupported and out-of-range pagination input', async () => {
  let called = false;
  const handler = createTenraiHandler({
    fetchImpl: async () => {
      called = true;
      return responseWith(200, { data: [] });
    },
  });
  const response = createResponse();

  await handler({ method: 'GET', query: { resource: 'anime', page: '20001' } }, response);

  assert.equal(response.statusCode, 400);
  assert.equal(called, false);
});

test('Tenrai proxy preserves rate-limit status and Retry-After', async () => {
  const handler = createTenraiHandler({
    fetchImpl: async () => responseWith(
      429,
      { message: 'Too many requests' },
      new Headers({ 'retry-after': '30' })
    ),
    logger: { warn() {} },
  });
  const response = createResponse();

  await handler({ method: 'GET', query: { resource: 'anime' } }, response);

  assert.equal(response.statusCode, 429);
  assert.equal(response.headers['retry-after'], '30');
  assert.equal(JSON.parse(response.body).type, 'RateLimitExceeded');
});

test('Tenrai proxy preserves upstream server failures', async () => {
  const handler = createTenraiHandler({
    fetchImpl: async () => responseWith(503, { message: 'Upstream maintenance' }),
    logger: { warn() {} },
  });
  const response = createResponse();

  await handler({ method: 'GET', query: { resource: 'anime' } }, response);

  assert.equal(response.statusCode, 503);
  assert.equal(JSON.parse(response.body).type, 'UpstreamUnavailable');
});

test('Tenrai proxy reports malformed successful JSON as an upstream error', async () => {
  const handler = createTenraiHandler({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => { throw new SyntaxError('invalid JSON'); },
    }),
    logger: { warn() {} },
  });
  const response = createResponse();

  await handler({ method: 'GET', query: { resource: 'anime' } }, response);

  assert.equal(response.statusCode, 502);
  assert.match(JSON.parse(response.body).error, /invalid JSON/i);
});

test('Tenrai proxy aborts timed-out upstream requests', async () => {
  const handler = createTenraiHandler({
    timeoutMs: 5,
    fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    }),
    logger: { warn() {} },
  });
  const response = createResponse();

  await handler({ method: 'GET', query: { resource: 'anime' } }, response);

  assert.equal(response.statusCode, 504);
  assert.equal(JSON.parse(response.body).type, 'UpstreamUnavailable');
});
