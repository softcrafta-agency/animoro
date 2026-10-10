import assert from 'node:assert/strict';
import test from 'node:test';
import { getR2ObjectKey } from './r2.js';
import { findImageReferences } from './image-references.js';

test('accepts only paths under the configured public R2 base URL', () => {
  assert.equal(
    getR2ObjectKey('https://cdn.example.test/assets/articles/123.webp', 'https://cdn.example.test/assets'),
    'articles/123.webp'
  );
  assert.equal(getR2ObjectKey('https://cdn.example.test/articles/123.webp', 'https://cdn.example.test'), 'articles/123.webp');
  assert.equal(getR2ObjectKey('https://evil.example/articles/123.webp', 'https://cdn.example.test'), null);
  assert.equal(getR2ObjectKey('https://cdn.example.test/articles/%2e%2e/secret.webp', 'https://cdn.example.test'), null);
  assert.equal(getR2ObjectKey('https://cdn.example.test/articles/123.svg', 'https://cdn.example.test'), null);
  assert.equal(getR2ObjectKey('http://cdn.example.test/articles/123.webp', 'https://cdn.example.test'), null);
});

test('finds image URLs in cover fields and stored article HTML', async () => {
  const records = {
    posts: [
      { id: 'body-ref', coverImage: '', content: '<img src="https://cdn.example.test/articles/a.webp">' },
      { id: 'cover-ref', coverImage: 'https://cdn.example.test/covers/b.webp', content: '<p>Text</p>' },
    ],
    upcomingAnime: [{ id: 'upcoming-ref', poster: 'https://cdn.example.test/upcoming-anime/x/c.webp' }],
    anime: [{ id: 'unrelated', poster: 'https://cdn.example.test/anime/other.webp' }],
  };
  const firestore = {
    collection(name) {
      return {
        select() {
          return {
            async get() {
              return {
                docs: (records[name] || []).map(record => ({
                  id: record.id,
                  data: () => record,
                })),
              };
            },
          };
        },
      };
    },
  };

  assert.deepEqual(await findImageReferences(firestore, 'https://cdn.example.test/articles/a.webp'), ['posts/body-ref']);
  assert.deepEqual(await findImageReferences(firestore, 'https://cdn.example.test/covers/b.webp'), ['posts/cover-ref']);
  assert.deepEqual(await findImageReferences(firestore, 'https://cdn.example.test/upcoming-anime/x/c.webp'), ['upcomingAnime/upcoming-ref']);
  assert.deepEqual(await findImageReferences(firestore, 'https://cdn.example.test/not-used.webp'), []);
});
