import assert from 'node:assert/strict';
import test from 'node:test';
import { isPublicAnalyticsPage } from './visitor-analytics.js';

test('allows analytics on public anime detail routes but excludes admin previews', () => {
  assert.equal(isPublicAnalyticsPage('/anime/naruto--20'), true);
  assert.equal(isPublicAnalyticsPage('/upcoming-anime/future-story'), true);
  assert.equal(isPublicAnalyticsPage('/upcoming-anime/future-story', '?preview=1'), false);
  assert.equal(isPublicAnalyticsPage('/upcoming-anime/future-story', '?mode=preview'), false);
  assert.equal(isPublicAnalyticsPage('/upcoming-anime/future-story', '?adminPreview=1'), false);
  assert.equal(isPublicAnalyticsPage('/admin.html'), false);
});
