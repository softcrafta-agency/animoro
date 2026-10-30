import assert from 'node:assert/strict';
import test from 'node:test';
import { selectPopularAnime } from './anime-popular.js';

test('selects published rated anime with stable sorting and no duplicate IDs or slugs', () => {
  const selected = selectPopularAnime([
    { id: 'b', slug: 'second', title: 'Second', rating: 9.2, visibility: 'published' },
    { id: 'a', slug: 'first', title: 'First', rating: 9.2, visibility: 'published' },
    { id: 'duplicate-id', slug: 'first', title: 'Duplicate slug', rating: 10, visibility: 'published' },
    { id: 'draft', slug: 'draft', title: 'Draft', rating: 10, visibility: 'draft' },
    { id: 'unrated', slug: 'unrated', title: 'Unrated', visibility: 'published' },
    { id: 'invalid-rating', slug: 'invalid-rating', rating: 12, visibility: 'published' },
  ]);

  assert.deepEqual(selected.map(anime => anime.id), ['a', 'b']);
});
