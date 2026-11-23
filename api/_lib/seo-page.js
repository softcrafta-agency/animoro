import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getAdminServices } from './firebase-admin.js';
import { renderArticleList } from './article-list-html.js';
import { getCategoryMetadata } from '../../js/category-seo.js';
import { isValidArticleSlug } from '../../js/article-url.js';
import { getArticleCategories } from '../../js/article-editor-fields.js';
import { getAnimeCanonicalUrl, isValidAnimeDetailSlug } from '../../js/anime-url.js';
import { getUpcomingAnimeCanonicalUrl } from '../../js/upcoming-url.js';
import { normalizeAnime } from '../../js/anime-api.js';
import { getTenraiRequestUrl, isValidTenraiPayload } from './tenrai.js';

const TEMPLATES = {
  anime: resolve(process.cwd(), 'dist', 'anime.html'),
  upcoming: resolve(process.cwd(), 'dist', 'upcoming-anime.html'),
  category: resolve(process.cwd(), 'dist', 'category.html'),
};
const ANIME_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*--([1-9]\d*)$/i;
const TENRAI_TIMEOUT_MS = 10000;
const CATEGORY_PAGE_SIZE = 9;
const MAX_CATEGORY_PAGE = 100;
const DEFAULT_SOCIAL_IMAGE = 'https://www.animoro.in/animoro-logo-social.jpg';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getQueryValue(request, name) {
  const direct = request.query?.[name];
  if (typeof direct === 'string') return direct;
  return new URL(request.url || '/', 'https://www.animoro.in').searchParams.get(name) || '';
}

function sendHtml(response, statusCode, html, cacheControl = 'no-store') {
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.setHeader('Cache-Control', cacheControl);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.statusCode = statusCode;
  return response.end(html);
}

function errorDocument(statusCode) {
  const title = statusCode === 404 ? 'Page Not Found' : 'Page Temporarily Unavailable';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>${title} | Animoro</title></head><body><main><h1>${title}</h1><a href="/">Return to Animoro</a></main></body></html>`;
}

function setMeta(html, attribute, name, content) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expression = new RegExp(`<meta\\s+([^>]*\\b${attribute}\\s*=\\s*(["'])${escapedName}\\2[^>]*)>`, 'i');
  const match = html.match(expression);
  if (!match) {
    const tag = `<meta ${attribute}="${escapeHtml(name)}" content="${escapeHtml(content)}" />`;
    return html.replace(/<\/head>/i, `${tag}\n</head>`);
  }
  return html.replace(expression, (_tag, attributes) => {
    if (/\bcontent\s*=/i.test(attributes)) {
      return `<meta ${attributes.replace(/\bcontent\s*=\s*(["']).*?\1/i, `content="${escapeHtml(content)}"`)}>`;
    }
    return `<meta ${attributes} content="${escapeHtml(content)}">`;
  });
}

function getSeoImageUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch (error) {
    if (error instanceof TypeError) return '';
    throw error;
  }
}

function addStructuredData(html, id, value) {
  const json = JSON.stringify(value).replace(/</g, '\\u003c');
  const script = `<script id="${id}" type="application/ld+json">${json}</script>`;
  return html.replace(/<\/head>/i, `${script}\n</head>`);
}

function createCategoryBreadcrumbSchema(category, canonical) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.animoro.in/' },
      { '@type': 'ListItem', position: 2, name: 'Articles', item: 'https://www.animoro.in/blogs.html' },
      { '@type': 'ListItem', position: 3, name: category, item: canonical },
    ],
  };
}

