import assert from 'node:assert/strict';
import test from 'node:test';

const { requestAniList } = await import('./manhwa-api.js');

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => payload,
  };
}

test('posts GraphQL requests to AniList and deduplicates concurrent identical requests', async () => {
  let requests = 0;
  globalThis.fetch = async (url, options) => {
    requests += 1;
    assert.equal(url, 'https://graphql.anilist.co');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Accept, 'application/json');
    assert.deepEqual(JSON.parse(options.body), {
      query: 'query { Page { pageInfo { total } } }',
      variables: { page: 1 },
    });
    await new Promise(resolve => globalThis.setTimeout(resolve, 10));
    return response(200, { data: { Page: { pageInfo: { total: 3 } } } });
  };

  const [first, second] = await Promise.all([
    requestAniList('query { Page { pageInfo { total } } }', { page: 1 }),
    requestAniList('query { Page { pageInfo { total } } }', { page: 1 }),
  ]);
  assert.equal(requests, 1);
  assert.deepEqual(first, { Page: { pageInfo: { total: 3 } } });
  assert.deepEqual(second, first);
});

test('surfaces GraphQL errors instead of returning an empty success response', async () => {
  globalThis.fetch = async () => response(200, {
    data: null,
    errors: [{ message: 'Invalid query field.' }],
  });
  await assert.rejects(requestAniList('query { invalid }'), /Invalid query field/);
});

test('marks only AniList missing-media responses as confirmed not found', async () => {
  globalThis.fetch = async () => response(404, {
    errors: [{ message: 'Not Found.', status: 404 }],
    data: { Media: null },
  });
  await assert.rejects(
    requestAniList('query($id: Int!) { Media(id: $id) { id } }', { id: 999999999 }),
    error => error.status === 404 && error.notFound === true
  );

  globalThis.fetch = async () => response(404, {
    errors: [{ message: 'Proxy route unavailable.', status: 404 }],
    data: null,
  });
  await assert.rejects(
    requestAniList('query($id: Int!) { Media(id: $id) { id } }', { id: 132144 }),
    error => error.status === 404 && error.notFound !== true
  );
});
