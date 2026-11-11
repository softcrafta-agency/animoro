import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { getAnimePath, isValidAnimeDetailSlug } from '../../js/anime-url.js';

const root = new URL('../../', import.meta.url);
const vercel = JSON.parse(await readFile(new URL('vercel.json', root), 'utf8'));
const firebase = JSON.parse(await readFile(new URL('firebase.json', root), 'utf8'));
const vite = await readFile(new URL('vite.config.ts', root), 'utf8');
const animeHtml = await readFile(new URL('anime.html', root), 'utf8');
const animeClient = await readFile(new URL('js/anime.js', root), 'utf8');
const homeHtml = await readFile(new URL('index.html', root), 'utf8');
const calendarHtml = await readFile(new URL('anime-calendar.html', root), 'utf8');
const uiClient = await readFile(new URL('js/ui.js', root), 'utf8');
const sitemap = await readFile(new URL('api/_lib/sitemap.js', root), 'utf8');
const robots = await readFile(new URL('public/robots.txt', root), 'utf8');
const animeUrl = await readFile(new URL('js/anime-url.js', root), 'utf8');

test('Vercel rewrites the anime directory and detail paths and permanently redirects the old page URL', () => {
  assert.deepEqual(vercel.rewrites.find(item => item.source === '/anime-list'), {
    source: '/anime-list',
    destination: '/anime.html',
  });
  assert.deepEqual(vercel.rewrites.find(item => item.source === '/anime/:slug*'), {
    source: '/anime/:slug*',
    destination: '/anime.html',
  });
  assert.deepEqual(vercel.redirects.find(item => item.source === '/anime.html'), {
    source: '/anime.html',
    destination: '/anime-list',
    statusCode: 301,
  });
  assert.equal(vercel.redirects.some(item => item.destination === '/anime.html'), false);
});

test('Firebase Hosting configures matching rewrite and permanent redirect', () => {
  assert.deepEqual(firebase.hosting.rewrites.find(item => item.source === '/anime-list'), {
    source: '/anime-list',
    destination: '/anime.html',
  });
  assert.deepEqual(firebase.hosting.rewrites.find(item => item.source === '/anime/**'), {
    source: '/anime/**',
    destination: '/anime.html',
  });
  assert.deepEqual(firebase.hosting.redirects.find(item => item.source === '/anime.html'), {
    source: '/anime.html',
    destination: '/anime-list',
    type: 301,
  });
});

