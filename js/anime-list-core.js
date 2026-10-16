export function validateAnimeListName(input) {
  if (typeof input !== 'string') return { error: 'Enter a list name.' };
  const name = input.trim().replace(/\s+/g, ' ');
  if (!name) return { error: 'Enter a list name.' };
  if (name.length > 60) return { error: 'List names must be 60 characters or fewer.' };
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (!slug) return { error: 'List names must include at least one letter or number.' };
  return { name, slug };
}

export function planAnimeListMembership(animeIds, existingIds) {
  const existing = new Set(existingIds);
  const uniqueIds = [...new Set(animeIds)];
  return {
    toAdd: uniqueIds.filter(id => !existing.has(id)),
    alreadyPresent: uniqueIds.filter(id => existing.has(id)).length,
  };
}

export function chunkAnimeListIds(ids, size = 400) {
  if (!Number.isInteger(size) || size < 1 || size > 500) {
    throw new RangeError('Anime list batch size must be between 1 and 500.');
  }
  const chunks = [];
  for (let offset = 0; offset < ids.length; offset += size) {
    chunks.push(ids.slice(offset, offset + size));
  }
  return chunks;
}
