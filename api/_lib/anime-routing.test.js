import assert from 'node:assert/strict';
import test from 'node:test';
import { access } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const vercel = JSON.parse(await readFile(new URL('vercel.json', root), 'utf8'));
const firebase = JSON.parse(await readFile(new URL('firebase.json', root), 'utf8'));
const vite = await readFile(new URL('vite.config.ts', root), 'utf8');

test('deleted anime and Upcoming Anime routes have no page, rewrite, or redirect', async () => {
  const retiredPath = /^\/(?:anime(?:\.html)?(?:\/|$)|upcoming-anime(?:\.html)?(?:\/|$)|anime-calendar\.html$)/;
  for (const hosting of [vercel, firebase.hosting]) {
    const routes = [...(hosting.rewrites || []), ...(hosting.redirects || [])];
    assert.equal(routes.some(route => retiredPath.test(route.source)), false);
  }
  assert.doesNotMatch(vite, /path\.resolve\(__dirname,\s*'(?:anime|upcoming-anime|anime-calendar)\.html'\)/);

  for (const page of ['anime.html', 'upcoming-anime.html', 'anime-calendar.html']) {
    await assert.rejects(access(new URL(page, root)), { code: 'ENOENT' });
  }
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
