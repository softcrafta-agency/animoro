import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { renderArticleDocument, sanitizeArticleContent } from './article-html.js';

const template = await readFile(new URL('../../blog.html', import.meta.url), 'utf8');

test('renders published article content, metadata, canonical URL, and structured data', () => {
  const html = renderArticleDocument(template, {
    id: 'article-1',
    title: 'A <Great> Anime Story',
    slug: 'great-anime-story',
    excerpt: 'A useful summary.',
    category: 'Anime & Manga',
    content: '<h2>Story</h2><p>Real article <strong>body</strong>.</p>',
    authorName: 'Editor One',
    coverImage: 'https://images.example.test/cover.webp',
    publishedAt: new Date('2026-10-01T10:00:00Z'),
    updatedAt: new Date('2026-10-03T10:00:00Z'),
    tags: ['analysis'],
  });

  assert.match(html, /<h1 class="article-page-title">A &lt;Great&gt; Anime Story<\/h1>/);
  assert.match(html, /<a href="\/blogs\.html">Articles<\/a>/);
  assert.doesNotMatch(html, /href="blogs\.html"/);
  assert.match(html, /Real article <strong>body<\/strong>\./);
  assert.match(html, /Editor One/);
  assert.match(html, /https:\/\/images\.example\.test\/cover\.webp/);
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.animoro\.in\/blog\.html\/great-anime-story"/);
  assert.match(html, /<meta property="og:title" content="A &lt;Great&gt; Anime Story"/);
  assert.match(html, /"@type":"BlogPosting"/);
  assert.match(html, /"@type":"BreadcrumbList"/);
  assert.match(html, /"datePublished":"2026-10-01T10:00:00\.000Z"/);
  assert.match(html, /"dateModified":"2026-10-03T10:00:00\.000Z"/);
});

test('sanitizes executable article markup and safely serializes attacker-controlled metadata', () => {
  const html = renderArticleDocument(template, {
    id: 'article-2',
    title: '</title><script>alert(1)</script>',
    slug: 'safe-title',
    excerpt: '<img src=x onerror=alert(1)>',
    content: '<p onclick="alert(1)">Safe</p><script>alert(1)</script><img src="javascript:alert(1)" onerror="alert(1)"><a href="javascript:alert(1)">bad link</a><a href="https://example.test" target="_blank">safe link</a>',
    authorName: '<svg onload=alert(1)>Author</svg>',
    coverImage: 'javascript:alert(1)',
  });

  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  const safeBody = sanitizeArticleContent('<p onclick="alert(1)">Safe</p><script>alert(1)</script><img src="javascript:alert(1)" onerror="alert(1)"><a href="javascript:alert(1)">bad link</a>');
  assert.doesNotMatch(safeBody, /onerror=|onclick=|javascript:/i);
  assert.doesNotMatch(safeBody, /<script/i);
  assert.match(html, /&lt;\/title&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;svg onload=alert\(1\)&gt;Author&lt;\/svg&gt;/);
  assert.match(html, /<a href="https:\/\/example\.test" target="_blank" rel="noopener noreferrer">safe link<\/a>/);
  assert.match(html, /"canonicalUrl":"https:\/\/www\.animoro\.in\/blog\.html\/safe-title"/);
  assert.match(html, /"headline":"\\u003c\/title\\u003e/);
});

test('renders related links only for valid published article slugs', () => {
  const html = renderArticleDocument(template, {
    id: 'article-1',
    title: 'Current',
    slug: 'current',
    category: 'Reviews',
    content: '<p>Article.</p>',
  }, [
    { id: 'article-1', title: 'Current', slug: 'current', status: 'published' },
    { id: 'article-2', title: 'Related', slug: 'related', status: 'published' },
    { id: 'article-3', title: 'Invalid', slug: 'not valid', status: 'published' },
  ]);

  assert.match(html, /<a href="\/blog\.html\/related">Related<\/a>/);
  assert.doesNotMatch(html, /not%20valid|not valid/);
  assert.doesNotMatch(html, /ARTICLE_(?:SEO_METADATA|STRUCTURED_DATA|BODY|RELATED|CLIENT_DATA)/);
});

test('preserves bounded legacy raster data URLs without allowing active image types', () => {
  const dataImage = 'data:image/webp;base64,UklGRg==';
  const html = renderArticleDocument(template, {
    id: 'article-legacy-image',
    title: 'Legacy cover',
    slug: 'legacy-cover',
    content: '<p>Article.</p>',
    coverImage: dataImage,
  });
  const activeImage = renderArticleDocument(template, {
    id: 'article-active-image',
    title: 'Active cover',
    slug: 'active-cover',
    content: '<p>Article.</p>',
    coverImage: 'data:image/svg+xml;base64,PHN2Zy8+',
  });

  assert.match(html, /src="data:image\/webp;base64,UklGRg=="/);
  assert.doesNotMatch(activeImage, /data:image\/svg\+xml/);
});
