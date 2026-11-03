import assert from 'node:assert/strict';
import test from 'node:test';
import { getTenraiRequestUrl } from './tenrai.js';

test('Tenrai current-season requests use the documented endpoint and filters', () => {
  const url = getTenraiRequestUrl({
    resource: 'now',
    page: '2',
    limit: '50',
    filter: 'tv',
  });

  assert.equal(url.pathname, '/v1/seasons/now');
  assert.equal(url.searchParams.get('page'), '2');
  assert.equal(url.searchParams.get('limit'), '50');
  assert.equal(url.searchParams.get('filter'), 'tv');
});

test('Tenrai requested-season requests require a valid season and year', () => {
  const url = getTenraiRequestUrl({
    resource: 'season',
    year: '2026',
    season: 'fall',
    page: '1',
    limit: '24',
  });

  assert.equal(url.pathname, '/v1/seasons/2026/fall');
  assert.throws(
    () => getTenraiRequestUrl({ resource: 'season', year: '2026', season: 'monsoon' }),
    error => error.status === 400
  );
});

test('Tenrai anime requests preserve combined filters and normalize completed status', () => {
  const url = getTenraiRequestUrl({
    resource: 'anime',
    page: '2',
    limit: '24',
    q: 'Your Name',
    type: 'movie',
    status: 'completed',
    genres: '22',
    order_by: 'score',
    sort: 'desc',
  });

  assert.equal(url.pathname, '/v1/anime');
  assert.equal(url.searchParams.get('page'), '2');
  assert.equal(url.searchParams.get('limit'), '24');
  assert.equal(url.searchParams.get('q'), 'Your Name');
  assert.equal(url.searchParams.get('type'), 'movie');
  assert.equal(url.searchParams.get('status'), 'complete');
  assert.equal(url.searchParams.get('genres'), '22');
  assert.equal(url.searchParams.get('order_by'), 'score');
  assert.equal(url.searchParams.get('sort'), 'desc');
});

test('Tenrai rejects unsupported genre IDs instead of forwarding an unfiltered request', () => {
  assert.throws(
    () => getTenraiRequestUrl({ resource: 'anime', genres: '999' }),
    error => error.status === 400 && /unsupported genre ID/i.test(error.message)
  );
  assert.throws(
    () => getTenraiRequestUrl({ resource: 'anime', genres: '1,999' }),
    error => error.status === 400 && /unsupported genre ID/i.test(error.message)
  );
});
