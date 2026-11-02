import assert from 'node:assert/strict';
import test from 'node:test';
import { getJikanRequestUrl, isValidJikanPayload } from './jikan.js';

test('only creates whitelisted Jikan URLs with bounded query values', () => {
  const search = getJikanRequestUrl({ resource: 'anime', q: 'Naruto', type: 'tv', status: 'upcoming', page: '2', limit: '24', order_by: 'popularity', sort: 'asc' });
  assert.equal(search.toString(), 'https://api.jikan.moe/v4/anime?page=2&limit=24&q=Naruto&type=tv&status=upcoming&order_by=popularity&sort=asc');
  assert.equal(getJikanRequestUrl({ resource: 'top' }).pathname, '/v4/top/anime');
  assert.equal(getJikanRequestUrl({ resource: 'upcoming' }).pathname, '/v4/seasons/upcoming');
  assert.equal(getJikanRequestUrl({ resource: 'detail', id: '20' }).pathname, '/v4/anime/20/full');
  assert.equal(getJikanRequestUrl({ resource: 'https://example.test' }), null);
});

test('validates Jikan list and detail response shapes', () => {
  assert.equal(isValidJikanPayload({ data: [] }, 'anime'), true);
  assert.equal(isValidJikanPayload({ data: { mal_id: 20 } }, 'detail'), true);
  assert.equal(isValidJikanPayload({ data: {} }, 'anime'), false);
  assert.equal(isValidJikanPayload({ data: {} }, 'detail'), false);
  assert.equal(isValidJikanPayload({ data: [] }, 'detail'), false);
  assert.equal(isValidJikanPayload({ message: 'invalid' }, 'upcoming'), false);
});
