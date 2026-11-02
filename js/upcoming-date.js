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
    if (typeof value === 'string') {
      const season = normalized.match(/^(winter|spring|summer|fall|autumn)\s+(\d{4})$/i);
      if (season) {
        const month = { winter: 0, spring: 3, summer: 6, fall: 9, autumn: 9 }[season[1].toLowerCase()];
        return new Date(Number(season[2]), month, 1);
      }
      if (/^\d{4}$/.test(normalized)) return new Date(Number(normalized), 0, 1);
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
        /^[a-z]+\s+\d{4}$/i.test(normalized) ||
        /^\d{4}$/.test(normalized)) {
      return normalized;
    }
  }
  const date = toUpcomingDate(value);
  return date
    ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : String(value);
}

export function getUpcomingReleaseDescription(item) {
  const confidence = String(item?.releaseDateConfidence || '').toLowerCase();
  if (confidence === 'confirmed') return 'Confirmed release date';
  if (confidence === 'approximate') return 'Approximate release window';
  if (confidence === 'unconfirmed') return 'Unconfirmed announcement';

  if (item?.releaseDatePrecision === 'exact') {
    return item.source === 'jikan' ? 'Exact date listed by Jikan' : 'Exact date listed by editor';
  }
  if (['month', 'year'].includes(item?.releaseDatePrecision)) return 'Approximate release window';

  const value = item?.releaseDate;
  if (value instanceof Date ||
      (value && typeof value.toDate === 'function')) {
    return item.source === 'jikan' ? 'Exact date listed by Jikan' : 'Exact date listed by editor';
  }
  const date = String(value || '').trim();
  if (/^(winter|spring|summer|fall|autumn)\s+\d{4}$/i.test(date) ||
      /^[a-z]+\s+\d{4}$/i.test(date) ||
      /^\d{4}$/.test(date)) {
    return 'Approximate release window';
  }
  if (String(item?.releaseStatus || '').toLowerCase() === 'announced') {
    return 'Unconfirmed announcement';
  }
  if (item?.source === 'jikan' && item?.releaseStatus) return item.releaseStatus;
  return item?.releaseStatus || 'Release Date TBA';
}
