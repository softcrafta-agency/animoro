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
  assert.match(html, /<header class="article-header has-cover">/);
  assert.match(html, /<div class="article-reading-progress" role="progressbar"/);
  assert.match(html, /<div class="article-reading-layout" id="articleReadingLayout">/);
  assert.match(html, /<span class="article-reading-time">1 min read<\/span>/);
  assert.match(html, /<a href="\/blogs\.html">Articles<\/a>/);
  assert.doesNotMatch(html, /href="blogs\.html"/);
  assert.match(html, /Real article <strong>body<\/strong>\./);
  assert.match(html, /Editor One/);
  assert.match(html, /https:\/\/images\.example\.test\/cover\.webp/);
  assert.match(html, /class="article-cover-img"[^>]+loading="eager" fetchpriority="high"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.animoro\.in\/blog\/great-anime-story"/);
  assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
  assert.match(html, /"url":"https:\/\/www\.animoro\.in\/logo\.png"/);
  assert.match(html, /<meta property="og:title" content="A &lt;Great&gt; Anime Story"/);
  assert.match(html, /"@type":"BlogPosting"/);
  assert.match(html, /"@type":"BreadcrumbList"/);
  assert.match(html, /"datePublished":"2026-10-01T10:00:00\.000Z"/);
  assert.match(html, /"dateModified":"2026-10-03T10:00:00\.000Z"/);
});

