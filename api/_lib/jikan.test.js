import assert from 'node:assert/strict';
import test from 'node:test';
import { getJikanRequestUrl } from './jikan.js';

test('only creates whitelisted Jikan URLs with bounded query values', () => {
  const search = getJikanRequestUrl({ resource: 'anime', q: 'Naruto', type: 'tv', status: 'upcoming', page: '2', limit: '24', order_by: 'popularity', sort: 'asc' });
  assert.equal(search.toString(), 'https://api.jikan.moe/v4/anime?page=2&limit=24&q=Naruto&type=tv&status=upcoming&order_by=popularity&sort=asc');
  assert.equal(getJikanRequestUrl({ resource: 'top' }).pathname, '/v4/top/anime');
  assert.equal(getJikanRequestUrl({ resource: 'upcoming' }).pathname, '/v4/seasons/upcoming');
  assert.equal(getJikanRequestUrl({ resource: 'detail', id: '20' }).pathname, '/v4/anime/20/full');
  assert.equal(getJikanRequestUrl({ resource: 'https://example.test' }), null);
});
