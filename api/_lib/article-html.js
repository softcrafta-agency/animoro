import sanitizeHtml from 'sanitize-html';
import { getArticlePath, isValidArticleSlug } from '../../js/article-url.js';
import { getAnimePath, isValidAnimeSlug } from '../../js/anime-url.js';

export const SITE_ORIGIN = 'https://www.animoro.in';

const ARTICLE_CONTENT_TAGS = [
  'a', 'b', 'blockquote', 'br', 'caption', 'code', 'del', 'div', 'em',
  'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'iframe', 'img',
  'ins', 'li', 'ol', 'p', 'pre', 's', 'span', 'strong', 'sub', 'sup',
  'table', 'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul',
];

const ARTICLE_CONTENT_ATTRIBUTES = {
  '*': ['class', 'style'],
  a: ['href', 'name', 'rel', 'target', 'title'],
  figure: ['class'],
  h1: ['id'],
  h2: ['id'],
  h3: ['id'],
  h4: ['id'],
  h5: ['id'],
  h6: ['id'],
  img: ['alt', 'decoding', 'height', 'loading', 'src', 'width'],
  iframe: ['allow', 'allowfullscreen', 'height', 'loading', 'referrerpolicy', 'src', 'title', 'width'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan'],
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function toIsoDateTime(value) {
  if (value == null) return null;

  try {
    const date = typeof value.toDate === 'function'
      ? value.toDate()
      : value instanceof Date
        ? value
        : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  } catch {
    return null;
  }
}

function getSafeImageUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';

  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function getSafeCoverSource(value) {
  const imageUrl = getSafeImageUrl(value);
  if (imageUrl) return imageUrl;
  if (typeof value !== 'string' || value.length > 1_200_000) return '';
  return /^data:image\/(?:webp|png|jpeg);base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/i.test(value)
    ? value
    : '';
}

function formatDate(value) {
  const dateTime = toIsoDateTime(value);
  if (!dateTime) return '';
  return new Date(dateTime).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function getReadingTime(content) {
  const text = content
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:#\d+|#x[\da-f]+|[a-z]+);/gi, ' ')
    .trim();
  const wordCount = text ? text.split(/\s+/).length : 0;
  return Math.max(1, Math.ceil(wordCount / 200));
}

function getPublishedDate(post) {
  return post.publishedAt || null;
}

function getArticleMetadata(post, canonicalUrl, publisherLogoUrl) {
  const title = typeof post.seoTitle === 'string' && post.seoTitle.trim()
    ? post.seoTitle.trim()
    : String(post.title || 'Animoro Article');
  const description = typeof post.seoDescription === 'string' && post.seoDescription.trim()
    ? post.seoDescription.trim()
    : typeof post.excerpt === 'string' && post.excerpt.trim()
      ? post.excerpt.trim()
      : String(post.title || 'Read the latest anime articles from Animoro.');
  const image = getSafeImageUrl(post.coverImage);
  const datePublished = toIsoDateTime(getPublishedDate(post));
  const dateModified = toIsoDateTime(post.updatedAt);
  const authorName = typeof post.authorName === 'string' && post.authorName.trim()
    ? post.authorName.trim()
    : '';
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: String(post.title || title),
    description: typeof post.excerpt === 'string' && post.excerpt.trim()
      ? post.excerpt.trim()
      : description,
    url: canonicalUrl,
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
    publisher: {
      '@type': 'Organization',
      name: 'Animoro',
      url: `${SITE_ORIGIN}/`,
      logo: {
        '@type': 'ImageObject',
        url: publisherLogoUrl,
      },
    },
    ...(authorName ? { author: { '@type': 'Person', name: authorName } } : {}),
    ...(image ? { image: [image] } : {}),
    ...(datePublished ? { datePublished } : {}),
    ...(dateModified ? { dateModified } : {}),
    ...(typeof post.category === 'string' && post.category.trim()
      ? { articleSection: post.category.trim() }
      : {}),
  };

  const breadcrumbs = [
    { name: 'Home', item: `${SITE_ORIGIN}/` },
    { name: 'Articles', item: `${SITE_ORIGIN}/blogs.html` },
  ];
  if (typeof post.category === 'string' && post.category.trim()) {
    breadcrumbs.push({
      name: post.category.trim(),
      item: `${SITE_ORIGIN}/category.html?category=${encodeURIComponent(post.category.trim())}`,
    });
  }
  breadcrumbs.push({ name: String(post.title || title), item: canonicalUrl });

  return {
    title,
    description,
    image,
    datePublished,
    dateModified,
    authorName,
    metadataHtml: [
      `<title>${escapeHtml(title)} — Animoro</title>`,
      `<meta name="description" content="${escapeHtml(description)}" />`,
      '<meta name="robots" content="index, follow" />',
      '<meta property="og:type" content="article" />',
      `<meta property="og:title" content="${escapeHtml(title)}" />`,
      `<meta property="og:description" content="${escapeHtml(description)}" />`,
      `<meta property="og:url" content="${escapeHtml(canonicalUrl)}" />`,
      ...(image ? [`<meta property="og:image" content="${escapeHtml(image)}" />`] : []),
      `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />`,
      `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
      `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
      ...(image ? [`<meta name="twitter:image" content="${escapeHtml(image)}" />`] : []),
      `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`,
    ].join('\n  '),
    structuredData: [
      schema,
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: breadcrumbs.map((item, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: item.name,
          item: item.item,
        })),
      },
    ],
  };
}

