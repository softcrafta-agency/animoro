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