test('does not display missing author, category, or publication metadata', () => {
  const html = renderArticleDocument(template, {
    id: 'article-without-display-metadata',
    title: 'Article Without Display Metadata',
    slug: 'article-without-display-metadata',
    content: '<p>Body text.</p>',
    createdAt: new Date('2026-10-01T10:00:00Z'),
  });
  const breadcrumbs = html.match(/<nav aria-label="Breadcrumb" class="article-breadcrumbs">([\s\S]*?)<\/nav>/)?.[1] || '';
  const intro = html.match(/<header class="article-header">([\s\S]*?)<\/header>/)?.[1] || '';

  assert.doesNotMatch(breadcrumbs, /category\.html/);
  assert.doesNotMatch(intro, /class="badge-category"|class="article-author-details"|<time datetime=/);
  assert.doesNotMatch(html, /"author":\{"@type":"Person"/);
  assert.doesNotMatch(html, /"datePublished":/);
  assert.match(html, /<title>Article Without Display Metadata — Animoro<\/title>/);
  assert.match(html, /<meta name="description" content="Body text\." \/>/);
});

test('uses SEO metadata independently from the visible headline and escapes fallbacks', () => {
  const html = renderArticleDocument(template, {
    id: 'seo-article',
    title: 'Visible <Headline>',
    slug: 'seo-article',
    excerpt: 'Fallback & summary',
    seoTitle: 'Search <Title>',
    seoDescription: 'SEO & description',
    content: '<p>Body</p>',
  });

  assert.match(html, /<title>Search &lt;Title&gt; — Animoro<\/title>/);
  assert.match(html, /<h1 class="article-page-title">Visible &lt;Headline&gt;<\/h1>/);
  assert.match(html, /<meta name="description" content="SEO &amp; description" \/>/);
  assert.match(html, /<meta property="og:title" content="Search &lt;Title&gt;" \/>/);
});

test('keeps SEO targeting fields private while rendering one canonical H1 and useful metadata', () => {
  const html = renderArticleDocument(template, {
    id: 'keyword-targeted-article',
    title: 'Black Torch Anime Story Explained',
    slug: 'black-torch-story-explained',
    excerpt: 'A reader-focused introduction to Jiro Azuma and the supernatural story.',
    primaryKeyword: 'private focus phrase',
    secondaryKeywords: ['private secondary phrase'],
    searchIntent: 'informational',
    content: '<h2>Who is Jiro Azuma?</h2><p>Black Torch follows a ninja drawn into a supernatural conflict.</p>',
    publishedAt: new Date('2026-10-20T10:00:00Z'),
    updatedAt: new Date('2026-10-21T10:00:00Z'),
  });

  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.match(html, /<h1 class="article-page-title">Black Torch Anime Story Explained<\/h1>/);
  assert.match(html, /<meta name="description" content="A reader-focused introduction to Jiro Azuma and the supernatural story\." \/>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.animoro\.in\/blog\/black-torch-story-explained"/);
  assert.match(html, /"@type":"BlogPosting"/);
  assert.doesNotMatch(html, /private focus phrase|private secondary phrase|informational/);
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
  assert.match(html, /"canonicalUrl":"https:\/\/www\.animoro\.in\/blog\/safe-title"/);
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
    {
      id: 'article-2',
      title: 'Related',
      slug: 'related',
      status: 'published',
      coverImage: 'https://images.example.test/related.webp',
      publishedAt: new Date('2026-10-05T10:00:00Z'),
    },
    { id: 'article-2-copy', title: 'Duplicate slug', slug: 'related', status: 'published' },
    { id: 'article-3', title: 'Invalid', slug: 'not valid', status: 'published' },
    { id: 'article-4', title: 'Unpublished', slug: 'unpublished', status: 'draft' },
  ]);

  assert.match(html, /<a class="article-related-card" href="\/blog\/related">[\s\S]*?Related/);
  assert.match(html, /<section class="article-related-section" id="articleRelatedSection"/);
  assert.ok(html.indexOf('Published Story') < html.indexOf('articleRelatedSection'));
  assert.match(html, /class="article-related-card" href="\/blog\/related"[\s\S]*?loading="lazy"/);
  assert.match(html, /<time datetime="2026-10-05T10:00:00\.000Z">Oct 5, 2026<\/time>/);
  assert.doesNotMatch(html, /not%20valid|not valid|Duplicate slug|Unpublished/);
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

test('preserves supported editor formatting and safe YouTube embeds while filtering unsafe styles and frames', () => {
  const content = sanitizeArticleContent(
    '<h1 id="overview">Overview</h1>' +
    '<p style="font-size:20px;color:#facc15;background-color:#1e293b;text-align:center;position:fixed">Styled <strong>text</strong></p>' +
    '<figure class="article-figure"><img src="https://cdn.example.test/a.webp" alt="Anime scene" width="1200" height="675"><figcaption>Scene caption</figcaption></figure>' +
    '<table><thead><tr><th>Season</th></tr></thead><tbody><tr><td>Spring</td></tr></tbody></table>' +
    '<pre class="article-code-block"><code>const answer = 42;</code></pre>' +
    '<div class="article-toc"><p>In this article</p><ul><li><a href="#overview">Overview</a></li></ul></div>' +
    '<iframe src="https://www.youtube-nocookie.com/embed/abcdefghijk" title="Trailer"></iframe>' +
    '<iframe src="https://evil.example.test/embed/abcdefghijk"></iframe>'
  );

  assert.match(content, /<h2 id="overview">Overview<\/h2>/);
  assert.doesNotMatch(content, /<h1\b/);
  assert.match(content, /font-size:20px/);
  assert.match(content, /color:#facc15/);
  assert.match(content, /background-color:#1e293b/);
  assert.doesNotMatch(content, /position:fixed/);
  assert.match(content, /<figcaption>Scene caption<\/figcaption>/);
  assert.match(content, /loading="lazy"/);
  assert.match(content, /width="1200" height="675"/);
  assert.match(content, /<table>/);
  assert.match(content, /<pre class="article-code-block"><code>const answer = 42;<\/code><\/pre>/);
  assert.match(content, /<a href="#overview">Overview<\/a>/);
  assert.match(content, /<iframe[^>]+src="https:\/\/www\.youtube-nocookie\.com\/embed\/abcdefghijk"/);
  assert.doesNotMatch(content, /evil\.example\.test|<iframe[^>]*src=""/);
});

test('preserves HTTPS image CDN URLs without extensions, dimensions, alt text, and captions', () => {
  const content = sanitizeArticleContent(
    '<figure class="article-figure"><img src="https://cdn.example.test/image?id=123" alt="Anime cover" width="1200" height="675"><figcaption>Cover artwork</figcaption></figure>' +
    '<img src="javascript:alert(1)" alt="Unsafe">' +
    '<img src="data:image/svg+xml;base64,PHN2Zy8+" alt="Active data image">'
  );

  assert.match(content, /src="https:\/\/cdn\.example\.test\/image\?id=123"/);
  assert.match(content, /alt="Anime cover" width="1200" height="675"/);
  assert.match(content, /<figcaption>Cover artwork<\/figcaption>/);
  assert.doesNotMatch(content, /javascript:|data:image\/svg\+xml/);
});
