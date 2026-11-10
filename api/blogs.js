import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getAdminServices } from './_lib/firebase-admin.js';
import { getArticlePath, isValidArticleSlug } from '../js/article-url.js';
import { getArticleCategories } from '../js/article-editor-fields.js';
import { escapeHtml, getSafeImageUrl } from '../js/html-utils.js';

const BLOGS_TEMPLATE_PATH = resolve(process.cwd(), 'dist', 'blogs.html');
const BLOG_ARTICLES_MARKER = '<!-- BLOG_ARTICLES -->';
const PAGE_SIZE = 9;
const CACHE_CONTROL = 'public, max-age=0, s-maxage=60, must-revalidate';
const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=800&q=80';

function getRequestedCategory(request) {
  const queryCategory = typeof request.query?.category === 'string'
    ? request.query.category
    : new URL(request.url || '/', 'https://www.animoro.in').searchParams.get('category');
  return typeof queryCategory === 'string' && queryCategory.trim()
    ? queryCategory.trim().slice(0, 100)
    : 'all';
}

function formatPublishedDate(value) {
  if (!value) return '';
  const date = value.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function renderArticleCard(post) {
  const articlePath = getArticlePath(post);
  const title = escapeHtml(post.title || 'Untitled article');
  const categories = getArticleCategories(post);
  const category = escapeHtml(categories[0] || 'General');
  const categoryLinks = categories.map(name =>
    `<a class="badge-category" href="/category.html?category=${encodeURIComponent(name)}">${escapeHtml(name)}</a>`
  ).join('');
  const excerpt = escapeHtml(post.excerpt || '');
  const authorName = typeof post.authorName === 'string' ? post.authorName.trim() : '';
  const imageUrl = escapeHtml(getSafeImageUrl(post.coverImage, FALLBACK_IMAGE));
  const publishedDate = formatPublishedDate(post.publishedAt);

  return `<article class="article-card">
    <a href="${articlePath}" class="card-img-wrap">
      <img class="card-img" src="${imageUrl}" alt="${title}" width="800" height="450" loading="lazy" decoding="async" />
      <span class="card-category-badge">${category}</span>
    </a>
    <div class="card-body">
      ${publishedDate ? `<div class="card-meta"><span>${escapeHtml(publishedDate)}</span></div>` : ''}
      ${categoryLinks ? `<div class="card-category-list">${categoryLinks}</div>` : ''}
      <h3 class="card-title"><a href="${articlePath}">${title}</a></h3>
      <p class="card-excerpt">${excerpt}</p>
      <div class="card-footer">
        <div class="author-info">
          ${authorName ? `<div class="author-avatar">${escapeHtml(authorName[0].toUpperCase())}</div><span>${escapeHtml(authorName)}</span>` : ''}
        </div>
        <a href="${articlePath}" style="color: var(--accent-crimson); font-weight: 600; display: flex; align-items: center; gap: 4px;">
          Read
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </a>
      </div>
    </div>
  </article>`;
}

function renderArticleList(posts) {
  if (!posts.length) {
    return `<div class="empty-state" style="grid-column: 1 / -1;">
      <h2 class="empty-state-title">No stories found</h2>
      <p class="empty-state-desc">There are no published articles in this selection yet. Browse all articles or check back soon.</p>
      <a class="btn-outline" href="/blogs.html">Browse All Articles</a>
    </div>`;
  }
  return posts.map(renderArticleCard).join('\n');
}

async function loadPublishedPosts(firestore, category) {
  const collection = firestore.collection('posts');
  const baseQuery = collection.where('status', '==', 'published');
  const queries = category === 'all'
    ? [baseQuery.orderBy('publishedAt', 'desc').limit(PAGE_SIZE).get()]
    : [
        baseQuery.where('categories', 'array-contains', category).orderBy('publishedAt', 'desc').limit(PAGE_SIZE).get(),
        baseQuery.where('category', '==', category).orderBy('publishedAt', 'desc').limit(PAGE_SIZE).get(),
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
  return [...postsById.values()]
    .sort((left, right) =>
      new Date(right.publishedAt?.toDate?.() || right.publishedAt || 0) -
      new Date(left.publishedAt?.toDate?.() || left.publishedAt || 0)
    )
    .slice(0, PAGE_SIZE);
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
      const { firestore } = getServices();
      stage = 'query_articles';
      const posts = await loadPublishedPosts(firestore, getRequestedCategory(request));
      stage = 'load_template';
      const template = await loadTemplate();
      if (typeof template !== 'string' || !template.includes(BLOG_ARTICLES_MARKER)) {
        throw new TypeError('Articles template is empty or missing its render marker.');
      }
      stage = 'render_articles';
      const html = template.replace(BLOG_ARTICLES_MARKER, renderArticleList(posts));
      return sendHtml(
        response,
        200,
        request.method === 'HEAD' ? '' : html,
        CACHE_CONTROL
      );
    } catch (error) {
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
