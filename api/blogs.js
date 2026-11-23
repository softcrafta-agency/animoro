import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getAdminServices } from './_lib/firebase-admin.js';
import { isValidArticleSlug } from '../js/article-url.js';
import { getArticleCategories } from '../js/article-editor-fields.js';
import { getCategoryMetadata } from '../js/category-seo.js';
import { escapeHtml } from '../js/html-utils.js';
import { renderArticleList } from './_lib/article-list-html.js';

const BLOGS_TEMPLATE_PATH = resolve(process.cwd(), 'dist', 'blogs.html');
const BLOG_ARTICLES_MARKER = '<!-- BLOG_ARTICLES -->';
const BLOG_PAGINATION_MARKER = '<!-- BLOG_PAGINATION -->';
const PAGE_SIZE = 9;
const MAX_ARCHIVE_PAGE = 100;
const CACHE_CONTROL = 'public, max-age=0, s-maxage=60, must-revalidate';

function getRequestedCategory(request) {
  const queryCategory = typeof request.query?.category === 'string'
    ? request.query.category
    : new URL(request.url || '/', 'https://www.animoro.in').searchParams.get('category');
  return typeof queryCategory === 'string' && queryCategory.trim()
    ? queryCategory.trim().slice(0, 100)
    : 'all';
}

function getRequestedPage(request) {
  const queryPage = typeof request.query?.page === 'string'
    ? request.query.page
    : new URL(request.url || '/', 'https://www.animoro.in').searchParams.get('page');
  if (!queryPage) return 1;
  if (!/^[1-9]\d{0,2}$/.test(queryPage) || Number(queryPage) > MAX_ARCHIVE_PAGE) {
    const error = new Error(`The archive page must be between 1 and ${MAX_ARCHIVE_PAGE}.`);
    error.status = 400;
    throw error;
  }
  return Number(queryPage);
}

async function loadPublishedPosts(firestore, category, page) {
  const collection = firestore.collection('posts');
  const baseQuery = collection.where('status', '==', 'published');
  const windowSize = (page - 1) * PAGE_SIZE + PAGE_SIZE + 1;
  const queries = category === 'all'
    ? [baseQuery.orderBy('publishedAt', 'desc').limit(windowSize).get()]
    : [
        baseQuery.where('categories', 'array-contains', category).orderBy('publishedAt', 'desc').limit(windowSize).get(),
        baseQuery.where('category', '==', category).orderBy('publishedAt', 'desc').limit(windowSize).get(),
      ];
  const snapshots = await Promise.all(queries);
  const postsById = new Map();
  for (const snapshot of snapshots) {
    if (!Array.isArray(snapshot?.docs)) {
      throw new TypeError('Firestore returned an invalid article-list query result.');
    }
    for (const document of snapshot.docs) {
      const post = document.data();
      if (post.status !== 'published' ||
          !isValidArticleSlug(post.slug) ||
          (category !== 'all' && !getArticleCategories(post).includes(category))) {
        continue;
      }
      postsById.set(document.id, post);
    }
  }
  const orderedPosts = [...postsById.values()]
    .sort((left, right) =>
      new Date(right.publishedAt?.toDate?.() || right.publishedAt || 0) -
      new Date(left.publishedAt?.toDate?.() || left.publishedAt || 0)
    );
  const start = (page - 1) * PAGE_SIZE;
  return {
    posts: orderedPosts.slice(start, start + PAGE_SIZE),
    hasNext: orderedPosts.length > start + PAGE_SIZE,
  };
}

function renderPagination(page, hasNext, category) {
  if (page === 1 && !hasNext) return '';
  const urlForPage = pageNumber => {
    const params = new URLSearchParams();
    if (category !== 'all') params.set('category', category);
    if (pageNumber > 1) params.set('page', String(pageNumber));
    const query = params.toString();
    return `/blogs.html${query ? `?${query}` : ''}`;
  };
  return `<nav class="anime-pagination" aria-label="Article archive pages">
    ${page > 1 ? `<a class="btn-outline" href="${escapeHtml(urlForPage(page - 1))}" rel="prev">Previous articles</a>` : ''}
    <span>Page ${page}</span>
    ${hasNext ? `<a class="btn-outline" href="${escapeHtml(urlForPage(page + 1))}" rel="next">Next articles</a>` : ''}
  </nav>`;
}

