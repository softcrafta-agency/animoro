import { getAdminServices } from './_lib/firebase-admin.js';
import { buildSitemap } from './_lib/sitemap.js';

const CACHE_CONTROL = 'no-store';

async function loadSitemap(firestore) {
  const [postsSnapshot, animeSnapshot] = await Promise.all([
    firestore.collection('posts').where('status', '==', 'published').get(),
    firestore.collection('anime').where('visibility', '==', 'published').get(),
  ]);

  const posts = postsSnapshot.docs.map(document => document.data());
  const anime = animeSnapshot.docs.map(document => document.data());
  return buildSitemap(posts, [], anime);
}

export function createSitemapHandler({ getServices = getAdminServices, logger = console } = {}) {
  return async function sitemapHandler(request, response) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      response.setHeader('Content-Type', 'text/plain; charset=utf-8');
      response.setHeader('Cache-Control', 'no-store');
      response.statusCode = 405;
      return response.end('Method Not Allowed');
    }

    try {
      const { firestore } = getServices();
      const xml = await loadSitemap(firestore);
      response.setHeader('Content-Type', 'application/xml; charset=utf-8');
      response.setHeader('Cache-Control', CACHE_CONTROL);
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.statusCode = 200;
      return response.end(request.method === 'HEAD' ? '' : xml);
    } catch (error) {
      logger.error('Failed to generate sitemap.xml from Firestore:', error);
      response.setHeader('Content-Type', 'text/plain; charset=utf-8');
      response.setHeader('Cache-Control', 'no-store');
      response.statusCode = 503;
      return response.end('Sitemap is temporarily unavailable.');
    }
  };
}

export default createSitemapHandler();
