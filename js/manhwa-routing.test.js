import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const firebaseConfig = JSON.parse(await readFile(new URL('../firebase.json', import.meta.url), 'utf8'));
const vercelConfig = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));

test('Firebase serves the comics page for landing and direct detail URLs', () => {
  const rewrites = firebaseConfig.hosting.rewrites;
  assert.ok(rewrites.some(route =>
    route.source === '/manhwa' && route.destination === '/manhwa.html'
  ));
  assert.ok(rewrites.some(route =>
    route.source === '/manhwa/**' && route.destination === '/manhwa.html'
  ));
});

test('Vercel serves the comics page for landing and direct detail URLs', () => {
  const rewrites = vercelConfig.rewrites;
  assert.ok(rewrites.some(route =>
    route.source === '/manhwa' && route.destination === '/manhwa.html'
  ));
  assert.ok(rewrites.some(route =>
    route.source === '/manhwa/:slug*' && route.destination === '/manhwa.html'
  ));
});
