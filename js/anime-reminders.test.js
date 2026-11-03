import assert from 'node:assert/strict';
import test from 'node:test';

const storage = new Map();
globalThis.window = {
  localStorage: {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
  },
};

const {
  getAnimeReminderLastNotified,
  getNextAnimeReminder,
  isAnimeReminderEnabled,
  markAnimeReminderNotified,
  setAnimeReminderEnabled,
} = await import('./anime-reminders.js');

const now = new Date('2026-11-03T12:00:00.000Z');

test('airing reminders use the next weekly broadcast and lead it by 30 minutes', () => {
  const reminder = getNextAnimeReminder({
    malId: 123,
    broadcast: { day: 'Thursday', time: '19:00', timezone: 'UTC' },
  }, now, 'UTC');

  assert.equal(reminder.kind, 'broadcast');
  assert.equal(reminder.canRemind, true);
  assert.equal(new Date(reminder.eventAt).toISOString(), '2026-11-05T19:00:00.000Z');
  assert.equal(new Date(reminder.remindAt).toISOString(), '2026-11-05T18:30:00.000Z');
});

test('weekly schedules without a time can be displayed but cannot trigger a reminder', () => {
  const reminder = getNextAnimeReminder({
    malId: 124,
    broadcast: { day: 'Thursday', time: '', timezone: 'UTC' },
  }, now, 'UTC');

  assert.equal(reminder.kind, 'broadcast');
  assert.equal(reminder.canRemind, false);
  assert.equal(reminder.eventAt, null);
});

test('exact release dates can be reminded in the viewer timezone, but imprecise dates cannot', () => {
  const exact = getNextAnimeReminder({ releaseDate: '2026-11-05' }, now, 'UTC');
  assert.equal(exact.kind, 'release');
  assert.equal(new Date(exact.eventAt).toISOString(), '2026-11-05T09:00:00.000Z');
  assert.equal(exact.label, 'Nov 5, 2026');
  assert.ok(exact.reminderTimeLabel);
  assert.equal(getNextAnimeReminder({ releaseDate: 'November 2026' }, now, 'UTC'), null);
  assert.equal(getNextAnimeReminder({ releaseDate: '2026-11-02' }, now, 'UTC'), null);
});

test('reminder preferences are scoped to the signed-in user and track delivered occurrences', () => {
  storage.clear();
  setAnimeReminderEnabled('anime:naruto--123', true, 'user-one');
  assert.equal(isAnimeReminderEnabled('anime:naruto--123', 'user-one'), true);
  assert.equal(isAnimeReminderEnabled('anime:naruto--123', 'user-two'), false);

  markAnimeReminderNotified('anime:naruto--123', '1793905200000', 'user-one');
  assert.equal(getAnimeReminderLastNotified('anime:naruto--123', 'user-one'), '1793905200000');

  setAnimeReminderEnabled('anime:naruto--123', false, 'user-one');
  assert.equal(isAnimeReminderEnabled('anime:naruto--123', 'user-one'), false);
});

test('reminder preferences require an account and a valid list item key', () => {
  assert.throws(() => setAnimeReminderEnabled('anime:item', true, ''), /signed-in user ID/);
  assert.throws(() => setAnimeReminderEnabled('', true, 'user-one'), /list key/);
});
