import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatUpcomingReleaseDate,
  getUpcomingReleaseDescription,
  getUpcomingReleaseTimestamp,
} from './upcoming-date.js';

test('sorts valid string and Firestore-style dates chronologically', () => {
  const timestamp = { toDate: () => new Date('2026-10-02T00:00:00Z') };

  assert.ok(getUpcomingReleaseTimestamp('2026-10-01') < getUpcomingReleaseTimestamp(timestamp));
  assert.equal(getUpcomingReleaseTimestamp('not a date'), Infinity);
  assert.ok(getUpcomingReleaseTimestamp('Winter 2027') < getUpcomingReleaseTimestamp('Summer 2027'));
  assert.ok(getUpcomingReleaseTimestamp('2026') < getUpcomingReleaseTimestamp('2027'));
});

test('formats date values while preserving descriptive release labels', () => {
  assert.equal(formatUpcomingReleaseDate(null), 'TBA');
  assert.equal(formatUpcomingReleaseDate('Spring 2027'), 'Spring 2027');
  assert.equal(formatUpcomingReleaseDate('October 2026'), 'October 2026');
  assert.equal(formatUpcomingReleaseDate('2026'), '2026');
  assert.match(formatUpcomingReleaseDate('2026-10-02'), /Oct 2, 2026/);
  assert.match(formatUpcomingReleaseDate({ toDate: () => new Date('2026-10-02T00:00:00Z') }), /Oct 2, 2026/);
});

test('describes exact, approximate, and unconfirmed release information distinctly', () => {
  assert.equal(getUpcomingReleaseDescription({ releaseDateConfidence: 'confirmed' }), 'Confirmed release date');
  assert.equal(getUpcomingReleaseDescription({ releaseDateConfidence: 'approximate' }), 'Approximate release window');
  assert.equal(getUpcomingReleaseDescription({ releaseStatus: 'Announced' }), 'Unconfirmed announcement');
  assert.equal(getUpcomingReleaseDescription({
    source: 'jikan',
    releaseDatePrecision: 'exact',
  }), 'Exact date listed by Jikan');
});
