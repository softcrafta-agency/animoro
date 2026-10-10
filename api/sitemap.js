import { getAdminServices } from './_lib/firebase-admin.js';
import { assignAnimeSlugs, assignPostSlugs, buildSitemap } from './_lib/sitemap.js';

const CACHE_CONTROL = 'no-store';

async function loadSitemap() {
  const { firestore } = getAdminServices();
  const [postsSnapshot, animeSnapshot] = await Promise.all([
    firestore.collection('posts').where('status', '==', 'published').get(),
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

  return buildSitemap(posts, [], anime);
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
    const xml = await loadSitemap();
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
