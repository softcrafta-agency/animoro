import assert from 'node:assert/strict';
import test from 'node:test';
import { createManhwaDetailStructuredData, createManhwaStructuredData } from './manhwa-seo.js';

const featured = {
  id: 140407,
  title: 'The Greatest Estate Developer',
  contentType: 'Manhwa',
  countryName: 'South Korea',
  originalTitle: '역대급 영지 설계사',
  releaseYear: 2020,
  rating: 84,
  slug: 'the-greatest-estate-developer',
  isConfirmedManhwa: true,
  synopsis: 'A civil engineering student wakes up inside a fantasy novel.',
  genres: ['Comedy', 'Fantasy'],
  authors: ['Hyeon-Min Lee'],
  artists: ['Hyeon-Su Kim'],
  coverImage: 'https://images.example/cover.jpg',
  siteUrl: 'https://anilist.co/manga/140407',
};

test('creates a collection page with featured series and breadcrumbs', () => {
  const data = createManhwaStructuredData(featured);
  assert.equal(data['@context'], 'https://schema.org');
  assert.ok(data['@graph'].some(item => item['@type'] === 'CollectionPage'));
  const featuredList = data['@graph'].find(item => item['@type'] === 'ItemList');
  assert.equal(featuredList.itemListElement[0].item['@type'], 'ComicSeries');
  assert.equal(featuredList.itemListElement[0].item.name, featured.title);
  assert.equal(featuredList.itemListElement[0].item.countryOfOrigin.name, 'South Korea');
});

test('creates title-specific structured data and canonical breadcrumb', () => {
  const data = createManhwaDetailStructuredData(featured);
  const series = data['@graph'].find(item => item['@type'] === 'ComicSeries');
  const breadcrumb = data['@graph'].find(item => item['@type'] === 'BreadcrumbList');
  assert.equal(series.url, 'https://animoro.in/manhwa/the-greatest-estate-developer');
  assert.equal(series.additionalProperty.value, 'Manhwa');
  assert.equal(series.countryOfOrigin.name, 'South Korea');
  assert.equal(series.alternateName, '역대급 영지 설계사');
  assert.equal(series.datePublished, '2020');
  assert.equal(Object.hasOwn(series, 'aggregateRating'), false);
  assert.equal(data['@graph'].some(item =>
    ['AggregateRating', 'Review'].includes(item['@type'])
  ), false);
  assert.equal(data['@graph'].filter(item => item['@type'] === 'BreadcrumbList').length, 1);
  assert.equal(breadcrumb.itemListElement.at(-1).name, featured.title);
});

test('omits unavailable rating counts for other dynamic Manhwa detail pages', () => {
  const manhwa = {
    ...featured,
    title: 'Return of the Blossoming Blade',
    slug: 'return-of-the-blossoming-blade--132144',
  };
  const data = createManhwaDetailStructuredData(manhwa);
  const series = data['@graph'].find(item => item['@type'] === 'ComicSeries');
  const breadcrumb = data['@graph'].find(item => item['@type'] === 'BreadcrumbList');

  assert.equal(series.url, 'https://animoro.in/manhwa/return-of-the-blossoming-blade--132144');
  assert.equal(Object.hasOwn(series, 'aggregateRating'), false);
  assert.equal(data['@graph'].filter(item => item['@type'] === 'BreadcrumbList').length, 1);
  assert.equal(breadcrumb.itemListElement.at(-1).item, series.url);
});