test('Anime List build entry, canonical metadata, internal links, and sitemap use the clean directory route', () => {
  assert.match(vite, /anime:\s*path\.resolve\(__dirname,\s*'anime\.html'\)/);
  assert.match(animeHtml, /<title>Anime List: Explore Anime Series &amp; Genres \| Animoro<\/title>/);
  assert.match(animeHtml, /name="description" content="Explore anime by title, genre, format, airing status, popularity, and available ratings\./);
  assert.match(animeHtml, /<h1[^>]*>Anime List: Explore Anime Series &amp; Genres<\/h1>/);
  assert.match(animeHtml, /What is the Animoro Anime List\?/);
  assert.match(animeHtml, /id="animeListFaq"/);
  assert.match(animeHtml, /id="animeFaqJsonLd" type="application\/ld\+json"/);
  assert.match(animeHtml, /id="animeListFreshness"/);
  assert.match(animeHtml, /name="robots" content="index, follow"/);
  assert.match(animeHtml, /<meta property="og:url" content="https:\/\/animoro\.in\/anime-list"\s*\/>/);
  assert.match(animeHtml, /<link rel="canonical" href="https:\/\/animoro\.in\/anime-list"\s*\/>/);
  assert.equal((animeHtml.match(/rel="canonical"/g) || []).length, 1);
  assert.match(animeHtml, /href="\/anime-list"/);
  assert.match(sitemap, /'\/anime-list'/);
  assert.doesNotMatch(sitemap, /'\/anime\.html'/);
  assert.match(animeUrl, /return `\/anime\//);
  assert.match(animeClient, /function renderAnimeListStructuredData\(\)/);
  assert.match(animeClient, /createAnimeListStructuredData\(latestDirectoryItems\)/);
  assert.match(animeClient, /hideAnimeListContent\(\)/);
  assert.match(animeClient, /document\.getElementById\('animeListJsonLd'\)\?\.remove\(\)/);
  assert.match(robots, /^Allow: \/api\/tenrai$/m);
  assert.match(robots, /^Disallow: \/api\/$/m);
});

test('anime detail renderer omits source links and Tenrai attribution while preserving details', () => {
  const sourceButtonLabel = ['View', 'source data'].join(' ');
  const attributionText = ['Data supplied by ', 'Tenrai. Details can change as source data is updated.'].join('');
  assert.doesNotMatch(animeClient, new RegExp(sourceButtonLabel));
  assert.doesNotMatch(animeClient, new RegExp(attributionText));
  assert.doesNotMatch(animeClient, /cached data from Tenrai/);
  assert.match(animeClient, /attachMyListToggle\(button, \{ \.\.\.anime, kind: 'anime' \}\)/);
  assert.match(animeClient, /getAnimeDetails\(match\.groups\.id\)/);
});

test('calendar navigation labels are consistent in desktop, mobile, and shared navigation', () => {
  for (const html of [animeHtml, homeHtml, calendarHtml]) {
    assert.match(html, /href=["'](?:\/|)anime-calendar\.html["'][^>]*>Anime Airing Today<\/a>/);
  }
  assert.match(uiClient, /label: 'Anime Airing Today', key: 'calendar'/);
});

test('Upcoming Anime rewrites and redirects do not target one another', () => {
  for (const config of [vercel, firebase.hosting]) {
    const rewrites = config.rewrites;
    const redirects = config.redirects;
    assert.ok(rewrites.some(item => item.source === '/upcoming-anime' && item.destination === '/upcoming-anime.html'));
    assert.ok(rewrites.some(item => item.source.startsWith('/upcoming-anime/') && item.destination === '/upcoming-anime.html'));
    assert.ok(redirects.some(item => item.source === '/upcoming-anime.html' && item.destination === '/upcoming-anime'));
    assert.equal(redirects.some(item => item.destination === '/upcoming-anime.html'), false);
  }
});

test('Jikan detail links produce slugs accepted by the detail-page parser', () => {
  const path = getAnimePath({ title: 'Naruto', malId: 20 });
  const slug = path.slice('/anime/'.length);

  assert.equal(path, '/anime/naruto--20');
  assert.equal(isValidAnimeDetailSlug(slug), true);
  assert.equal(isValidAnimeDetailSlug('naruto--0'), false);
  assert.equal(isValidAnimeDetailSlug('naruto--20/other'), false);
});

test('Vercel API route source files and browser endpoint paths agree', async () => {
  const apiAnalytics = await readFile(new URL('api/analytics.js', root), 'utf8');
  const apiIngestion = await readFile(new URL('api/analytics-event.js', root), 'utf8');
  const apiJikan = await readFile(new URL('api/jikan.js', root), 'utf8');
  const adminClient = await readFile(new URL('js/admin-visitor-analytics.js', root), 'utf8');
  const publicClient = await readFile(new URL('js/visitor-analytics.js', root), 'utf8');
  assert.match(apiAnalytics, /export default createAnalyticsHandler\(\)/);
  assert.match(apiIngestion, /export default createAnalyticsEventHandler\(\)/);
  assert.match(apiJikan, /export default createJikanHandler\(\)/);
  assert.match(apiJikan, /getJikanRequestUrl/);
  assert.match(adminClient, /\/api\/analytics\?/);
  assert.match(publicClient, /\/api\/analytics-event/);
});

test('Vercel excludes underscore-prefixed root API tests and stays within the Hobby function limit', async () => {
  const entries = await readdir(new URL('api/', root), { withFileTypes: true });
  const sourceFiles = entries.filter(entry =>
    entry.isFile() &&
    /\.(?:js|mjs|ts)$/.test(entry.name)
  );
  const testFiles = sourceFiles.filter(entry => entry.name.endsWith('.test.js'));
  const functionFiles = sourceFiles.filter(entry => !entry.name.startsWith('_'));

  assert.equal(testFiles.length, 6);
  assert.ok(testFiles.every(entry => entry.name.startsWith('_')));
  assert.equal(functionFiles.length, 11);
  assert.ok(functionFiles.length <= 12);
});

test('mobile menu controls declare their drawer state and are non-submit buttons', async () => {
  for (const file of ['index.html', 'anime.html', 'upcoming-anime.html']) {
    const html = await readFile(new URL(file, root), 'utf8');
    assert.match(html, /id="hamburgerBtn"[^>]*type="button"[^>]*aria-controls="mobileNavDrawer"[^>]*aria-expanded="false"/);
  }
});
