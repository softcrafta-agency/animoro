import assert from 'node:assert/strict';
import test from 'node:test';
import { createSitemapHandler } from '../sitemap.js';

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
      return body;
    },
  };
}

test('sitemap requests do not generate or persist missing slugs', async () => {
  const records = {
    posts: [
      { id: 'missing-post-slug', title: 'Post without stored slug', status: 'published' },
      { id: 'valid-post', title: 'Valid post', slug: 'valid-post', status: 'published' },
    ],
    anime: [
      { id: 'missing-anime-slug', title: 'Anime without stored slug', visibility: 'published' },
      { id: 'valid-anime', title: 'Valid anime', slug: 'valid-anime', visibility: 'published' },
    ],
  };
  const firestore = {
    collection(name) {
      return {
        where() { return this; },
        async get() {
          return {
            docs: records[name].map(record => ({
              id: record.id,
              data: () => record,
            })),
          };
        },
      };
    },
    batch() {
      throw new Error('Sitemap generation must not write Firestore records.');
    },
  };
  const handler = createSitemapHandler({ getServices: () => ({ firestore }) });
  const response = createResponse();

  await handler({ method: 'GET' }, response);

  assert.equal(response.statusCode, 200);
  assert.match(response.headers['content-type'], /application\/xml/);
  assert.match(response.body, /blog\.html\/valid-post/);
  assert.match(response.body, /anime\.html\/valid-anime/);
  assert.doesNotMatch(response.body, /post-without-stored-slug|anime-without-stored-slug/);
});
