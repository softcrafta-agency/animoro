import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getCalendarDateKey,
  getCalendarWindow,
  getReleaseInstant,
  getSchedulesForPeriod,
  getZonedDateTimeInstant,
  isValidReleaseSchedule,
} from './anime-release-calendar.js';

test('validates explicit schedules independently of series release fields', () => {
  assert.equal(isValidReleaseSchedule({
    episodeReleaseDate: '2026-10-22',
    episodeReleaseTime: '20:30',
    episodeTimezone: 'Asia/Kolkata',
    episodeReleaseStatus: 'Scheduled',
  }), true);
  assert.equal(isValidReleaseSchedule({
    episodeReleaseDate: '2026-02-30',
    episodeReleaseTime: '20:30',
    episodeTimezone: 'Asia/Kolkata',
    episodeReleaseStatus: 'Scheduled',
  }), false);
});

test('converts a scheduled local time to the correct instant', () => {
  const release = getReleaseInstant({
    episodeReleaseDate: '2026-10-22',
    episodeReleaseTime: '20:30',
    episodeTimezone: 'Asia/Kolkata',
    episodeReleaseStatus: 'Scheduled',
  });

  assert.equal(new Date(release).toISOString(), '2026-10-22T15:00:00.000Z');
  assert.equal(getCalendarDateKey(new Date(release), 'America/Los_Angeles'), '2026-10-22');
});

test('calculates today, tomorrow, and the remaining calendar-week boundaries in the chosen timezone', () => {
  const now = new Date('2026-10-21T18:45:00.000Z');
  const today = getCalendarWindow(now, 'Asia/Kolkata', 'today');
  const tomorrow = getCalendarWindow(now, 'Asia/Kolkata', 'tomorrow');
  const week = getCalendarWindow(now, 'Asia/Kolkata', 'week');

  assert.equal(new Date(today.start).toISOString(), '2026-10-21T18:30:00.000Z');
  assert.equal(new Date(today.end).toISOString(), '2026-10-22T18:30:00.000Z');
  assert.equal(new Date(tomorrow.start).toISOString(), new Date(today.end).toISOString());
  assert.equal(new Date(week.end).toISOString(), '2026-10-25T18:30:00.000Z');
  assert.equal(today.startDate, '2026-10-20');
  assert.equal(today.endDate, '2026-10-25');
});

test('ends the calendar week at the next Monday in the selected timezone', () => {
  const monday = getCalendarWindow(new Date('2026-10-26T06:30:00.000Z'), 'Asia/Kolkata', 'week');
  const sunday = getCalendarWindow(new Date('2026-10-25T06:30:00.000Z'), 'Asia/Kolkata', 'week');

  assert.equal(new Date(monday.end).toISOString(), '2026-11-01T18:30:00.000Z');
  assert.equal(new Date(sunday.end).toISOString(), '2026-10-25T18:30:00.000Z');
});

test('uses timezone-aware midnight boundaries across daylight saving changes', () => {
  const window = getCalendarWindow(new Date('2026-03-08T17:00:00.000Z'), 'America/Los_Angeles', 'today');

  assert.equal(new Date(window.start).toISOString(), '2026-03-08T08:00:00.000Z');
  assert.equal(new Date(window.end).toISOString(), '2026-03-09T07:00:00.000Z');
});

test('rejects a nonexistent daylight-saving local release time', () => {
  assert.equal(
    getZonedDateTimeInstant('2026-03-08', '02:30', 'America/Los_Angeles'),
    null
  );
});

test('filters schedules into today, tomorrow, and the remaining calendar week', () => {
  const schedules = [
    { title: 'Today', episodeReleaseDate: '2026-10-22', episodeReleaseTime: '00:30', episodeTimezone: 'Asia/Kolkata', episodeReleaseStatus: 'Scheduled' },
    { title: 'Tomorrow', episodeReleaseDate: '2026-10-23', episodeReleaseTime: '00:30', episodeTimezone: 'Asia/Kolkata', episodeReleaseStatus: 'Delayed' },
    { title: 'Sunday', episodeReleaseDate: '2026-10-25', episodeReleaseTime: '23:30', episodeTimezone: 'Asia/Kolkata', episodeReleaseStatus: 'Scheduled' },
    { title: 'Monday', episodeReleaseDate: '2026-10-26', episodeReleaseTime: '00:30', episodeTimezone: 'Asia/Kolkata', episodeReleaseStatus: 'Scheduled' },
  ];
  const now = new Date('2026-10-21T20:00:00.000Z');

  assert.deepEqual(
    getSchedulesForPeriod(schedules, now, 'Asia/Kolkata', 'today').map(item => item.title),
    ['Today']
  );
  assert.deepEqual(
    getSchedulesForPeriod(schedules, now, 'Asia/Kolkata', 'tomorrow').map(item => item.title),
    ['Tomorrow']
  );
  assert.deepEqual(
    getSchedulesForPeriod(schedules, now, 'Asia/Kolkata', 'week').map(item => item.title),
    ['Today', 'Tomorrow', 'Sunday']
  );
});
