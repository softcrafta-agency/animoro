import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  UPCOMING_RELEASE_STATUSES,
  validateUpcomingImportRecord,
} from './upcoming-import-validation.js';

const sample = {
  animeTitle: 'Valid Import Test',
  animeSlug: 'valid-import-test',
  posterImageUrl: 'https://cdn.example.test/posters/valid-import-test.webp',
  releaseDate: '2026-01-08',
  releaseYear: 2026,
  season: 'Winter',
  releaseStatus: 'Airing',
  type: 'TV',
  genres: ['Fantasy'],
  source: 'Manga',
  episodes: null,
  featuredUpcomingAnime: false,
  status: 'Published',
};

test('accepts a valid record and normalizes database fields without mixing statuses', () => {
  const record = validateUpcomingImportRecord(sample, 1);
  assert.equal(record.valid, true);
  assert.deepEqual(record.errors, []);
  assert.equal(record.payload.title, 'Valid Import Test');
  assert.equal(record.payload.slug, 'valid-import-test');
  assert.equal(record.payload.releaseStatus, 'Airing');
  assert.equal(record.payload.status, 'published');
  assert.equal(record.payload.episodes, 'TBA');
});

test('reports missing required title and slug with actionable field names', () => {
  const record = validateUpcomingImportRecord({ releaseStatus: 'Upcoming' }, 3);
  assert.equal(record.valid, false);
  assert.deepEqual(record.errors.map(error => error.field), ['animeTitle', 'animeSlug']);
});

test('allows supported statuses and rejects unsupported enum values', () => {
  assert.ok(UPCOMING_RELEASE_STATUSES.includes('Airing'));
  assert.ok(UPCOMING_RELEASE_STATUSES.includes('Completed'));
  const invalid = validateUpcomingImportRecord({ ...sample, releaseStatus: 'In Production' }, 1);
  assert.equal(invalid.valid, false);
  assert.equal(invalid.errors[0].field, 'releaseStatus');
});

test('accepts empty optional values, numeric years, null episodes, and supported database aliases', () => {
  const record = validateUpcomingImportRecord({
    title: 'Optional Fields Test',
    slug: 'optional-fields-test',
    poster: '',
    description: '',
    releaseDate: '',
    releaseYear: '',
    season: '',
    releaseStatus: '',
    type: '',
    genres: [],
    episodes: null,
    status: 'draft',
  }, 1);
  assert.equal(record.valid, true);
  assert.equal(record.payload.poster, '');
  assert.equal(record.payload.releaseDate, '');
  assert.equal(record.payload.releaseYear, null);
  assert.equal(record.payload.episodes, 'TBA');
});

test('rejects official websites supplied as poster image URLs', () => {
  const record = validateUpcomingImportRecord({
    ...sample,
    posterImageUrl: 'https://example.test/anime/',
    officialWebsite: 'https://example.test/anime/',
  }, 1);
  assert.equal(record.valid, false);
  assert.equal(record.errors[0].field, 'posterImageUrl');
  assert.match(record.errors[0].message, /direct JPEG, PNG, or WebP image URL/);
  assert.match(record.errors[0].message, /Clear posterImageUrl/);
});

test('accepts Firebase Storage download URLs as posters', () => {
  const record = validateUpcomingImportRecord({
    ...sample,
    posterImageUrl: 'https://firebasestorage.googleapis.com/v0/b/animoro/o/images%2Fupcoming%2Fposter.webp?alt=media&token=abc123',
  }, 1);
  assert.equal(record.valid, true);
  assert.equal(record.payload.poster, 'https://firebasestorage.googleapis.com/v0/b/animoro/o/images%2Fupcoming%2Fposter.webp?alt=media&token=abc123');
});

test('validates the eight supplied records and reports each non-image poster field', async () => {
  const records = JSON.parse(await readFile(new URL('../anime.json', import.meta.url), 'utf8'));
  const expectedTitles = [
    'Jujutsu Kaisen Season 3',
    "Frieren: Beyond Journey's End Season 2",
    "Hell's Paradise Season 2",
    'Oshi no Ko Season 3',
    'Fire Force Season 3 Part 2',
    'Fate/strange Fake',
    'Re:ZERO -Starting Life in Another World- Season 4',
    'Witch Hat Atelier',
  ];
  assert.deepEqual(records.map(record => record.animeTitle), expectedTitles);

  const withoutPosterPageUrls = records.map(record => {
    const { posterImageUrl, ...rest } = record;
    return rest;
  });
  const validRecords = withoutPosterPageUrls.map((record, index) => validateUpcomingImportRecord(record, index + 1));
  assert.ok(validRecords.every(record => record.valid));
  assert.deepEqual(validRecords.map(record => record.payload.releaseStatus), [
    'Airing', 'Airing', 'Completed', 'Airing', 'Completed', 'Airing', 'Airing', 'Airing',
  ]);
  assert.ok(validRecords.every(record => record.payload.status === 'published'));
  assert.ok(validRecords.every(record => record.payload.releaseYear === '2026'));
  assert.ok(validRecords.every(record => record.payload.episodes === 'TBA' || typeof record.payload.episodes === 'string'));

  const rejected = records.map((record, index) => validateUpcomingImportRecord(record, index + 1));
  assert.ok(rejected.every(record => !record.valid));
  assert.ok(rejected.every(record => record.errors.length === 1 && record.errors[0].field === 'posterImageUrl'));
  assert.ok(rejected.every(record => /not an official website page/.test(record.errors[0].message)));
});
