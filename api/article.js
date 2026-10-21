import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getAdminServices } from './_lib/firebase-admin.js';
import { renderArticleDocument } from './_lib/article-html.js';
import { isValidArticleSlug } from '../js/article-url.js';
import { isValidAnimeSlug } from '../js/anime-url.js';

const ARTICLE_TEMPLATE_PATH = resolve(process.cwd(), 'dist', 'blog.html');
const ARTICLE_CACHE_CONTROL = 'public, max-age=0, s-maxage=60, must-revalidate';

function getRequestedSlug(request) {
  if (typeof request.query?.slug === 'string') return request.query.slug;
  const requestUrl = new URL(request.url || '/', 'https://www.animoro.in');
  return requestUrl.searchParams.get('slug') || '';
}

function getRequestId(request) {
  const headers = request.headers || {};
  const requestId = headers['x-vercel-id'] || headers['x-request-id'];
  return typeof requestId === 'string' && requestId.length <= 200
    ? requestId.replace(/[\r\n]/g, '')
    : undefined;
}

function logArticleFailure(logger, error, stage, requestId) {
  logger.error('Article request failed.', JSON.stringify({
    stage,
    requestId,
    errorName: error?.name || 'Error',
    errorCode: typeof error?.code === 'string' || typeof error?.code === 'number'
      ? error.code
      : undefined,
  }));
}

function sendHtml(response, statusCode, html, cacheControl = 'no-store') {
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.setHeader('Cache-Control', cacheControl);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.statusCode = statusCode;
  return response.end(html);
}

function getErrorDocument(statusCode, message) {
  const title = statusCode === 404 ? 'Article Not Found' : 'Article Temporarily Unavailable';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>${title} | Animoro</title><link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/responsive.css"></head><body><main class="container empty-state" style="margin: 10vh auto;max-width: 680px"><h1 class="empty-state-title">${title}</h1><p class="empty-state-desc">${message}</p><a class="btn-cta" href="/blogs.html">Browse Animoro articles</a></main></body></html>`;
}

export async function loadRelatedPosts(firestore, currentPost, currentId) {
  const relatedQueries = [];
  if (isValidAnimeSlug(currentPost.animeSlug)) {
    relatedQueries.push({
      priority: 4,
      load: () => firestore.collection('posts')
        .where('status', '==', 'published')
        .where('animeSlug', '==', currentPost.animeSlug)
        .limit(8)
        .get(),
    });
  }
  const tags = Array.isArray(currentPost.tags)
    ? currentPost.tags.filter(tag => typeof tag === 'string' && tag.trim()).slice(0, 10)
    : [];
  if (tags.length) {
    relatedQueries.push({
      priority: 3,
      load: () => firestore.collection('posts')
        .where('status', '==', 'published')
        .where('tags', 'array-contains-any', tags)
        .limit(8)
        .get(),
    });
  }
  if (typeof currentPost.category === 'string' && currentPost.category.trim()) {
    relatedQueries.push({
      priority: 2,
      load: () => firestore.collection('posts')
        .where('status', '==', 'published')
        .where('category', '==', currentPost.category)
        .orderBy('publishedAt', 'desc')
        .limit(8)
        .get(),
    });
  }

  const candidates = new Map();
  await Promise.all(relatedQueries.map(async ({ priority, load }) => {
    try {
      const snapshot = await load();
      snapshot.docs.forEach(document => {
        const post = document.data();
        if (document.id === currentId || post.status !== 'published') return;
        const existing = candidates.get(document.id);
        if (!existing || priority > existing.priority) {
          candidates.set(document.id, { id: document.id, ...post, priority });
        }
      });
    } catch (error) {
      console.warn('A related-article query could not be completed.', error);
    }
  }));

  if (candidates.size < 4) {
    try {
      const snapshot = await firestore.collection('posts')
        .where('status', '==', 'published')
        .orderBy('publishedAt', 'desc')
        .limit(8)
        .get();
      snapshot.docs.forEach(document => {
        const post = document.data();
        if (document.id === currentId || post.status !== 'published' || candidates.has(document.id)) return;
        candidates.set(document.id, { id: document.id, ...post, priority: 1 });
      });
    } catch (error) {
      console.error('Could not load recent published articles for related recommendations.', error);
    }
  }

  return [...candidates.values()]
    .sort((left, right) =>
      right.priority - left.priority ||
      new Date(right.publishedAt?.toDate?.() || right.publishedAt || 0) -
        new Date(left.publishedAt?.toDate?.() || left.publishedAt || 0)
    )
    .slice(0, 4)
    .map(({ priority, ...post }) => post);
}

async function hasPublishedAnimeProfile(firestore, post) {
  if (!isValidAnimeSlug(post.animeSlug)) return false;

  try {
    const snapshot = await firestore.collection('anime')
      .where('visibility', '==', 'published')
      .where('slug', '==', post.animeSlug)
      .limit(1)
      .get();
    return snapshot.docs.some(document =>
      document.data().visibility === 'published' &&
      document.data().slug === post.animeSlug
    );
  } catch (error) {
    console.error('Could not verify the linked published anime profile.', error);
    return false;
  }
}

export function createArticleHandler({
  getServices = getAdminServices,
  loadTemplate = () => readFile(ARTICLE_TEMPLATE_PATH, 'utf8'),
  logger = console,
} = {}) {
  return async function articleHandler(request, response) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      return sendHtml(response, 405, getErrorDocument(404, 'This request method is not supported.'));
    }

    let stage = 'read_request';
    const requestId = getRequestId(request);
    try {
      const slug = getRequestedSlug(request);
      if (!isValidArticleSlug(slug)) {
        const html = getErrorDocument(404, 'The article you requested could not be found.');
        return sendHtml(response, 404, request.method === 'HEAD' ? '' : html);
      }

      stage = 'initialize_firebase';
      const { firestore } = getServices();
      stage = 'query_article';
      const snapshot = await firestore.collection('posts')
        .where('slug', '==', slug)
        .where('status', '==', 'published')
        .limit(1)
        .get();
      if (!Array.isArray(snapshot?.docs)) {
        throw new TypeError('Firestore returned an invalid article query result.');
      }
      const articleDocument = snapshot.docs.find(document =>
        document?.data()?.status === 'published' &&
        document.data().slug === slug
      );
      if (!articleDocument) {
        const html = getErrorDocument(404, 'The article you requested could not be found.');
        return sendHtml(response, 404, request.method === 'HEAD' ? '' : html);
      }

      const post = { id: articleDocument.id, ...articleDocument.data() };
      const [hasAnimeProfile, relatedPosts] = await Promise.all([
        hasPublishedAnimeProfile(firestore, post),
        loadRelatedPosts(firestore, post, articleDocument.id),
      ]);
      if (!hasAnimeProfile) {
        post.animeSlug = '';
        post.animeTitle = '';
      }
      stage = 'load_template';
      const template = await loadTemplate();
      if (typeof template !== 'string' || !template) {
        throw new TypeError('Article template is empty or invalid.');
      }
      stage = 'render_article';
      const html = renderArticleDocument(template, post, relatedPosts);
      return sendHtml(
        response,
        200,
        request.method === 'HEAD' ? '' : html,
        ARTICLE_CACHE_CONTROL
      );
    } catch (error) {
      logArticleFailure(logger, error, stage, requestId);
      const html = getErrorDocument(503, 'Please try again shortly.');
      return sendHtml(response, 503, request.method === 'HEAD' ? '' : html);
    }
  };
}

export default createArticleHandler();
