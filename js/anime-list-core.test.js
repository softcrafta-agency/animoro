import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  chunkAnimeListIds,
  planAnimeListMembership,
  validateAnimeListName,
} from './anime-list-core.js';

test('normalizes and validates named anime lists', () => {
  assert.deepEqual(validateAnimeListName('  Weekend   Watchlist  '), {
    name: 'Weekend Watchlist',
    slug: 'weekend-watchlist',
  });
  assert.deepEqual(validateAnimeListName('Été Anime'), {
    name: 'Été Anime',
    slug: 'ete-anime',
  });
  assert.equal(validateAnimeListName('   ').error, 'Enter a list name.');
  assert.match(validateAnimeListName('a'.repeat(61)).error, /60 characters/);
  assert.match(validateAnimeListName('🌀').error, /letter or number/);
});

test('plans membership without duplicate document IDs', () => {
  assert.deepEqual(
    planAnimeListMembership(['a', 'b', 'b', 'c'], new Set(['b', 'c'])),
    { toAdd: ['a'], alreadyPresent: 2 },
  );
});

test('chunks membership writes and rejects unsafe Firestore batch sizes', () => {
  assert.deepEqual(chunkAnimeListIds(['a', 'b', 'c', 'd', 'e'], 2), [
    ['a', 'b'],
    ['c', 'd'],
    ['e'],
  ]);
  assert.deepEqual(chunkAnimeListIds([], 400), []);
  assert.throws(() => chunkAnimeListIds(['a'], 0), RangeError);
  assert.throws(() => chunkAnimeListIds(['a'], 501), RangeError);
});

test('Firestore rules restrict anime lists and memberships to administrators', async () => {
  const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
  assert.match(
    rules,
    /match \/animeLists\/\{listId\}[\s\S]*?allow get, list, create, update, delete: if isSuperOrDocAdmin\(\);[\s\S]*?match \/members\/\{animeId\}[\s\S]*?allow get, list, create, update, delete: if isSuperOrDocAdmin\(\);/,
  );
});
