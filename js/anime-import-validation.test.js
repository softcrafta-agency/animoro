import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  markAnimeImportDuplicates,
  parseAnimeImportJson,
  validateAnimeImportRecord,
} from './anime-import-validation.js';
import { commitAnimeImportBatches } from './anime-import-batches.js';

const validRecord = {
  title: 'Example Anime',
  slug: 'example-anime',
  alternativeTitles: ['Example', 'Example II'],
  synopsis: 'A synopsis.',
  seoTitle: 'Example SEO title',
  seoDescription: 'Example SEO description',
  coverImageUrl: 'https://cdn.example.test/example-anime.webp',
  bannerImageUrl: 'https://cdn.example.test/example-banner.jpg',
  type: 'TV',
  seriesStatus: 'airing',
  releaseYear: 2026,
  studio: 'Example Studio',
  episodes: 12,
  season: 'Spring 2026',
  source: 'Manga',
  rating: 8.5,
  genres: ['Action', ' Fantasy '],
  characters: ['Hero', 'Rival'],
  tags: ['Adventure', 'Drama'],
  releaseDay: 'Monday',
  releaseTime: '12:30',
  releaseTimezone: 'Asia/Kolkata',
  nextEpisode: 3,
  publication: 'published',
};

test('parses JSON arrays and rejects malformed JSON or non-array roots', () => {
  assert.deepEqual(parseAnimeImportJson('[{"title":"Example"}]'), [{ title: 'Example' }]);
  assert.throws(() => parseAnimeImportJson('[{"title":]'), SyntaxError);
  assert.throws(() => parseAnimeImportJson('{"title":"Example"}'), /Expected a JSON array/);
});

test('validates full field mapping and normalizes arrays, aliases, and enum values', () => {
  const result = validateAnimeImportRecord({
    ...validRecord,
    alternativeTitles: 'Example, Example II',
    releaseDay: 'monday',
    releaseTime: '12:30',
    releaseTimezone: 'Asia/Kolkata',
  }, 1);

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.payload.alternativeTitles, ['Example', 'Example II']);
  assert.deepEqual(result.payload.genres, ['Action', 'Fantasy']);
  assert.equal(result.payload.coverImage, validRecord.coverImageUrl);
  assert.equal(result.payload.bannerImage, validRecord.bannerImageUrl);
  assert.equal(result.payload.synopsis, validRecord.synopsis);
  assert.equal(result.payload.seoTitle, validRecord.seoTitle);
  assert.equal(result.payload.seoDescription, validRecord.seoDescription);
  assert.equal(result.payload.status, 'airing');
  assert.equal(result.payload.visibility, 'published');
  assert.equal(result.payload.releaseDay, 'Monday');
  assert.equal(result.payload.releaseYear, 2026);
  assert.equal(result.payload.studio, 'Example Studio');
  assert.equal(result.payload.episodes, 12);
  assert.equal(result.payload.season, 'Spring 2026');
  assert.equal(result.payload.source, 'Manga');
  assert.equal(result.payload.rating, 8.5);
  assert.deepEqual(result.payload.characters, ['Hero', 'Rival']);
  assert.deepEqual(result.payload.tags, ['Adventure', 'Drama']);
  assert.equal(result.payload.releaseTime, '12:30');
  assert.equal(result.payload.timezone, 'Asia/Kolkata');
  assert.equal(result.payload.nextEpisode, 3);
});

test('reports missing required fields and malformed record shapes', () => {
  const missing = validateAnimeImportRecord({ synopsis: 'No title or slug' }, 1);
  assert.equal(missing.valid, false);
  assert.deepEqual(missing.errors.map(error => error.field), ['title', 'slug']);
  assert.equal(validateAnimeImportRecord(null, 2).errors[0].field, 'record');
});

test('rejects invalid enum values, field types, slugs, and non-direct image URLs', () => {
  const result = validateAnimeImportRecord({
    ...validRecord,
    slug: 'Not a slug',
    seriesStatus: 'in production',
    publication: 'public',
    releaseYear: '2026',
    bannerImageUrl: 'https://example.test/anime/',
  }, 1);
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors.map(error => error.field), [
  'bannerImageUrl', 'seriesStatus', 'releaseYear', 'publication', 'slug',
  ]);
});

test('accepts null optional values and maps them to database defaults', () => {
  const result = validateAnimeImportRecord({
    ...validRecord,
    synopsis: null,
    coverImageUrl: null,
    genres: null,
    rating: null,
    releaseYear: null,
    publication: null,
  }, 1);
  assert.equal(result.valid, true);
  assert.equal(result.payload.synopsis, '');
  assert.equal(result.payload.coverImage, '');
  assert.deepEqual(result.payload.genres, []);
  assert.equal(result.payload.rating, null);
  assert.equal(result.payload.releaseYear, null);
  assert.equal(result.payload.visibility, 'draft');
});

test('marks existing and repeated slugs as duplicates without overwriting', () => {
  const records = [
    validateAnimeImportRecord(validRecord, 1),
    validateAnimeImportRecord({ ...validRecord, title: 'Second' }, 2),
    validateAnimeImportRecord({ ...validRecord, slug: 'existing-anime' }, 3),
  ];
  const marked = markAnimeImportDuplicates(records, new Set(['existing-anime']));
  assert.deepEqual(marked.map(record => record.duplicate), [false, true, true]);
  assert.equal(marked.filter(record => record.valid && !record.duplicate).length, 1);
});

test('continues later atomic batches after a partial import failure', async () => {
  const attempts = [];
  const result = await commitAnimeImportBatches([1, 2, 3, 4, 5], async chunk => {
    attempts.push(chunk);
    if (chunk[0] === 3) throw new Error('Batch rejected');
  }, 2);

  assert.deepEqual(attempts, [[1, 2], [3, 4], [5]]);
  assert.equal(result.imported, 3);
  assert.equal(result.failures.length, 1);
  assert.deepEqual(result.failures[0].records, [3, 4]);
  assert.equal(result.failures[0].error.message, 'Batch rejected');
});

test('keeps Firestore anime writes restricted to admin authorization rules', async () => {
  const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
  assert.match(rules, /function isSuperOrDocAdmin\(\)/);
  assert.match(rules, /match \/anime\/\{animeId\}\s*\{\s*allow get, list: if resource\.data\.visibility == 'published' \|\| isSuperOrDocAdmin\(\);\s*allow create, update: if isSuperOrDocAdmin\(\) && isValidEpisodeSchedule\(incoming\(\)\);\s*allow delete: if isSuperOrDocAdmin\(\);/);
  assert.match(rules, /function isValidEpisodeSchedule\(data\)/);
});
