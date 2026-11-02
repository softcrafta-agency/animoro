function normalizeText(value) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).trim().toLowerCase()
    : '';
}

function normalizeStatus(value) {
  const status = normalizeText(value);
  if (status.includes('finish') || status === 'complete') return 'completed';
  if (status.includes('airing')) return 'airing';
  if (status.includes('not yet') || status === 'upcoming') return 'upcoming';
  return status;
}

function getGenres(anime) {
  const genres = Array.isArray(anime.genres) ? anime.genres : [];
  return genres.map(genre => normalizeText(
    typeof genre === 'object' && genre !== null ? genre.name : genre
  )).filter(Boolean);
}

function getSearchableTitles(anime) {
  const alternatives = Array.isArray(anime.alternativeTitles)
    ? anime.alternativeTitles
    : typeof anime.alternativeTitles === 'string' ? [anime.alternativeTitles] : [];
  return [anime.title, anime.japaneseTitle, ...alternatives].map(normalizeText).filter(Boolean);
}

function numericValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function compareNumeric(left, right, direction = 'desc') {
  const a = numericValue(left);
  const b = numericValue(right);
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return direction === 'asc' ? a - b : b - a;
}

function getReleaseValue(anime) {
  return anime.releaseDate || anime.aired?.from || anime.startDate ||
    anime.releaseYear || anime.year || '';
}

function getReleaseTimestamp(value) {
  const year = typeof value === 'number' || typeof value === 'string'
    ? String(value).match(/^(19|20|21)\d{2}$/)
    : null;
  if (year) return Date.UTC(Number(year[0]), 0, 1);
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function filterAndSortAnime(entries, filters = {}) {
  const query = normalizeText(filters.query);
  const type = normalizeText(filters.type);
  const status = normalizeStatus(filters.status);
  const genre = normalizeText(filters.genre);
  const sort = normalizeText(filters.sort) || 'popularity';

  return entries
    .map((anime, index) => ({ anime, index }))
    .filter(({ anime }) => {
      if (!anime || typeof anime !== 'object') return false;
      const matchesQuery = !query || getSearchableTitles(anime).some(title => title.includes(query));
      const matchesType = !type || normalizeText(anime.type) === type;
      const matchesStatus = !status || normalizeStatus(anime.status) === status;
      const matchesGenre = !genre || getGenres(anime).includes(genre);
      return matchesQuery && matchesType && matchesStatus && matchesGenre;
    })
    .sort((left, right) => {
      let comparison = 0;
      if (sort === 'title') {
        comparison = String(left.anime.title || '').localeCompare(String(right.anime.title || ''));
      } else if (sort === 'start_date') {
        comparison = compareNumeric(
          getReleaseTimestamp(getReleaseValue(left.anime)),
          getReleaseTimestamp(getReleaseValue(right.anime))
        );
      } else if (sort === 'score') {
        comparison = compareNumeric(left.anime.score ?? left.anime.rating, right.anime.score ?? right.anime.rating);
      } else {
        comparison = compareNumeric(left.anime.popularity, right.anime.popularity, 'asc');
      }
      return comparison || left.index - right.index;
    })
    .map(({ anime }) => anime);
}
