import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createAnimeListStructuredData } from './anime-page-seo.js';

const root = new URL('../', import.meta.url);
const [animeHtml, animeJs, homeHtml, aboutHtml, llms] = await Promise.all([
  readFile(new URL('anime.html', root), 'utf8'),
  readFile(new URL('js/anime.js', root), 'utf8'),
  readFile(new URL('index.html', root), 'utf8'),
  readFile(new URL('about.html', root), 'utf8'),
  readFile(new URL('public/llms.txt', root), 'utf8'),
]);

test('anime collection structured data omits ItemList until visible results exist', () => {
  const data = createAnimeListStructuredData();
  const types = data['@graph'].map(item => item['@type']);

  assert.deepEqual(types, ['CollectionPage', 'BreadcrumbList']);
  assert.equal(data['@graph'][0].url, 'https://www.animoro.in/anime-list');
  assert.equal(data['@graph'][0].publisher['@id'], 'https://www.animoro.in/#organization');
});

test('anime ItemList mirrors actual directory entries and links to their detail URLs', () => {
  const data = createAnimeListStructuredData([
    { title: 'Cowboy Bebop', slug: 'cowboy-bebop', malId: 1 },
    { title: 'Editor-managed Anime', slug: 'editor-managed-anime' },
  ]);
  const collection = data['@graph'].find(item => item['@type'] === 'CollectionPage');
  const list = data['@graph'].find(item => item['@type'] === 'ItemList');

  assert.equal(collection.mainEntity['@id'], 'https://www.animoro.in/anime-list#anime-results');
  assert.equal(list.numberOfItems, 2);
  assert.deepEqual(list.itemListElement, [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Cowboy Bebop',
      url: 'https://www.animoro.in/anime/cowboy-bebop--1',
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'Editor-managed Anime',
      url: 'https://www.animoro.in/anime/editor-managed-anime',
    },
  ]);
});

test('homepage metadata and structured data declare the Animoro identity and functional search', () => {
  const jsonLd = [...homeHtml.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map(match => JSON.parse(match[1]));
  const graph = jsonLd.flatMap(item => item['@graph'] || [item]);
  const organization = graph.find(item => item['@type'] === 'Organization');
  const website = graph.find(item => item['@type'] === 'WebSite');
  const faq = graph.find(item => item['@type'] === 'FAQPage');

  assert.equal(organization['@id'], 'https://www.animoro.in/#organization');
  assert.equal(organization.name, 'Animoro');
  assert.equal(website.publisher['@id'], organization['@id']);
  assert.equal(website.potentialAction.target, 'https://www.animoro.in/search.html?q={search_term_string}');
  assert.equal(faq.mainEntity.length, 3);
  assert.equal((homeHtml.match(/<h1\b/g) || []).length, 1);
  assert.equal((homeHtml.match(/rel="canonical"/g) || []).length, 1);
  assert.match(homeHtml, /name="twitter:image"/);
  assert.match(homeHtml, /href="\/anime-list"/);
  assert.match(homeHtml, /href="\/anime-calendar\.html"/);
});

test('About page publisher information and FAQ schema match visible site coverage', () => {
  const faqScript = aboutHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  const faq = JSON.parse(faqScript);

  assert.match(aboutHtml, /<title>About Animoro/);
  assert.match(aboutHtml, /Animoro<\/strong> is the publisher name used across this website/);
  assert.equal(faq.mainEntity.length, 3);
  for (const question of faq.mainEntity) {
    assert.ok(aboutHtml.includes(question.name));
    assert.ok(aboutHtml.includes(question.acceptedAnswer.text));
  }
  assert.doesNotMatch(aboutHtml, /was founded with a singular conviction|creator interviews|real journalism/i);
});

test('Anime List has a 50–60 character title and visible FAQ matches its structured data', () => {
  const title = animeHtml.match(/<title>(.*?)<\/title>/)?.[1]?.replace(/&amp;/g, '&');
  const faqScript = animeHtml.match(/<script id="animeFaqJsonLd" type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  const faq = JSON.parse(faqScript);

  assert.ok(title.length >= 50 && title.length <= 60, `Unexpected title length: ${title.length}`);
  assert.equal(faq.mainEntity.length, 7);
  for (const question of faq.mainEntity) {
    assert.ok(animeHtml.includes(question.name));
    assert.ok(animeHtml.includes(question.acceptedAnswer.text.slice(0, 40)));
  }
  assert.match(animeHtml, /https:\/\/api\.tenrai\.org\/documentation/);
  assert.match(animeHtml, /https:\/\/myanimelist\.net\//);
  assert.equal((animeHtml.match(/<h1\b/g) || []).length, 1);
  assert.equal((animeHtml.match(/rel="canonical"/g) || []).length, 1);
});

test('Anime List applies filters explicitly, supports Enter, resets defaults, and preserves filters across pages', () => {
  const controls = animeHtml.match(/<section class="anime-directory-controls"[\s\S]*?<\/section>/)?.[0] || '';

  assert.match(controls, /id="applyAnimeFiltersBtn"[^>]*>Apply Filters<\/button>/);
  assert.match(controls, /id="resetAnimeFiltersBtn"[^>]*>Reset Filters<\/button>/);
  assert.match(animeJs, /applyButton\?\.addEventListener\('click', \(\) => runApply\(\)\)/);
  assert.match(animeJs, /search\?\.addEventListener\('keydown', event => \{[\s\S]*?event\.key === 'Enter'[\s\S]*?runApply\(\)/);
  assert.match(animeJs, /type\.value = ''/);
  assert.match(animeJs, /status\.value = ''/);
  assert.match(animeJs, /genre\.value = ''/);
  assert.match(animeJs, /sort\.value = 'popularity'/);
  assert.match(animeJs, /loadAnimeDirectory\(currentPage \+ 1, appliedFilters\)/);
  assert.doesNotMatch(animeJs, /\['animeTypeFilter', 'animeStatusFilter', 'animeGenreFilter', 'animeSortFilter'\][\s\S]{0,150}addEventListener\('change'/);
});

test('llms.txt points to implemented Animoro routes', () => {
  for (const url of [
    'https://www.animoro.in/',
    'https://www.animoro.in/anime-list',
    'https://www.animoro.in/upcoming-anime',
    'https://www.animoro.in/anime-calendar.html',
    'https://www.animoro.in/category.html?category=Anime%20News',
    'https://www.animoro.in/blogs.html',
    'https://www.animoro.in/about.html',
    'https://www.animoro.in/contact.html',
  ]) {
    assert.ok(llms.includes(url), `Missing route in llms.txt: ${url}`);
  }
});
