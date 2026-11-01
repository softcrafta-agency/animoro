import assert from 'node:assert/strict';
import test from 'node:test';
import { getDirectJikanUrl, normalizeJikanAnime } from './jikan-service.js';

test('builds valid direct Jikan fallback URLs for list, upcoming, top, and detail requests', () => {
  assert.equal(
    getDirectJikanUrl('resource=anime&page=2&limit=24&q=Naruto'),
    'https://api.jikan.moe/v4/anime?page=2&limit=24&q=Naruto',
  );
  assert.equal(
    getDirectJikanUrl('resource=upcoming&page=1&limit=24'),
    'https://api.jikan.moe/v4/seasons/upcoming?page=1&limit=24',
  );
  assert.equal(
    getDirectJikanUrl('resource=top&limit=6'),
    'https://api.jikan.moe/v4/top/anime?limit=6',
  );
  assert.equal(
    getDirectJikanUrl('resource=detail&id=20'),
    'https://api.jikan.moe/v4/anime/20/full',
  );
});

test('normalizes Jikan anime data with a stable internal MAL identifier and poster fallback', () => {
  const anime = normalizeJikanAnime({
    mal_id: 20,
    title: 'Naruto',
    title_japanese: 'NARUTO',
    images: { jpg: { large_image_url: 'https://cdn.example.test/naruto.jpg' } },
    synopsis: 'A young ninja seeks recognition.',
    genres: [{ name: 'Action' }],
    themes: [{ name: 'Martial Arts' }],
    score: 8.1,
    status: 'Finished Airing',
    aired: { from: '2002-10-03T00:00:00+00:00', prop: { from: { year: 2002 } } },
    type: 'TV',
  });

  assert.equal(anime.id, 'jikan-20');
  assert.equal(anime.malId, 20);
  assert.equal(anime.slug, 'naruto--20');
  assert.equal(anime.coverImage, 'https://cdn.example.test/naruto.jpg');
  assert.deepEqual(anime.genres, ['Action', 'Martial Arts']);
  assert.equal(anime.status, 'completed');
  assert.equal(anime.releaseYear, '2002');
});

test('does not invent an upcoming release date when Jikan has none', () => {
  const anime = normalizeJikanAnime({ mal_id: 101, title: 'Future Story', status: 'Not yet aired' }, 'upcoming');
  assert.equal(anime.releaseDate, '');
  assert.equal(anime.releaseStatus, 'Release Date TBA');
});
