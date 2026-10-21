import assert from 'node:assert/strict';
import test from 'node:test';
import { escapeHtml, getSafeImageUrl } from './html-utils.js';

test('escapes stored article text before inserting it into HTML templates', () => {
  assert.equal(
    escapeHtml('<img src=x onerror=alert(1)> & "quoted"'),
    '&lt;img src=x onerror=alert(1)&gt; &amp; &quot;quoted&quot;'
  );
});

test('allows HTTP image URLs and rejects unsafe protocols or credentials', () => {
  const fallback = '/fallback.webp';

  assert.equal(
    getSafeImageUrl('https://images.example.test/cover.webp', fallback),
    'https://images.example.test/cover.webp'
  );
  assert.equal(getSafeImageUrl('/cover.webp', fallback), 'https://www.animoro.in/cover.webp');
  assert.equal(getSafeImageUrl('javascript:alert(1)', fallback), fallback);
  assert.equal(getSafeImageUrl('https://user:pass@example.test/cover.webp', fallback), fallback);
});