function setArchiveCanonical(html, page, category) {
  const categoryMetadata = category === 'all' ? null : getCategoryMetadata(category);
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  const baseTitle = titleMatch?.[1]?.replace(/&amp;/g, '&') || 'Anime News, Reviews & Guides | Animoro';
  const title = categoryMetadata
    ? `${categoryMetadata.title}${page > 1 ? ` — Page ${page}` : ''}`
    : page > 1
      ? `${baseTitle.replace(/\s*\|\s*Animoro$/, '')} — Page ${page} | Animoro`
      : baseTitle;
  const description = categoryMetadata
    ? `${categoryMetadata.description}${page > 1 ? ` Page ${page}.` : ''}`
    : page > 1
      ? `Page ${page} of Animoro's latest anime news, reviews, features, and guides. Discover seasonal picks, rankings, and recommendations.`
      : null;
  const categoryQuery = categoryMetadata
    ? `?category=${encodeURIComponent(category)}${page > 1 ? `&page=${page}` : ''}`
    : '';
  const canonical = categoryMetadata
    ? `https://www.animoro.in/category.html${categoryQuery}`
    : `https://www.animoro.in/blogs.html${page > 1 ? `?page=${page}` : ''}`;

  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  if (description) {
    html = setArchiveMeta(html, 'name', 'description', description);
    html = setArchiveMeta(html, 'property', 'og:description', description);
    html = setArchiveMeta(html, 'name', 'twitter:description', description);
  }
  if (categoryMetadata) {
    const headingPattern = /(<h1\b[^>]*\bid="blogArchiveTitle"[^>]*>)[\s\S]*?(<\/h1>)/i;
    if (!headingPattern.test(html)) {
      throw new TypeError('The article archive template is missing its category heading.');
    }
    html = html.replace(headingPattern,
      (_match, opening, closing) => `${opening}${escapeHtml(categoryMetadata.heading)}${closing}`);
  }
  html = setArchiveMeta(html, 'property', 'og:title', title);
  html = setArchiveMeta(html, 'property', 'og:url', canonical);
  html = setArchiveMeta(html, 'name', 'twitter:title', title);
  return html.replace(
    /<link\s+rel=["']canonical["'][^>]*>/i,
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`
  );
}

function setArchiveMeta(html, attribute, name, content) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expression = new RegExp(`<meta\\s+([^>]*\\b${attribute}\\s*=\\s*(["'])${escapedName}\\2[^>]*)>`, 'i');
  const match = html.match(expression);
  if (!match || !/\bcontent\s*=/i.test(match[1])) {
    throw new TypeError(`The article archive template is missing ${attribute}="${name}".`);
  }
  return html.replace(expression, (_tag, attributes) => {
    return `<meta ${attributes.replace(/\bcontent\s*=\s*(["']).*?\1/i, `content="${escapeHtml(content)}"`)}>`;
  });
}

function sendHtml(response, statusCode, html, cacheControl = 'no-store') {
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.setHeader('Cache-Control', cacheControl);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.statusCode = statusCode;
  return response.end(html);
}

function getErrorDocument() {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Articles Temporarily Unavailable | Animoro</title></head><body><main><h1>Articles Temporarily Unavailable</h1><p>Please try again shortly.</p><a href="/blogs.html">Browse Animoro articles</a></main></body></html>';
}

export function createBlogsHandler({
  getServices = getAdminServices,
  loadTemplate = () => readFile(BLOGS_TEMPLATE_PATH, 'utf8'),
  logger = console,
} = {}) {
  return async function blogsHandler(request, response) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      return sendHtml(response, 405, getErrorDocument());
    }

    let stage = 'initialize_firebase';
    try {
      const page = getRequestedPage(request);
      const category = getRequestedCategory(request);
      const { firestore } = getServices();
      stage = 'query_articles';
      const { posts, hasNext } = await loadPublishedPosts(firestore, category, page);
      stage = 'load_template';
      const template = await loadTemplate();
      if (typeof template !== 'string' || !template.includes(BLOG_ARTICLES_MARKER)) {
        throw new TypeError('Articles template is empty or missing its render marker.');
      }
      stage = 'render_articles';
      const html = template
        .replace(BLOG_ARTICLES_MARKER, renderArticleList(posts))
        .replace(BLOG_PAGINATION_MARKER, renderPagination(page, hasNext, category));
      const canonicalHtml = setArchiveCanonical(html, page, category);
      return sendHtml(
        response,
        200,
        request.method === 'HEAD' ? '' : canonicalHtml,
        CACHE_CONTROL
      );
    } catch (error) {
      if (Number(error?.status) === 400) {
        return sendHtml(response, 400, request.method === 'HEAD' ? '' : getErrorDocument());
      }
      logger.error('Article listing request failed.', JSON.stringify({
        stage,
        errorName: error?.name || 'Error',
        errorCode: typeof error?.code === 'string' || typeof error?.code === 'number'
          ? error.code
          : undefined,
      }));
      return sendHtml(response, 503, request.method === 'HEAD' ? '' : getErrorDocument());
    }
  };
}

export default createBlogsHandler();
