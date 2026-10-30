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
    ]
  );

  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(xml, /<loc>https:\/\/www\.animoro\.in\/<\/loc>/);
  assert.match(xml, /https:\/\/www\.animoro\.in\/blogs\.html/);
  assert.doesNotMatch(xml, /https:\/\/www\.animoro\.in\/anime(?:\/|\.html|-calendar)/);
  assert.doesNotMatch(xml, /https:\/\/www\.animoro\.in\/upcoming-anime\.html/);
  assert.match(xml, /https:\/\/www\.animoro\.in\/about\.html/);
  assert.match(xml, /https:\/\/www\.animoro\.in\/contact\.html/);
  assert.match(xml, /https:\/\/www\.animoro\.in\/privacy\.html/);
  assert.doesNotMatch(xml, /search\.html/);
  assert.match(xml, /category\.html\?category=Anime%20%26%20Manga/);
  assert.match(xml, /\/blog\/first-post/);
  assert.match(xml, /\/blog\/second-post/);
  assert.doesNotMatch(xml, /blog\.html\//);
  assert.match(xml, /<lastmod>2026-10-01<\/lastmod>/);
  assert.match(xml, /<lastmod>2026-09-30<\/lastmod>/);
  assert.doesNotMatch(xml, /draft-1|not-public|category=Private/);
  assert.equal((xml.match(/<loc>/g) || []).length, 9);
});

test('escapes XML characters in public URLs and omits invalid lastmod values', () => {
  const xml = buildSitemap([{
      id: 'post&<"one',
      slug: 'safe-story',
      status: 'published',
      category: 'Drama & <Reviews>',
      updatedAt: 'not a date',
      publishedAt: null,
      createdAt: undefined,
    }]);

  assert.match(xml, /\/blog\/safe-story/);
  assert.match(xml, /category=Drama%20%26%20%3CReviews%3E/);
  assert.doesNotMatch(xml, /<lastmod>/);
  assert.doesNotMatch(xml, /<loc>[^<]*&(?!amp;|lt;|gt;|quot;|apos;)/);
  assert.equal((xml.match(/<loc>/g) || []).length, 7);
});

test('deduplicates category and URL entries', () => {
  const xml = buildSitemap([
    { id: 'same', slug: 'same-post', status: 'published', category: 'Reviews' },
    { id: 'another', slug: 'same-post', status: 'published', category: 'Reviews' },
  ]);

  assert.equal((xml.match(/category\.html\?category=Reviews/g) || []).length, 1);
  assert.equal((xml.match(/\/blog\/same-post/g) || []).length, 1);
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

test('sitemap excludes published records without a stored public slug', () => {
  const xml = buildSitemap([
    { id: 'secret-document-id', title: 'Kagurabachi Anime News', status: 'published' },
    { id: 'valid-post', title: 'Kagurabachi Anime News', slug: 'kagurabachi-news', status: 'published' },
  ]);

  assert.match(xml, /\/blog\/kagurabachi-news/);
  assert.doesNotMatch(xml, /kagurabachi-anime-news/);
  assert.doesNotMatch(xml, /secret-document-id|\?id=/);
});

test('excludes invalid stored slugs instead of emitting synthetic sitemap URLs', () => {
  const xml = buildSitemap([
    { id: 'invalid-article', title: 'Article without a valid slug', slug: '../invalid', status: 'published' },
  ]);

  assert.doesNotMatch(xml, /\/blog\/article-without-a-valid-slug/);
});

test('normalizes article titles into URL-safe slugs', () => {
  assert.equal(
    normalizeArticleSlug('Kagurabachi Anime: Release Date, Story, Characters, Powers & Everything You Need to Know'),
    'kagurabachi-anime-release-date-story-characters-powers-everything-you-need-to-know'
  );
  assert.equal(normalizeArticleSlug(' --Naruto   News-- '), 'naruto-news');
});

test('excludes deleted anime and Upcoming Anime route families', () => {
  const xml = buildSitemap([
    { id: 'post', slug: 'article', status: 'published', title: 'Anime article' },
  ]);

  assert.doesNotMatch(xml, /\/anime(?:\/|\.html|-calendar)|\/upcoming-anime/);
});