export function sanitizeArticleContent(value) {
  return sanitizeHtml(typeof value === 'string' ? value : '', {
    allowedTags: ARTICLE_CONTENT_TAGS,
    allowedAttributes: ARTICLE_CONTENT_ATTRIBUTES,
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    allowedIframeHostnames: ['www.youtube-nocookie.com', 'www.youtube.com'],
    allowedStyles: {
      '*': {
        'font-size': [/^(?:(?:12|14|16|18|20|24|28|32|36)px|1\.1rem)$/],
        color: [/^(?:#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})|rgba?\(\s*(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\s*,\s*(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\s*,\s*(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\))$/i],
        'background-color': [/^(?:#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})|rgba?\(\s*(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\s*,\s*(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\s*,\s*(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\))$/i],
        'text-align': [/^(?:left|center|right|justify)$/],
      },
    },
    allowProtocolRelative: false,
    exclusiveFilter: frame => (frame.tag === 'img' && !frame.attribs.src) ||
      (frame.tag === 'iframe' && !/^https:\/\/(?:www\.youtube-nocookie\.com|www\.youtube\.com)\/embed\/[A-Za-z0-9_-]{6,20}\/?$/i.test(frame.attribs.src || '')),
    transformTags: {
      a: (tagName, attributes) => ({
        tagName,
        attribs: {
          ...attributes,
          ...(attributes.target === '_blank'
            ? { rel: 'noopener noreferrer' }
            : {}),
        },
      }),
      img: (tagName, attributes) => ({
        tagName,
        attribs: {
          ...attributes,
          alt: attributes.alt?.trim() || 'Article image',
          loading: 'lazy',
          decoding: 'async',
        },
      }),
      h1: (tagName, attributes) => ({
        tagName: 'h2',
        attribs: attributes,
      }),
      iframe: (tagName, attributes) => ({
        tagName,
        attribs: {
          ...attributes,
          src: /^https:\/\/(?:www\.youtube-nocookie\.com|www\.youtube\.com)\/embed\/[A-Za-z0-9_-]{6,20}\/?$/i.test(attributes.src || '')
            ? attributes.src.replace('www.youtube.com', 'www.youtube-nocookie.com')
            : '',
          loading: 'lazy',
          referrerpolicy: 'strict-origin-when-cross-origin',
          allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
          allowfullscreen: '',
        },
      }),
    },
  });
}

function renderBreadcrumbs(post) {
  const crumbs = [
    '<li><a href="/">Home</a></li>',
    '<li><a href="/blogs.html">Articles</a></li>',
  ];
  if (typeof post.category === 'string' && post.category.trim()) {
    crumbs.push(
      `<li><a href="/category.html?category=${encodeURIComponent(post.category.trim())}">${escapeHtml(post.category.trim())}</a></li>`
    );
  }
  crumbs.push(`<li aria-current="page">${escapeHtml(post.title || 'Article')}</li>`);
  return `<nav aria-label="Breadcrumb" class="article-breadcrumbs"><ol>${crumbs.join('')}</ol></nav>`;
}

function renderArticleBody(post, canonicalUrl, relatedPosts, currentId) {
  const category = typeof post.category === 'string' && post.category.trim()
    ? post.category.trim()
    : '';
  const publishedDate = getPublishedDate(post);
  const dateTime = toIsoDateTime(publishedDate);
  const visibleDate = formatDate(publishedDate);
  const title = String(post.title || 'Untitled Article');
  const authorName = typeof post.authorName === 'string' && post.authorName.trim()
    ? post.authorName.trim()
    : '';
  const coverImage = getSafeCoverSource(post.coverImage);
  const articleContent = sanitizeArticleContent(post.content);
  const readingTime = getReadingTime(articleContent);
  const tags = Array.isArray(post.tags)
    ? post.tags
      .filter(tag => typeof tag === 'string' && tag.trim())
      .map(tag => `<span class="tag-chip">#${escapeHtml(tag.trim())}</span>`)
      .join('')
    : '';
  const animeLink = isValidAnimeSlug(post.animeSlug)
    ? `<a href="${escapeHtml(getAnimePath({ slug: post.animeSlug }))}" class="badge-category">${escapeHtml(post.animeTitle || 'Anime')}</a>`
    : '';
  const relatedHtml = renderRelatedArticles(relatedPosts, currentId);

  return `${renderBreadcrumbs(post)}
    <header class="article-header${coverImage ? ' has-cover' : ''}">
      <div class="article-intro-copy">
        <div class="article-header-meta">
          ${category ? `<a href="/category.html?category=${encodeURIComponent(category)}" class="badge-category">${escapeHtml(category)}</a>` : ''}
          ${animeLink}
          ${visibleDate ? `<time datetime="${escapeHtml(dateTime)}">${escapeHtml(visibleDate)}</time>` : ''}
        </div>
        <h1 class="article-page-title">${escapeHtml(title)}</h1>
        ${post.excerpt ? `<p class="article-excerpt-lead">${escapeHtml(post.excerpt)}</p>` : ''}
        <div class="article-author-bar">
          ${authorName ? `<div class="article-author-details">
            <div class="article-author-avatar-lg" aria-hidden="true">${escapeHtml(authorName.charAt(0).toUpperCase())}</div>
            <span class="article-author-name">${escapeHtml(authorName)}</span>
          </div>` : ''}
          <span class="article-reading-time">${readingTime} min read</span>
        </div>
      </div>
      ${coverImage ? `<div class="article-cover-wrap"><img class="article-cover-img" src="${escapeHtml(coverImage)}" alt="${escapeHtml(title)} cover" width="1600" height="900" loading="eager" fetchpriority="high" decoding="async" referrerpolicy="no-referrer" /></div>` : ''}
    </header>
    <div class="article-reading-progress" role="progressbar" aria-label="Article reading progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="0% read">
      <span class="article-reading-progress-label">Reading progress</span>
      <span class="article-reading-progress-value">0%</span>
      <div class="article-reading-progress-track"><span></span></div>
    </div>
    <div class="article-reading-layout" id="articleReadingLayout">
      <main class="article-content-container" id="articleBody">
        ${articleContent}
        ${tags ? `<div class="article-tags-wrap"><span style="font-weight: 600; color: var(--text-muted); font-size: 0.85rem;">TAGS:</span> ${tags}</div>` : ''}
        <div class="article-share-bar">
        <span style="font-weight: 600; font-size: 0.88rem; color: var(--text-muted);">SHARE ARTICLE:</span>
        <button class="share-btn" id="copyShareBtn" type="button">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          <span id="copyBtnText">Copy Link</span>
        </button>
        <a class="share-btn" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&amp;url=${encodeURIComponent(canonicalUrl)}" target="_blank" rel="noopener noreferrer">Twitter / X</a>
        <a class="share-btn" href="https://reddit.com/submit?url=${encodeURIComponent(canonicalUrl)}&amp;title=${encodeURIComponent(title)}" target="_blank" rel="noopener noreferrer">Reddit</a>
        </div>
      </main>
    </div>
    ${relatedHtml}`;
}

function renderRelatedArticles(posts, currentId) {
  if (!Array.isArray(posts) || posts.length === 0) return '';

  const seenSlugs = new Set();
  const cards = posts
    .filter(post => {
      if (post.id === currentId ||
          post.status !== 'published' ||
          !isValidArticleSlug(post.slug) ||
          typeof post.title !== 'string' ||
          !post.title.trim() ||
          seenSlugs.has(post.slug)) {
        return false;
      }
      seenSlugs.add(post.slug);
      return true;
    })
    .slice(0, 4)
    .map(post => {
      const path = getArticlePath(post);
      const title = post.title.trim();
      const image = getSafeCoverSource(post.coverImage);
      const publishedDate = getPublishedDate(post);
      const dateTime = toIsoDateTime(publishedDate);
      const visibleDate = formatDate(publishedDate);
      return `<a class="article-related-card${image ? '' : ' article-related-card-no-image'}" href="${escapeHtml(path)}">
        ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(title)} article cover" width="800" height="450" loading="lazy" decoding="async" />` : ''}
        <span class="article-related-copy">
          <span class="article-related-title">${escapeHtml(title)}</span>
          ${visibleDate ? `<time datetime="${escapeHtml(dateTime)}">${escapeHtml(visibleDate)}</time>` : ''}
        </span>
      </a>`;
    })
    .join('');

  return cards
    ? `<section class="article-related-section" id="articleRelatedSection" aria-labelledby="articleRelatedHeading">
        <h2 id="articleRelatedHeading">Related Articles</h2>
        <div class="article-related-grid" id="relatedArticlesContainer">${cards}</div>
      </section>`
    : '';
}

function createClientArticleData(id, canonicalUrl) {
  return escapeJson({ id, canonicalUrl });
}

function replaceMarker(template, marker, content) {
  const firstIndex = template.indexOf(marker);
  if (firstIndex < 0 || template.indexOf(marker, firstIndex + marker.length) >= 0) {
    throw new Error(`Expected exactly one ${marker} marker in the article template.`);
  }
  return template.replace(marker, content);
}

export function renderArticleDocument(template, article, relatedPosts = []) {
  const post = article.post || article;
  const id = article.id || post.id || '';
  if (!isValidArticleSlug(post.slug)) {
    throw new Error('Cannot render a public article without a valid stored slug.');
  }
  const canonicalUrl = new URL(getArticlePath(post), `${SITE_ORIGIN}/`).toString();
  const publisherLogoUrl = new URL('/logo.png', `${SITE_ORIGIN}/`).toString();
  const metadata = getArticleMetadata(post, canonicalUrl, publisherLogoUrl);

  let html = replaceMarker(template, '<!-- ARTICLE_SEO_METADATA -->', metadata.metadataHtml);
  html = replaceMarker(
    html,
    '<!-- ARTICLE_STRUCTURED_DATA -->',
    metadata.structuredData
      .map((item, index) => `<script id="${index === 0 ? 'articleJsonLd' : 'articleBreadcrumbJsonLd'}" type="application/ld+json">${escapeJson(item)}</script>`)
      .join('\n  ')
  );
  html = replaceMarker(html, '<!-- ARTICLE_BODY -->', renderArticleBody(post, canonicalUrl, relatedPosts, id));
  html = replaceMarker(
    html,
    '<!-- ARTICLE_CLIENT_DATA -->',
    `<script id="serverRenderedArticleData" type="application/json">${createClientArticleData(id, canonicalUrl)}</script>`
  );
  return html;
}
