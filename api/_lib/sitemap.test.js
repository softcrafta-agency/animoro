import assert from 'node:assert/strict';
import test from 'node:test';
import { assignPostSlugs, buildSitemap } from './sitemap.js';
import { normalizeArticleSlug } from '../../js/article-url.js';

test('builds a sitemap with public URLs and excludes unpublished posts', () => {
  const xml = buildSitemap(
    [
      {
        id: 'post-1',
        slug: 'first-post',
        status: 'published',
        category: 'Anime & Manga',
        updatedAt: new Date('2026-10-01T13:45:00Z'),
      },
      {
        id: 'post-2',
        slug: 'second-post',
        status: 'published',
        category: 'Reviews',
        publishedAt: { toDate: () => new Date('2026-09-30T23:59:59Z') },
      },
      {
        id: 'draft-1',
        slug: 'not-public',
        status: 'draft',
        category: 'Private',
      },
    ],
    [
      { name: 'Anime & Manga' },
      { name: 'Reviews' },
      { name: 'Unused Category' },
    ]
  );

  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(xml, /<loc>https:\/\/www\.animoro\.in\/<\/loc>/);
  assert.match(xml, /https:\/\/www\.animoro\.in\/blogs\.html/);
  assert.match(xml, /https:\/\/www\.animoro\.in\/about\.html/);
  assert.match(xml, /https:\/\/www\.animoro\.in\/contact\.html/);
  assert.match(xml, /https:\/\/www\.animoro\.in\/search\.html/);
  assert.match(xml, /category\.html\?category=Anime%20%26%20Manga/);
  assert.match(xml, /category\.html\?category=Unused%20Category/);
  assert.match(xml, /blog\.html\/first-post/);
  assert.match(xml, /blog\.html\/second-post/);
  assert.match(xml, /<lastmod>2026-10-01<\/lastmod>/);
  assert.match(xml, /<lastmod>2026-09-30<\/lastmod>/);
  assert.doesNotMatch(xml, /draft-1|not-public|category=Private/);
  assert.equal((xml.match(/<loc>/g) || []).length, 10);
});

test('escapes XML characters in public URLs and omits invalid lastmod values', () => {
  const xml = buildSitemap(
    [{
      id: 'post&<"one',
      status: 'published',
      category: 'Drama & <Reviews>',
      updatedAt: 'not a date',
      publishedAt: null,
      createdAt: undefined,
    }],
    []
  );

  assert.match(xml, /blog\.html\/article/);
  assert.match(xml, /category=Drama%20%26%20%3CReviews%3E/);
  assert.doesNotMatch(xml, /<lastmod>/);
  assert.doesNotMatch(xml, /<loc>[^<]*&(?!amp;|lt;|gt;|quot;|apos;)/);
  assert.equal((xml.match(/<loc>/g) || []).length, 7);
});

test('deduplicates category and URL entries', () => {
  const xml = buildSitemap(
    [
      { id: 'same', slug: 'same-post', status: 'published', category: 'Reviews' },
      { id: 'another', slug: 'same-post', status: 'published', category: 'Reviews' },
    ],
    [{ name: 'Reviews' }, { name: 'Reviews' }]
  );

  assert.equal((xml.match(/category\.html\?category=Reviews/g) || []).length, 1);
  assert.equal((xml.match(/blog\.html\/same-post/g) || []).length, 1);
});

test('generates unique slugs for published posts without replacing existing valid slugs', () => {
  const posts = assignPostSlugs([
    { id: 'existing', title: 'Renamed title', slug: 'keep-this-slug', status: 'published' },
    { id: 'first', title: 'Naruto News', status: 'published' },
    { id: 'second', title: 'Naruto News', status: 'published' },
    { id: 'collision', title: 'Another article', slug: 'naruto-news-2', status: 'published' },
  ]);

  assert.deepEqual(posts.map(post => post.slug), [
    'keep-this-slug',
    'naruto-news',
    'naruto-news-3',
    'naruto-news-2',
  ]);
});

test('sitemap emits slug paths without exposing document IDs', () => {
  const xml = buildSitemap([
    { id: 'secret-document-id', title: 'Kagurabachi Anime News', status: 'published' },
  ], []);

  assert.match(xml, /blog\.html\/kagurabachi-anime-news/);
  assert.doesNotMatch(xml, /secret-document-id|\?id=/);
});

test('normalizes article titles into URL-safe slugs', () => {
  assert.equal(
    normalizeArticleSlug('Kagurabachi Anime: Release Date, Story, Characters, Powers & Everything You Need to Know'),
    'kagurabachi-anime-release-date-story-characters-powers-everything-you-need-to-know'
  );
  assert.equal(normalizeArticleSlug(' --Naruto   News-- '), 'naruto-news');
});
