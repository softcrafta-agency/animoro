import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const vercel = JSON.parse(await readFile(new URL('vercel.json', root), 'utf8'));
const firebase = JSON.parse(await readFile(new URL('firebase.json', root), 'utf8'));
const vite = await readFile(new URL('vite.config.ts', root), 'utf8');
const animeHtml = await readFile(new URL('anime.html', root), 'utf8');
const sitemap = await readFile(new URL('api/_lib/sitemap.js', root), 'utf8');
const animeUrl = await readFile(new URL('js/anime-url.js', root), 'utf8');

test('Vercel rewrites /anime to the existing page and permanently redirects the old page URL', () => {
  assert.deepEqual(vercel.rewrites.find(item => item.source === '/anime'), {
    source: '/anime',
    destination: '/anime.html',
  });
  assert.deepEqual(vercel.redirects.find(item => item.source === '/anime.html'), {
    source: '/anime.html',
    destination: '/anime',
    statusCode: 301,
  });
  assert.equal(vercel.rewrites.some(item => item.source === '/anime' && item.destination === '/anime'), false);
});

test('Firebase Hosting configures matching rewrite and permanent redirect', () => {
  assert.deepEqual(firebase.hosting.rewrites.find(item => item.source === '/anime'), {
    source: '/anime',
    destination: '/anime.html',
  });
  assert.deepEqual(firebase.hosting.redirects.find(item => item.source === '/anime.html'), {
    source: '/anime.html',
    destination: '/anime',
    type: 301,
  });
});

test('Anime List build entry, canonical metadata, internal links, and sitemap use the clean route', () => {
  assert.match(vite, /anime:\s*path\.resolve\(__dirname,\s*'anime\.html'\)/);
  assert.match(animeHtml, /<meta property="og:url" content="https:\/\/www\.animoro\.in\/anime"\s*\/>/);
  assert.match(animeHtml, /<link rel="canonical" href="https:\/\/www\.animoro\.in\/anime"\s*\/>/);
  assert.equal((animeHtml.match(/rel="canonical"/g) || []).length, 1);
  assert.match(animeHtml, /href="\/anime"/);
  assert.match(sitemap, /'\/anime'/);
  assert.doesNotMatch(sitemap, /'\/anime\.html'/);
  assert.match(animeUrl, /return `\/anime\.html\//);
});

test('Vercel API route source files and browser endpoint paths agree', async () => {
  const apiAnalytics = await readFile(new URL('api/analytics.js', root), 'utf8');
  const apiIngestion = await readFile(new URL('api/analytics-event.js', root), 'utf8');
  const adminClient = await readFile(new URL('js/admin-visitor-analytics.js', root), 'utf8');
  const publicClient = await readFile(new URL('js/visitor-analytics.js', root), 'utf8');
  assert.match(apiAnalytics, /export default createAnalyticsHandler\(\)/);
  assert.match(apiIngestion, /export default createAnalyticsEventHandler\(\)/);
  assert.match(adminClient, /\/api\/analytics\?/);
  assert.match(publicClient, /\/api\/analytics-event/);
});
