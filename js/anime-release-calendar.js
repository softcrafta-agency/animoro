const RELEASE_STATUSES = new Set(['Scheduled', 'Released', 'Delayed', 'Cancelled']);

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function isValidTime(value) {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function getDateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  return Object.fromEntries(parts
    .filter(part => part.type !== 'literal')
    .map(part => [part.type, Number(part.value)]));
}

function getDateTimeParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts
    .filter(part => part.type !== 'literal')
    .map(part => [part.type, Number(part.value)]));
}

function dateStringFromParts({ year, month, day }) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addCalendarDays(dateString, days) {
  if (!isValidDate(dateString)) throw new RangeError('Expected a valid YYYY-MM-DD date.');
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return dateStringFromParts({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

export function getCalendarDateRange(now, timeZone, period) {
  if (!['today', 'tomorrow', 'week'].includes(period)) throw new RangeError('Unknown calendar period.');
  const { year, month, day } = getDateParts(now, timeZone);
  const today = dateStringFromParts({ year, month, day });
  const startDate = addCalendarDays(today, period === 'tomorrow' ? 1 : 0);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const daysUntilNextMonday = weekday === 0 ? 1 : 8 - weekday;
  const endDate = addCalendarDays(startDate, period === 'week' ? daysUntilNextMonday : 1);
  return { startDate, endDate };
}

export function getUpcomingReleaseDate(value, timeZone) {
  if (typeof value === 'string') {
    if (isValidDate(value)) {
      return {
        dateKey: value,
        date: new Date(`${value}T12:00:00.000Z`),
        isInstant: false,
      };
    }
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
      return null;
    }
    if (!isValidDate(value.slice(0, 10))) return null;
  }

  let date = value instanceof Date ? value : null;
  if (!date && value && typeof value.toDate === 'function') {
    try {
      date = value.toDate();
    } catch {
      return null;
    }
  }
  if (!date && typeof value === 'string') date = new Date(value);
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return null;

  try {
    return {
      dateKey: getCalendarDateKey(date, timeZone),
      date,
      isInstant: true,
    };
  } catch {
    return null;
  }
}

export function getUpcomingAnimeForPeriod(records, now, timeZone, period) {
  const { startDate, endDate } = getCalendarDateRange(now, timeZone, period);
  const seen = new Set();

  return records
    .map(record => {
      if (record.status !== 'published') return null;
      if (record.id && seen.has(record.id)) return null;
      const release = getUpcomingReleaseDate(record.releaseDate, timeZone);
      if (!release || release.dateKey < startDate || release.dateKey >= endDate) return null;
      if (record.id) seen.add(record.id);
      return {
        ...record,
        calendarDate: release.dateKey,
        calendarDateValue: release.date,
        calendarDateIsInstant: release.isInstant,
      };
    })
    .filter(Boolean)
    .sort((left, right) =>
      left.calendarDate.localeCompare(right.calendarDate) ||
      String(left.title || '').localeCompare(String(right.title || ''))
    );
}

export function isValidReleaseSchedule(schedule) {
  if (!schedule || typeof schedule !== 'object') return false;
  if (!isValidDate(schedule.episodeReleaseDate)) return false;
  if (schedule.episodeReleaseTime && !isValidTime(schedule.episodeReleaseTime)) return false;
  if (!RELEASE_STATUSES.has(schedule.episodeReleaseStatus)) return false;
  if (typeof schedule.episodeTimezone !== 'string' || !schedule.episodeTimezone.trim()) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: schedule.episodeTimezone }).format();
  } catch {
    return false;
  }
  return true;
}

export function getZonedDateTimeInstant(dateString, timeString, timeZone) {
  if (!isValidDate(dateString) || !isValidTime(timeString)) return null;
  try {
    new Intl.DateTimeFormat('en', { timeZone }).format();
  } catch {
    return null;
  }

  const [year, month, day] = dateString.split('-').map(Number);
  const [hour, minute] = timeString.split(':').map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = target;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = getDateTimeParts(new Date(candidate), timeZone);
    const represented = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
    const difference = represented - target;
    if (difference === 0) return candidate;
    candidate -= difference;
  }

  const actual = getDateTimeParts(new Date(candidate), timeZone);
  return actual.year === year && actual.month === month && actual.day === day &&
    actual.hour === hour && actual.minute === minute
    ? candidate
    : null;
}

export function getCalendarWindow(now, timeZone, period) {
  const { startDate, endDate } = getCalendarDateRange(now, timeZone, period);
  const start = getZonedDateTimeInstant(startDate, '00:00', timeZone);
  const end = getZonedDateTimeInstant(endDate, '00:00', timeZone);
  if (start === null || end === null) throw new RangeError('Could not calculate calendar date boundaries.');

  return {
    start,
    end,
    startDate: addCalendarDays(startDate, -2),
    endDate: addCalendarDays(endDate, 2),
  };
}

export function getReleaseInstant(schedule) {
  if (!isValidReleaseSchedule(schedule)) return null;
  return getZonedDateTimeInstant(
    schedule.episodeReleaseDate,
    schedule.episodeReleaseTime || '12:00',
    schedule.episodeTimezone
  );
}

export function formatCalendarDate(date, timeZone, options = {}) {
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone }).format(date);
}

export function getCalendarDateKey(date, timeZone) {
  return dateStringFromParts(getDateParts(date, timeZone));
}

export function getSchedulesForPeriod(schedules, now, timeZone, period) {
  const window = getCalendarWindow(now, timeZone, period);
  return schedules
    .map(schedule => ({ ...schedule, releaseInstant: getReleaseInstant(schedule) }))
    .filter(schedule =>
      schedule.releaseInstant !== null &&
      schedule.releaseInstant >= window.start &&
      schedule.releaseInstant < window.end
    )
    .sort((left, right) =>
      left.releaseInstant - right.releaseInstant ||
      String(left.title || '').localeCompare(String(right.title || ''))
    );
}
