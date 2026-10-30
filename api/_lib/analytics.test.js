import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  classifyTrafficSource,
  getClientCategories,
  getRateLimitDocumentId,
  getTrustedClientIp,
  isAllowedPublicPath,
  isKnownBot,
  isValidAnalyticsId,
  parseDate,
  parseDateRange,
  sanitizeCampaignValue,
  sanitizeLabel,
  sanitizeReferrer,
} from './analytics.js';

test('analytics identifiers and remaining public paths are strictly validated', () => {
  assert.equal(isValidAnalyticsId('0123456789abcdef0123456789abcdef'), true);
  assert.equal(isValidAnalyticsId('not-an-id'), false);
  assert.equal(isAllowedPublicPath('/anime'), false);
  assert.equal(isAllowedPublicPath('/anime.html/deleted-slug'), false);
  assert.equal(isAllowedPublicPath('/upcoming-anime.html'), false);
  assert.equal(isAllowedPublicPath('/blog/a-valid-article-9'), true);
  assert.equal(isAllowedPublicPath('/admin.html'), false);
  assert.equal(isAllowedPublicPath('//example.com/path'), false);
  assert.equal(isAllowedPublicPath('/blog/a/child'), false);
});

test('rate-limit identifiers use Vercel-provided IPs and a keyed, time-windowed digest', () => {
  const secret = 'test-only-analytics-rate-limit-secret';
  const request = { headers: { 'x-vercel-forwarded-for': '203.0.113.10' } };
  assert.equal(getTrustedClientIp(request), '203.0.113.10');
  assert.equal(getTrustedClientIp({ headers: { 'x-forwarded-for': 'not-an-ip' } }), '');
  const first = getRateLimitDocumentId('203.0.113.10', 100, secret);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(getRateLimitDocumentId('203.0.113.10', 100, secret), first);
  assert.notEqual(getRateLimitDocumentId('203.0.113.11', 100, secret), first);
  assert.notEqual(getRateLimitDocumentId('203.0.113.10', 101, secret), first);
  assert.equal(getRateLimitDocumentId('203.0.113.10', 100, 'short'), '');
});

test('analytics classification uses broad categories and strips sensitive referrer data', () => {
  assert.equal(isKnownBot('Googlebot/2.1'), true);
  assert.equal(isKnownBot('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'), false);
  assert.deepEqual(getClientCategories('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'), {
    deviceCategory: 'mobile',
    browser: 'Safari',
    operatingSystem: 'iOS',
  });
  assert.equal(sanitizeReferrer('https://www.google.com/search?q=secret'), 'www.google.com');
  assert.equal(sanitizeReferrer('https://www.animoro.in/blog/story'), '');
  assert.equal(sanitizeReferrer('javascript:alert(1)'), '');
  assert.equal(classifyTrafficSource('www.google.com'), 'organic_search');
  assert.equal(classifyTrafficSource('', {}), 'unknown');
  assert.equal(classifyTrafficSource('', { campaign: 'spring' }), 'campaign');
});

test('analytics labels and campaign values are bounded and sanitized', () => {
  assert.equal(sanitizeLabel('  hello\u0000world  '), 'helloworld');
  assert.equal(sanitizeLabel('x'.repeat(110), 100).length, 100);
  assert.equal(sanitizeCampaignValue('spring_sale-2026'), 'spring_sale-2026');
  assert.equal(sanitizeCampaignValue('bad&value'), '');
});

test('date parsing rejects invalid, future, reversed, and oversized ranges', () => {
  assert.equal(parseDate('2025-02-29'), null);
  assert.equal(parseDate('2024-02-29').toISOString(), '2024-02-29T00:00:00.000Z');
  assert.equal(parseDateRange({ startDate: '2025-02-02', endDate: '2025-02-01' }, new Date('2025-02-03')).error !== undefined, true);
  assert.equal(parseDateRange({ startDate: '2025-01-01', endDate: '2025-04-01' }, new Date('2025-04-02')).error, 'Date ranges may not exceed 90 days.');
  assert.equal(parseDateRange({ startDate: '2025-02-02', endDate: '2025-02-04' }, new Date('2025-02-03')).error, 'The end date cannot be in the future.');
  const valid = parseDateRange({ startDate: '2025-02-01', endDate: '2025-02-03' }, new Date('2025-02-03'));
  assert.equal(valid.days, 3);
  assert.equal(valid.end.toISOString(), '2025-02-04T00:00:00.000Z');
});

test('Firestore rules keep analytics and rate-limit records server-only', async () => {
  const rules = await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8');
  for (const collection of [
    'analytics_events',
    'analytics_visitors',
    'analytics_sessions',
    'analytics_rate_limits',
    'analytics_daily_summaries',
  ]) {
    const match = rules.split(`match /${collection}/{`)[1]?.split('\n    }')[0] || '';
    assert.match(match, /allow read, write: if false;/, `${collection} must remain client-denied`);
  }
});