function setSeoMetadata(template, { title, description, canonical }) {
  let html = template.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  html = setMeta(html, 'name', 'description', description);
  html = setMeta(html, 'property', 'og:title', title);
  html = setMeta(html, 'property', 'og:description', description);
  html = setMeta(html, 'property', 'og:url', canonical);
  html = setMeta(html, 'name', 'twitter:card', 'summary_large_image');
  html = setMeta(html, 'name', 'twitter:title', title);
  html = setMeta(html, 'name', 'twitter:description', description);
  html = html.replace(/<link\s+rel=["']canonical["'][^>]*>/i, `<link rel="canonical" href="${escapeHtml(canonical)}" />`);
  return html;
}

function replaceElementContents(html, id, content, { reveal = false } = {}) {
  const expression = new RegExp(`(<[^>]*\\bid="${id}"[^>]*)(>)[\\s\\S]*?(<\\/[^>]+>)`, 'i');
  return html.replace(expression, (element, opening, close, ending) => {
    const visibleOpening = reveal ? opening.replace(/\s+hidden(?:=(["']).*?\1)?/i, '') : opening;
    return `${visibleOpening}${close}${content}${ending}`;
  });
}

function hideElement(html, id) {
  return html.replace(new RegExp(`(<[^>]*\\bid="${id}"[^>]*)(>)`, 'i'), (element, opening, close) =>
    /\shidden(?:\s|=|$)/i.test(opening) ? element : `${opening} hidden${close}`
  );
}

function renderFacts(facts) {
  const entries = facts.filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`)
    .join('');
  return entries ? `<dl class="anime-facts">${entries}</dl>` : '';
}

function renderAnimeDetails(anime) {
  const title = anime.title || 'Anime';
  const description = anime.synopsis || `Details for ${title} on Animoro.`;
  const cover = typeof anime.coverImage === 'string' && /^https?:\/\//i.test(anime.coverImage)
    ? `<img class="anime-detail-cover" src="${escapeHtml(anime.coverImage)}" alt="${escapeHtml(title)} poster" width="600" height="900" />`
    : '';
  return {
    title: `${title}${anime.releaseYear ? ` (${anime.releaseYear})` : ''} | Animoro`,
    description: description.slice(0, 180),
    content: `${cover}<div class="anime-detail-information"><h2>${escapeHtml(title)}</h2>${anime.synopsis ? `<section class="anime-detail-copy"><h3>Synopsis</h3><p>${escapeHtml(anime.synopsis)}</p></section>` : ''}${renderFacts([
      ['Type', anime.type], ['Status', anime.status], ['Season', anime.season], ['Release year', anime.releaseYear],
      ['Episodes', anime.episodes], ['Score', anime.rating ? `${anime.rating}${anime.scoredBy ? ` (${anime.scoredBy.toLocaleString()} ratings)` : ''}` : ''],
      ['Studio', anime.studio], ['Source material', anime.sourceMaterial || anime.source], ['Age rating', anime.ageRating],
    ])}</div>`,
  };
}

function renderUpcomingDetails(anime) {
  const title = anime.title || 'Upcoming Anime';
  const description = anime.shortDescription || `Release information for ${title}.`;
  return {
    title: `${title} — Release Information | Animoro`,
    description: description.slice(0, 180),
    content: `<div class="anime-detail-information"><p class="card-meta">${escapeHtml(anime.releaseStatus || 'Release information')}</p><h1 class="section-title">${escapeHtml(title)}</h1>${anime.japaneseTitle ? `<p class="card-excerpt">${escapeHtml(anime.japaneseTitle)}</p>` : ''}${renderFacts([
      ['Release date', anime.releaseDate], ['Release season', [anime.season, anime.releaseYear].filter(Boolean).join(' ')],
      ['Type', anime.type], ['Genres', Array.isArray(anime.genres) ? anime.genres.join(', ') : anime.genres],
      ['Last verified', anime.lastVerified],
    ])}<p>${escapeHtml(anime.description || description)}</p></div>`,
  };
}

async function loadAnimeBySlug(slug, { firestore, fetchImpl }) {
  const match = ANIME_ID_PATTERN.exec(slug);
  if (match) {
    const url = getTenraiRequestUrl({ resource: 'detail', id: match[1] });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TENRAI_TIMEOUT_MS);
    try {
      const response = await fetchImpl(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (response.status === 404) return null;
      if (!response.ok) {
        const error = new Error(`Tenrai request failed (${response.status}).`);
        error.status = response.status >= 500 || response.status === 429 ? 503 : 502;
        throw error;
      }
      const payload = await response.json();
      if (!isValidTenraiPayload(payload, 'detail')) {
        throw new Error('Tenrai returned an invalid anime detail response.');
      }
      if (Number(payload.data.mal_id) !== Number(match[1])) return null;
      return normalizeAnime(payload.data);
    } finally {
      clearTimeout(timeout);
    }
  }

  const snapshot = await firestore.collection('anime')
    .where('visibility', '==', 'published')
    .where('slug', '==', slug)
    .limit(1)
    .get();
  const document = snapshot.docs.find(item =>
    item.data().visibility === 'published' && item.data().slug === slug
  );
  return document ? { id: document.id, ...document.data() } : null;
}

async function loadUpcomingBySlug(firestore, slug) {
  const snapshot = await firestore.collection('upcomingAnime')
    .where('status', '==', 'published')
    .where('slug', '==', slug)
    .limit(1)
    .get();
  const document = snapshot.docs.find(item =>
    item.data().status === 'published' && item.data().slug === slug
  );
  return document ? { id: document.id, ...document.data() } : null;
}

async function loadPublishedCategoryPage(firestore, category, page) {
  const start = (page - 1) * CATEGORY_PAGE_SIZE;
  const queryLimit = start + CATEGORY_PAGE_SIZE + 1;
  const [arraySnapshot, legacySnapshot] = await Promise.all([
    firestore.collection('posts')
      .where('status', '==', 'published')
      .where('categories', 'array-contains', category)
      .orderBy('publishedAt', 'desc')
      .limit(queryLimit)
      .get(),
    firestore.collection('posts')
      .where('status', '==', 'published')
      .where('category', '==', category)
      .orderBy('publishedAt', 'desc')
      .limit(queryLimit)
      .get(),
  ]);
  const postsById = new Map();
  for (const document of [...arraySnapshot.docs, ...legacySnapshot.docs]) {
    const post = document.data();
    if (post.status !== 'published' ||
        post.deleted === true ||
        post.isDeleted === true ||
        post.deletedAt != null ||
        post.isPrivate === true ||
        post.private === true ||
        post.isPublic === false ||
        post.public === false ||
        !isValidArticleSlug(post.slug) ||
        !getArticleCategories(post).includes(category)) continue;
    postsById.set(document.id, { id: document.id, ...post });
  }
  const orderedPosts = [...postsById.values()].sort((left, right) =>
    new Date(right.publishedAt?.toDate?.() || right.publishedAt || 0) -
    new Date(left.publishedAt?.toDate?.() || left.publishedAt || 0)
  );
  return {
    posts: orderedPosts.slice(start, start + CATEGORY_PAGE_SIZE),
    hasNext: orderedPosts.length > start + CATEGORY_PAGE_SIZE,
  };
}

function categoryPageUrl(category, page) {
  const suffix = page > 1 ? `&page=${page}` : '';
  return `/category.html?category=${encodeURIComponent(category)}${suffix}`;
}

function renderCategoryPagination(category, page, hasNext) {
  if (page === 1 && !hasNext) return '';
  return `<nav class="anime-pagination" aria-label="Category article pages">
    ${page > 1 ? `<a class="btn-outline" href="${escapeHtml(categoryPageUrl(category, page - 1))}" rel="prev">Previous articles</a>` : ''}
    <span>Page ${page}</span>
    ${hasNext ? `<a class="btn-outline" href="${escapeHtml(categoryPageUrl(category, page + 1))}" rel="next">Next articles</a>` : ''}
  </nav>`;
}

function getRequestedPage(request) {
  const page = getQueryValue(request, 'page');
  if (!page) return 1;
  if (!/^[1-9]\d{0,2}$/.test(page) || Number(page) > MAX_CATEGORY_PAGE) {
    const error = new Error(`The category page must be between 1 and ${MAX_CATEGORY_PAGE}.`);
    error.status = 400;
    throw error;
  }
  return Number(page);
}

export function createSeoPageHandler({
  getServices = getAdminServices,
  loadTemplate = type => readFile(TEMPLATES[type], 'utf8'),
  fetchImpl = fetch,
  logger = console,
} = {}) {
  return async function seoPageHandler(request, response) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      return sendHtml(response, 405, errorDocument(404));
    }

    try {
      const type = getQueryValue(request, 'type');
      const template = await loadTemplate(type);
      if (typeof template !== 'string' || !template) throw new TypeError('SEO page template is empty or invalid.');

      let html;
      if (type === 'category') {
        html = await renderCategoryWithServices(
          template,
          getQueryValue(request, 'category'),
          getRequestedPage(request),
          getServices
        );
        if (!html) return sendHtml(response, 404, request.method === 'HEAD' ? '' : errorDocument(404));
      } else if (type === 'anime' || type === 'upcoming') {
        const slug = getQueryValue(request, 'slug');
        if (!isValidAnimeDetailSlug(slug)) {
          return sendHtml(response, 404, request.method === 'HEAD' ? '' : errorDocument(404));
        }
        const { firestore } = getServices();
        const record = type === 'anime'
          ? await loadAnimeBySlug(slug, { firestore, fetchImpl })
          : await loadUpcomingBySlug(firestore, slug);
        if (!record) return sendHtml(response, 404, request.method === 'HEAD' ? '' : errorDocument(404));
        const metadata = type === 'anime' ? renderAnimeDetails(record) : renderUpcomingDetails(record);
        const canonical = type === 'anime'
          ? getAnimeCanonicalUrl(record)
          : getUpcomingAnimeCanonicalUrl(record);
        html = setSeoMetadata(template, { ...metadata, canonical });
        const image = getSeoImageUrl(record.coverImage || record.poster);
        const shareImage = image || DEFAULT_SOCIAL_IMAGE;
        const imageAlt = image ? `${record.title || 'Anime'} poster` : 'Animoro logo';
        html = setMeta(html, 'property', 'og:image', shareImage);
        html = setMeta(html, 'property', 'og:image:alt', imageAlt);
        html = setMeta(html, 'name', 'twitter:image', shareImage);
        html = setMeta(html, 'name', 'twitter:image:alt', imageAlt);
        if (type === 'anime') {
          html = replaceElementContents(html, 'animePageTitle', escapeHtml(record.title || 'Anime'));
          html = replaceElementContents(html, 'animePageDescription', escapeHtml(record.synopsis || metadata.description));
          html = replaceElementContents(html, 'animeDetail', metadata.content, { reveal: true });
          for (const id of ['animeDirectoryControls', 'popularAnimeSection', 'animeDirectorySection', 'animePagination']) {
            html = hideElement(html, id);
          }
        } else {
          html = replaceElementContents(html, 'upcomingDetail', metadata.content);
          html = hideElement(html, 'upcomingPageHeader');
          html = hideElement(html, 'upcomingFilters');
          html = hideElement(html, 'verifiedUpcomingSection');
          const databaseSection = html.match(/<section\b[^>]*>[\s\S]*?id="upcomingDatabaseHeading"[\s\S]*?<\/section>/i)?.[0];
          if (databaseSection) html = html.replace(databaseSection, databaseSection.replace(/^<section\b([^>]*)>/i, '<section$1 hidden>'));
        }
      } else {
        return sendHtml(response, 404, request.method === 'HEAD' ? '' : errorDocument(404));
      }

      return sendHtml(
        response,
        200,
        request.method === 'HEAD' ? '' : html,
        'public, max-age=0, s-maxage=60, must-revalidate'
      );
    } catch (error) {
      if (Number(error?.status) === 400) {
        return sendHtml(response, 400, request.method === 'HEAD' ? '' : errorDocument(400));
      }
      logger.error('SEO page request failed.', error);
      return sendHtml(response, 503, request.method === 'HEAD' ? '' : errorDocument(503));
    }
  };
}

async function renderCategoryWithServices(template, category, page, getServices) {
  if (!category || category.length > 100) return null;
  const { firestore } = getServices();
  const { posts, hasNext } = await loadPublishedCategoryPage(firestore, category, page);
  if (!posts.length) return null;
  const metadata = getCategoryMetadata(category);
  const canonical = `https://www.animoro.in${categoryPageUrl(category, page)}`;
  let html = setSeoMetadata(template, { ...metadata, canonical });
  html = setMeta(html, 'property', 'og:image', DEFAULT_SOCIAL_IMAGE);
  html = setMeta(html, 'property', 'og:image:alt', 'Animoro logo');
  html = setMeta(html, 'name', 'twitter:image', DEFAULT_SOCIAL_IMAGE);
  html = setMeta(html, 'name', 'twitter:image:alt', 'Animoro logo');
  html = addStructuredData(html, 'categoryBreadcrumbJsonLd', createCategoryBreadcrumbSchema(metadata.heading, canonical));
  html = replaceElementContents(html, 'categoryTitle', escapeHtml(metadata.heading));
  html = replaceElementContents(html, 'categoryDescription', escapeHtml(metadata.description));
  html = replaceElementContents(html, 'categoryArticlesContainer', renderArticleList(posts));
  html = html.replace('<!-- CATEGORY_PAGINATION -->', renderCategoryPagination(category, page, hasNext));
  return html;
}

export default createSeoPageHandler();
