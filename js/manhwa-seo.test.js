import assert from 'node:assert/strict';
import test from 'node:test';
import { createManhwaDetailStructuredData, createManhwaStructuredData } from './manhwa-seo.js';

const featured = {
  id: 140407,
  title: 'The Greatest Estate Developer',
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
});

test('creates title-specific structured data and canonical breadcrumb', () => {
  const data = createManhwaDetailStructuredData(featured);
  const series = data['@graph'].find(item => item['@type'] === 'ComicSeries');
  const breadcrumb = data['@graph'].find(item => item['@type'] === 'BreadcrumbList');
  assert.equal(series.url, 'https://www.animoro.in/manhwa/the-greatest-estate-developer');
  assert.equal(breadcrumb.itemListElement.at(-1).name, featured.title);
});
