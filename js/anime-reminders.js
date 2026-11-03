import {
  formatCalendarDate,
  getBroadcastSchedulesForPeriod,
  getZonedDateTimeInstant,
} from './anime-release-calendar.js';

const REMINDER_STORAGE_PREFIX = 'animoro_anime_reminders:';
const BROADCAST_REMINDER_LEAD_MS = 30 * 60 * 1000;

function getReminderStorageKey(uid) {
  if (typeof uid !== 'string' || !uid.trim()) {
    throw new TypeError('A signed-in user ID is required for anime reminders.');
  }
  return `${REMINDER_STORAGE_PREFIX}${uid}`;
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readReminderPreferences(uid) {
  const storageKey = getReminderStorageKey(uid);
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const value = JSON.parse(raw);
    return isRecord(value) ? value : {};
  } catch (error) {
    console.warn('Could not read anime reminder preferences:', error);
    return {};
  }
}

function writeReminderPreferences(uid, preferences) {
  window.localStorage.setItem(getReminderStorageKey(uid), JSON.stringify(preferences));
}

export function isAnimeReminderEnabled(listKey, uid) {
  return readReminderPreferences(uid)[listKey]?.enabled === true;
}

export function setAnimeReminderEnabled(listKey, enabled, uid) {
  if (typeof listKey !== 'string' || !listKey) {
    throw new TypeError('An anime list key is required to update a reminder.');
  }

  const preferences = readReminderPreferences(uid);
  if (enabled) {
    preferences[listKey] = { enabled: true };
  } else {
    delete preferences[listKey];
  }
  writeReminderPreferences(uid, preferences);
}

export function getAnimeReminderLastNotified(listKey, uid) {
  const value = readReminderPreferences(uid)[listKey]?.lastNotifiedFor;
  return typeof value === 'string' ? value : '';
}

export function markAnimeReminderNotified(listKey, occurrenceKey, uid) {
  const preferences = readReminderPreferences(uid);
  if (preferences[listKey]?.enabled !== true) return;
  preferences[listKey] = { ...preferences[listKey], lastNotifiedFor: occurrenceKey };
  writeReminderPreferences(uid, preferences);
}

function getValidTimezone(timeZone) {
  const candidate = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  try {
    new Intl.DateTimeFormat('en', { timeZone: candidate }).format();
    return candidate;
  } catch {
    return 'UTC';
  }
}

export function getNextAnimeReminder(item, now = new Date(), timeZone) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new TypeError('A valid current date is required to calculate an anime reminder.');
  }
  const viewerTimezone = getValidTimezone(timeZone);
  const broadcast = getBroadcastSchedulesForPeriod(
    [item],
    now,
    viewerTimezone,
    'week'
  )[0];

  if (broadcast) {
    const releaseInstant = broadcast.releaseInstant;
    return {
      kind: 'broadcast',
      canRemind: Number.isFinite(releaseInstant),
      eventAt: Number.isFinite(releaseInstant) ? releaseInstant : null,
      remindAt: Number.isFinite(releaseInstant)
        ? releaseInstant - BROADCAST_REMINDER_LEAD_MS
        : null,
      label: Number.isFinite(releaseInstant)
        ? formatCalendarDate(new Date(releaseInstant), viewerTimezone, {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
        : `${broadcast.calendarDate} (time not listed)`,
      timezone: broadcast.releaseTimezone,
    };
  }

  const date = typeof item?.releaseDate === 'string' ? item.releaseDate : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const eventAt = getZonedDateTimeInstant(date, '09:00', viewerTimezone);
  if (eventAt === null || eventAt <= now.getTime()) return null;

  return {
    kind: 'release',
    canRemind: true,
    eventAt,
    remindAt: eventAt,
    label: formatCalendarDate(new Date(`${date}T12:00:00.000Z`), 'UTC', {
      dateStyle: 'medium',
    }),
    reminderTimeLabel: formatCalendarDate(new Date(eventAt), viewerTimezone, {
      timeStyle: 'short',
    }),
    timezone: viewerTimezone,
  };
}
