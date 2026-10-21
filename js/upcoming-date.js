function toUpcomingDate(value) {
  if (value && typeof value.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
  }
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const normalized = String(value).trim();
    if (typeof value === 'string' &&
        /^(winter|spring|summer|fall|autumn)\s+\d{4}$/i.test(normalized)) {
      return null;
    }
    const monthYear = typeof value === 'string'
      ? normalized.match(/^([a-z]+)\s+(\d{4})$/i)
      : null;
    const dateOnly = typeof value === 'string'
      ? normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      : null;
    const month = monthYear
      ? new Date(`${monthYear[1]} 1, ${monthYear[2]}`)
      : null;
    const date = dateOnly
      ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
      : monthYear && month && Number.isFinite(month.getTime())
        ? month
        : new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  return null;
}

export function getUpcomingReleaseTimestamp(value) {
  return toUpcomingDate(value)?.getTime() ?? Infinity;
}

export function formatUpcomingReleaseDate(value) {
  if (!value) return 'TBA';
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (/^(winter|spring|summer|fall|autumn)\s+\d{4}$/i.test(normalized) ||
        /^[a-z]+\s+\d{4}$/i.test(normalized)) {
      return normalized;
    }
  }
  const date = toUpcomingDate(value);
  return date
    ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : String(value);
}
