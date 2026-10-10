import { FieldPath } from 'firebase-admin/firestore';
import { getAdminServices } from './_lib/firebase-admin.js';

const POST_SUMMARY_FIELDS = [
  'title',
  'slug',
  'excerpt',
  'category',
  'authorName',
  'publishedAt',
  'createdAt',
  'featuredOrder',
];

function includesDeferredImages(request) {
  if (request.query?.images === '1') return true;
  return new URL(request.url || '/', 'https://www.animoro.in').searchParams.get('images') === '1';
}

function sendJson(response, statusCode, payload, cacheControl = 'no-store', headOnly = false) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', cacheControl);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.statusCode = statusCode;
  return response.end(headOnly ? '' : JSON.stringify(payload));
}

function serializeDate(value) {
  if (!value) return null;
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function serializePost(document, includeCoverImage = false) {
  const post = document.data();
  const result = {
    id: document.id,
    title: post.title || '',
    slug: post.slug || '',
    excerpt: post.excerpt || '',
    category: post.category || '',
    authorName: post.authorName || '',
    featuredOrder: post.featuredOrder || 99,
    publishedAt: serializeDate(post.publishedAt),
    createdAt: serializeDate(post.createdAt),
  };
  if (includeCoverImage) result.coverImage = post.coverImage || '';
  return result;
}

async function loadLatestPosts(firestore, includeCoverImages = false) {
  const posts = firestore.collection('posts');
  const selectedFields = includeCoverImages
    ? [...POST_SUMMARY_FIELDS, 'coverImage']
    : POST_SUMMARY_FIELDS;
  try {
    const snapshot = await posts
      .where('status', '==', 'published')
      .orderBy('publishedAt', 'desc')
      .select(...selectedFields)
      .limit(5)
      .get();
    return snapshot.docs.map(document => serializePost(document, includeCoverImages));
  } catch (error) {
    console.warn('Ordered featured fallback query failed; using a limited published-post query.', error);
    const snapshot = await posts
      .where('status', '==', 'published')
      .select(...selectedFields)
      .limit(5)
      .get();
    return snapshot.docs
      .map(document => serializePost(document, includeCoverImages))
      .sort((left, right) => new Date(right.publishedAt || right.createdAt || 0) -
        new Date(left.publishedAt || left.createdAt || 0));
  }
}

async function loadFeaturedPosts(firestore, includeCoverImages = false) {
  const fields = includeCoverImages
    ? [...POST_SUMMARY_FIELDS, 'coverImage']
    : POST_SUMMARY_FIELDS;
  const snapshot = await firestore.collection('posts')
    .where('status', '==', 'published')
    .where('featured', '==', true)
    .select(...fields)
    .limit(5)
    .get();
  return snapshot.docs
    .map(document => serializePost(document, includeCoverImages))
    .sort((left, right) => left.featuredOrder - right.featuredOrder);
}

async function loadCoverImage(firestore, postId) {
  const snapshot = await firestore.collection('posts')
    .where('status', '==', 'published')
    .where(FieldPath.documentId(), '==', postId)
    .select('coverImage')
    .limit(1)
    .get();
  return snapshot.docs[0]?.data().coverImage || '';
}

export function createFeaturedHandler({ getServices = getAdminServices } = {}) {
  return async function featuredHandler(request, response) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      return sendJson(response, 405, { error: 'Method not allowed.' });
    }

    try {
      const { firestore } = getServices();
      const shouldIncludeDeferredImages = includesDeferredImages(request);
      let featured = await loadFeaturedPosts(firestore, shouldIncludeDeferredImages);
      let latest = featured.length ? [] : await loadLatestPosts(firestore, shouldIncludeDeferredImages);

      if (shouldIncludeDeferredImages) {
        return sendJson(
          response,
          200,
          {
            featuredImages: featured.map(({ id, coverImage }) => ({ id, coverImage })),
            latestImages: latest.map(({ id, coverImage }) => ({ id, coverImage })),
          },
          'no-store',
          request.method === 'HEAD'
        );
      }

      const initialPosts = featured.length ? featured : latest;
      if (initialPosts.length) {
        initialPosts[0].coverImage = await loadCoverImage(firestore, initialPosts[0].id);
      }

      return sendJson(
        response,
        200,
        {
          featured,
          latest,
          imagesDeferred: initialPosts.length > 1,
          deferredSection: featured.length ? 'featured' : 'latest',
        },
        'no-store',
        request.method === 'HEAD'
      );
    } catch (error) {
      console.error('Failed to load the public featured feed.', error);
      return sendJson(response, 503, { error: 'Featured stories are temporarily unavailable.' });
    }
  };
}

export default createFeaturedHandler();
