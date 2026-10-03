import { getAdminServices } from './_lib/firebase-admin.js';
import {
  isValidArticleSlug,
  normalizeArticleSlug
} from '../js/article-url.js';

function sendJson(response, statusCode, payload) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.statusCode = statusCode;
  return response.end(JSON.stringify(payload));
}

function getArticleId(request) {
  const queryValue = request.query?.id;
  if (typeof queryValue === 'string') return queryValue;

  const requestUrl = new URL(request.url, 'https://www.animoro.in');
  return requestUrl.searchParams.get('id') || '';
}

function makeCandidateSlug(baseSlug, suffix) {
  if (suffix === 1) return baseSlug;

  const suffixText = `-${suffix}`;
  return `${baseSlug.slice(0, 200 - suffixText.length).replace(/-+$/g, '')}${suffixText}`;
}

export default async function articleSlugHandler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return sendJson(response, 405, { error: 'Method Not Allowed' });
  }

  const articleId = getArticleId(request);
  if (!articleId || articleId.length > 150 || /[\\/]/.test(articleId)) {
    return sendJson(response, 400, { error: 'A valid article ID is required.' });
  }

  try {
    const { firestore } = getAdminServices();
    const postRef = firestore.collection('posts').doc(articleId);
    const postSnapshot = await postRef.get();
    if (!postSnapshot.exists || postSnapshot.data().status !== 'published') {
      return sendJson(response, 404, { error: 'Published article not found.' });
    }

    const post = postSnapshot.data();
    if (isValidArticleSlug(post.slug)) {
      return sendJson(response, 200, { slug: post.slug });
    }

    const baseSlug = normalizeArticleSlug(post.title);
    for (let suffix = 1; suffix < 10000; suffix += 1) {
      const candidate = makeCandidateSlug(baseSlug, suffix);
      const matches = await firestore.collection('posts')
        .where('slug', '==', candidate)
        .limit(2)
        .get();
      if (matches.docs.some(document => document.id !== articleId)) continue;

      await postRef.update({ slug: candidate });
      return sendJson(response, 200, { slug: candidate });
    }

    throw new Error(`Could not allocate a unique slug for article ${articleId}.`);
  } catch (error) {
    console.error('Failed to resolve a legacy article URL:', error);
    return sendJson(response, 503, { error: 'Article URL is temporarily unavailable.' });
  }
}
