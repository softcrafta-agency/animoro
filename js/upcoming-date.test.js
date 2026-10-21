import assert from 'node:assert/strict';
import test from 'node:test';
import { formatUpcomingReleaseDate, getUpcomingReleaseTimestamp } from './upcoming-date.js';

test('sorts valid string and Firestore-style dates chronologically', () => {
  const timestamp = { toDate: () => new Date('2026-10-02T00:00:00Z') };

  assert.ok(getUpcomingReleaseTimestamp('2026-10-01') < getUpcomingReleaseTimestamp(timestamp));
  assert.equal(getUpcomingReleaseTimestamp('not a date'), Infinity);
});

test('formats date values while preserving descriptive release labels', () => {
  assert.equal(formatUpcomingReleaseDate(null), 'TBA');
  assert.equal(formatUpcomingReleaseDate('Spring 2027'), 'Spring 2027');
  assert.equal(formatUpcomingReleaseDate('October 2026'), 'October 2026');
  assert.match(formatUpcomingReleaseDate('2026-10-02'), /Oct 2, 2026/);
  assert.match(formatUpcomingReleaseDate({ toDate: () => new Date('2026-10-02T00:00:00Z') }), /Oct 2, 2026/);
});
