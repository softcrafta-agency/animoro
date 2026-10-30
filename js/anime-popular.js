export function selectPopularAnime(entries, maximum = 6) {
  const seenIds = new Set();
  const seenSlugs = new Set();

  return entries
    .filter(anime => {
      const rating = Number(anime.rating);
      if (anime.visibility !== 'published' ||
          !Number.isFinite(rating) ||
          rating <= 0 ||
          rating > 10 ||
          seenIds.has(anime.id) ||
          (anime.slug && seenSlugs.has(anime.slug))) {
        return false;
      }
      seenIds.add(anime.id);
      if (anime.slug) seenSlugs.add(anime.slug);
      return true;
    })
    .sort((left, right) =>
      Number(right.rating) - Number(left.rating) ||
      String(left.title || '').localeCompare(String(right.title || '')) ||
      String(left.id || '').localeCompare(String(right.id || ''))
    )
    .slice(0, maximum);
}
