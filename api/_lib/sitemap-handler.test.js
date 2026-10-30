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
  const queriedCollections = [];
  const records = {
    posts: [
      { id: 'missing-post-slug', title: 'Post without stored slug', status: 'published' },
      { id: 'valid-post', title: 'Valid post', slug: 'valid-post', status: 'published' },
    ],
  };
  const firestore = {
    collection(name) {
      queriedCollections.push(name);
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
  assert.match(response.body, /\/blog\/valid-post/);
  assert.doesNotMatch(response.body, /blog\.html\//);
  assert.doesNotMatch(response.body, /\/anime(?:\/|\.html|-calendar)|\/upcoming-anime/);
  assert.doesNotMatch(response.body, /post-without-stored-slug/);
  assert.deepEqual(queriedCollections, ['posts']);
});

test('sitemap reflects Firestore publication and deletion on each uncached request', async () => {
  let publishedPosts = [
    { id: 'new-post', slug: 'new-post', status: 'published', updatedAt: new Date('2026-10-22T00:00:00Z') },
  ];
  const firestore = {
    collection(name) {
      return {
        where() { return this; },
        async get() {
          const records = name === 'posts' ? publishedPosts : [];
          return { docs: records.map(record => ({ data: () => record })) };
        },
      };
    },
  };
  const handler = createSitemapHandler({ getServices: () => ({ firestore }) });
  const publishedResponse = createResponse();

  await handler({ method: 'GET' }, publishedResponse);
  assert.equal(publishedResponse.statusCode, 200);
  assert.equal(publishedResponse.headers['cache-control'], 'no-store');
  assert.match(publishedResponse.body, /https:\/\/www\.animoro\.in\/blog\/new-post/);

  publishedPosts = [];
  const deletedResponse = createResponse();
  await handler({ method: 'GET' }, deletedResponse);

  assert.equal(deletedResponse.statusCode, 200);
  assert.doesNotMatch(deletedResponse.body, /\/blog\/new-post/);
});
