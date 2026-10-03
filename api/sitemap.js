import { getAdminServices } from './_lib/firebase-admin.js';
import { assignAnimeSlugs, assignPostSlugs, buildSitemap } from './_lib/sitemap.js';

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_CONTROL = 'public, max-age=300, s-maxage=300';

let cachedSitemap;
let cacheExpiresAt = 0;
let refreshInProgress;

async function loadSitemap() {
  const { firestore } = getAdminServices();
  const [postsSnapshot, categoriesSnapshot, animeSnapshot] = await Promise.all([
    firestore.collection('posts').where('status', '==', 'published').get(),
    firestore.collection('categories').get(),
    firestore.collection('anime').where('visibility', '==', 'published').get(),
  ]);

  const storedPosts = postsSnapshot.docs.map(document => {
    const data = document.data();
    return {
      reference: document.ref,
      storedSlug: data.slug,
      id: document.id,
      ...data,
    };
  });
  const posts = assignPostSlugs(storedPosts);
  const missingSlugs = posts.filter(post => post.slug !== post.storedSlug);

  const storedAnime = animeSnapshot.docs.map(document => ({
    reference: document.ref,
    storedSlug: document.data().slug,
    ...document.data(),
  }));
  const anime = assignAnimeSlugs(storedAnime);
  const missingAnimeSlugs = anime.filter(entry => entry.slug !== entry.storedSlug);
  const missingSlugUpdates = [
    ...missingSlugs.map(post => ({ reference: post.reference, slug: post.slug })),
    ...missingAnimeSlugs.map(entry => ({ reference: entry.reference, slug: entry.slug })),
  ];

  for (let offset = 0; offset < missingSlugUpdates.length; offset += 500) {
    const batch = firestore.batch();
    missingSlugUpdates
      .slice(offset, offset + 500)
      .forEach(entry => batch.update(entry.reference, { slug: entry.slug }));
    await batch.commit();
  }

  const categories = categoriesSnapshot.docs.map(document => document.data());

  return buildSitemap(posts, categories, anime);
}

function getSitemap() {
  if (cachedSitemap && Date.now() < cacheExpiresAt) {
    return Promise.resolve(cachedSitemap);
  }

  if (!refreshInProgress) {
    refreshInProgress = loadSitemap()
      .then(xml => {
        cachedSitemap = xml;
        cacheExpiresAt = Date.now() + CACHE_TTL_MS;
        return xml;
      })
      .finally(() => {
        refreshInProgress = undefined;
      });
  }

  return refreshInProgress;
}

export default async function sitemapHandler(request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.statusCode = 405;
    return response.end('Method Not Allowed');
  }

  try {
    const xml = await getSitemap();
    response.setHeader('Content-Type', 'application/xml; charset=utf-8');
    response.setHeader('Cache-Control', CACHE_CONTROL);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.statusCode = 200;
    return response.end(request.method === 'HEAD' ? '' : xml);
  } catch (error) {
    console.error('Failed to generate sitemap.xml from Firestore:', error);
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.statusCode = 503;
    return response.end('Sitemap is temporarily unavailable.');
  }
}
