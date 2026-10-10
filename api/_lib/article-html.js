import sanitizeHtml from 'sanitize-html';
import { getArticlePath, isValidArticleSlug } from '../../js/article-url.js';
import { getAnimePath, isValidAnimeSlug } from '../../js/anime-url.js';

export const SITE_ORIGIN = 'https://www.animoro.in';

const ARTICLE_CONTENT_TAGS = [
  'a', 'b', 'blockquote', 'br', 'caption', 'code', 'del', 'div', 'em',
  'figcaption', 'figure', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img',
  'ins', 'li', 'ol', 'p', 'pre', 's', 'span', 'strong', 'sub', 'sup',
  'table', 'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul',
];

const ARTICLE_CONTENT_ATTRIBUTES = {
  '*': ['class'],
  a: ['href', 'name', 'rel', 'target', 'title'],
  img: ['alt', 'decoding', 'height', 'loading', 'src', 'width'],
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

function getPublishedDate(post) {
  return post.publishedAt || post.createdAt || null;
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
    : 'Animoro Editor';
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
    author: { '@type': 'Person', name: authorName },
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
    allowProtocolRelative: false,
    exclusiveFilter: frame => frame.tag === 'img' && !frame.attribs.src,
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

function renderArticleBody(post, canonicalUrl) {
  const category = typeof post.category === 'string' && post.category.trim()
    ? post.category.trim()
    : 'General';
  const publishedDate = getPublishedDate(post);
  const dateTime = toIsoDateTime(publishedDate);
  const visibleDate = formatDate(publishedDate);
  const title = String(post.title || 'Untitled Article');
  const authorName = typeof post.authorName === 'string' && post.authorName.trim()
    ? post.authorName.trim()
    : 'Animoro Editor';
  const coverImage = getSafeCoverSource(post.coverImage);
  const tags = Array.isArray(post.tags)
    ? post.tags
      .filter(tag => typeof tag === 'string' && tag.trim())
      .map(tag => `<span class="tag-chip">#${escapeHtml(tag.trim())}</span>`)
      .join('')
    : '';
  const animeLink = isValidAnimeSlug(post.animeSlug)
    ? `<a href="${escapeHtml(getAnimePath({ slug: post.animeSlug }))}" class="badge-category">${escapeHtml(post.animeTitle || 'Anime')}</a>`
    : '';

  return `${renderBreadcrumbs(post)}
    <header class="article-header">
      <div class="article-header-meta">
        ${post.category ? `<a href="/category.html?category=${encodeURIComponent(category)}" class="badge-category" style="margin-left: 0;">${escapeHtml(category)}</a>` : `<span class="badge-category" style="margin-left: 0;">${escapeHtml(category)}</span>`}
        ${animeLink}
        <span style="color: var(--text-muted); font-size: 0.85rem;">•</span>
        ${visibleDate ? `<time datetime="${escapeHtml(dateTime)}" style="color: var(--text-secondary); font-size: 0.85rem;">${escapeHtml(visibleDate)}</time>` : ''}
      </div>
      <h1 class="article-page-title">${escapeHtml(title)}</h1>
      ${post.excerpt ? `<p class="article-excerpt-lead">${escapeHtml(post.excerpt)}</p>` : ''}
      <div class="article-author-bar">
        <div class="article-author-details">
          <div class="article-author-avatar-lg">${escapeHtml(authorName.charAt(0).toUpperCase())}</div>
          <div>
            <div style="font-weight: 700; color: var(--text-primary);">${escapeHtml(authorName)}</div>
            <div style="font-size: 0.78rem; color: var(--text-muted);">Published in ${escapeHtml(category)}</div>
          </div>
        </div>
      </div>
    </header>
    ${coverImage ? `<div class="article-cover-wrap"><img class="article-cover-img" src="${escapeHtml(coverImage)}" alt="${escapeHtml(title)} cover" width="1600" height="900" loading="eager" fetchpriority="high" decoding="async" referrerpolicy="no-referrer" /></div>` : ''}
    <main class="article-content-container" id="articleBody">
      ${sanitizeArticleContent(post.content)}
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
    </main>`;
}

function renderRelatedArticles(posts, currentId) {
  if (!Array.isArray(posts) || posts.length === 0) return '';

  const cards = posts
    .filter(post => post.id !== currentId && isValidArticleSlug(post.slug))
    .slice(0, 6)
    .map(post => {
      const path = getArticlePath(post);
      const title = String(post.title || 'Untitled Article');
      const image = getSafeCoverSource(post.coverImage);
      return `<article class="article-card">
        <a href="${escapeHtml(path)}" class="card-img-wrap">
          ${image ? `<img class="card-img" src="${escapeHtml(image)}" alt="${escapeHtml(title)}" width="800" height="450" loading="lazy" decoding="async" />` : ''}
          <span class="card-category-badge">${escapeHtml(post.category || 'General')}</span>
        </a>
        <div class="card-body">
          <h3 class="card-title"><a href="${escapeHtml(path)}">${escapeHtml(title)}</a></h3>
          ${post.excerpt ? `<p class="card-excerpt">${escapeHtml(post.excerpt)}</p>` : ''}
          <div class="card-footer"><a href="${escapeHtml(path)}" style="color: var(--accent-crimson); font-weight: 600;">Read article</a></div>
        </div>
      </article>`;
    })
    .join('');

  return cards;
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
  const renderedRelated = renderRelatedArticles(relatedPosts, id);

  let html = replaceMarker(template, '<!-- ARTICLE_SEO_METADATA -->', metadata.metadataHtml);
  html = replaceMarker(
    html,
    '<!-- ARTICLE_STRUCTURED_DATA -->',
    metadata.structuredData
      .map((item, index) => `<script id="${index === 0 ? 'articleJsonLd' : 'articleBreadcrumbJsonLd'}" type="application/ld+json">${escapeJson(item)}</script>`)
      .join('\n  ')
  );
  html = replaceMarker(html, '<!-- ARTICLE_BODY -->', renderArticleBody(post, canonicalUrl));
  html = replaceMarker(html, '<!-- ARTICLE_RELATED -->', renderedRelated);
  html = replaceMarker(
    html,
    '<!-- ARTICLE_CLIENT_DATA -->',
    `<script id="serverRenderedArticleData" type="application/json">${createClientArticleData(id, canonicalUrl)}</script>`
  );
  if (renderedRelated) {
    html = html.replace(
      'id="relatedSection" style="display: none;',
      'id="relatedSection" style="'
    );
  }
  return html;
}
