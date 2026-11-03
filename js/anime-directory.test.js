import assert from 'node:assert/strict';
import test from 'node:test';
import { deduplicateAnime, filterAndSortAnime } from './anime-directory.js';

const entries = [
  {
    title: 'Naruto',
    alternativeTitles: ['NARUTO Shippuden'],
    type: 'TV',
    status: 'Currently Airing',
    genres: [{ name: 'Action' }],
    popularity: 2,
    rating: 8.3,
    releaseDate: '2002-10-03',
  },
  {
    title: 'Boruto',
    type: 'TV',
    status: 'Finished Airing',
    genres: ['Action'],
    popularity: 20,
    rating: 6.1,
    releaseYear: '2017',
  },
  {
    title: 'Anime Without Metadata',
    type: null,
    status: null,
    genres: null,
    popularity: null,
    rating: null,
  },
  {
    title: 'Airing Fantasy',
    type: 'TV',
    status: 'airing',
    genres: ['Fantasy'],
    popularity: 5,
    score: 9.2,
    releaseYear: 2024,
  },
];

test('search trims whitespace, ignores case, and matches alternative titles with filters', () => {
  assert.deepEqual(
    filterAndSortAnime(entries, {
      query: '  NARUTO ',
      type: 'tv',
      status: 'airing',
      genre: 'action',
    }).map(anime => anime.title),
    ['Naruto']
  );
});

test('search matches Japanese and alternative titles', () => {
  const titledAnime = [{
    title: 'Kimi no Na wa.',
    japaneseTitle: '君の名は。',
    alternativeTitles: ['Your Name'],
    type: 'Movie',
    genres: ['Romance'],
  }];

  for (const query of ['kimi no', '君の名は', 'your name']) {
    assert.equal(filterAndSortAnime(titledAnime, { query }).length, 1, query);
  }
});

test('directory results remove duplicate anime IDs without collapsing distinct editions', () => {
  const duplicates = [
    { title: 'One', malId: 1 },
    { title: 'Duplicate One', malId: 1 },
    { title: 'Two', malId: 2 },
    { title: 'Unidentified entry' },
    { title: 'Unidentified entry' },
  ];

  assert.deepEqual(deduplicateAnime(duplicates), [duplicates[0], duplicates[2], duplicates[3], duplicates[4]]);
  assert.deepEqual(filterAndSortAnime(duplicates).map(anime => anime.title), [
    'One',
    'Two',
    'Unidentified entry',
    'Unidentified entry',
  ]);
});

test('a nonexistent title returns no results without affecting the empty-search reset', () => {
  assert.deepEqual(filterAndSortAnime(entries, { query: 'no matching anime' }), []);
  assert.equal(filterAndSortAnime(entries, { query: '' }).length, entries.length);
});

test('empty search and default filters do not filter out entries with missing metadata', () => {
  assert.equal(filterAndSortAnime(entries, { query: '   ', type: '', status: '', genre: '' }).length, 4);
});

test('status aliases match finished-airing records and clear when no status is selected', () => {
  assert.deepEqual(
    filterAndSortAnime(entries, { status: 'complete' }).map(anime => anime.title),
    ['Boruto']
  );
  assert.equal(filterAndSortAnime(entries, { status: '' }).length, 4);
});

test('genre filters support string and object values and leave null genres safe', () => {
  assert.deepEqual(
    filterAndSortAnime(entries, { genre: 'action' }).map(anime => anime.title),
    ['Naruto', 'Boruto']
  );
  assert.deepEqual(
    filterAndSortAnime(entries, { genre: 'fantasy' }).map(anime => anime.title),
    ['Airing Fantasy']
  );
});

test('popularity uses lower rank first and never substitutes rating for missing rank', () => {
  assert.deepEqual(
    filterAndSortAnime(entries, { sort: 'popularity' }).map(anime => anime.title),
    ['Naruto', 'Airing Fantasy', 'Boruto', 'Anime Without Metadata']
  );
});

test('score and newest sorting use their own fields and place missing data last', () => {
  assert.deepEqual(
    filterAndSortAnime(entries, { sort: 'score' }).map(anime => anime.title),
    ['Airing Fantasy', 'Naruto', 'Boruto', 'Anime Without Metadata']
  );
  assert.deepEqual(
    filterAndSortAnime(entries, { sort: 'start_date' }).map(anime => anime.title),
    ['Airing Fantasy', 'Boruto', 'Naruto', 'Anime Without Metadata']
  );
});

test('title sorting is alphabetic and stable for equal titles', () => {
  const titledEntries = [
    { title: 'Naruto' },
    { title: 'A Name' },
    { title: 'A Name' },
  ];

  assert.deepEqual(
    filterAndSortAnime(titledEntries, { sort: 'title' }),
    [titledEntries[1], titledEntries[2], titledEntries[0]]
  );
});
