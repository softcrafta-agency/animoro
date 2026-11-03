import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const pageFiles = [
  'index.html',
  'anime.html',
  'upcoming-anime.html',
  'anime-calendar.html',
  'my-list.html',
  'blogs.html',
  'blog.html',
  'category.html',
  'about.html',
];
const [pages, style, responsive, searchPage, ui] = await Promise.all([
  Promise.all(pageFiles.map(async file => [file, await readFile(new URL(file, root), 'utf8')])),
  readFile(new URL('css/style.css', root), 'utf8'),
  readFile(new URL('css/responsive.css', root), 'utf8'),
  readFile(new URL('search.html', root), 'utf8'),
  readFile(new URL('js/ui.js', root), 'utf8'),
]);

test('all site headers use one consistent icon-only search link', () => {
  for (const [file, html] of pages) {
    const buttons = [...html.matchAll(/<a\b[^>]*class="nav-search-btn"[^>]*>([\s\S]*?)<\/a>/g)];
    assert.equal(buttons.length, 1, `${file} should have exactly one header search button`);
    assert.match(buttons[0][0], /href="\/search\.html"/, `${file} should link to the search page`);
    assert.match(buttons[0][0], /aria-label="Search anime"/, `${file} should have an accessible name`);
    assert.match(buttons[0][0], /title="Search"/, `${file} should have a title`);
    assert.match(buttons[0][1], /^\s*<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"><\/circle><path d="m20 20-4-4"><\/path><\/svg>\s*$/, `${file} should use the shared inline search icon`);
  }
});

test('search button styling remains consistent and visible on mobile', () => {
  const searchButtonRule = style.match(/\.nav-search-btn\s*\{([^}]*)\}/)?.[1] || '';
  const hoverRule = style.match(/\.nav-search-btn:hover\s*\{([^}]*)\}/)?.[1] || '';
  const mobileRule = responsive.match(/\.header-actions \.nav-search-btn\s*\{([^}]*)\}/)?.[1] || '';
  assert.match(searchButtonRule, /width:\s*44px;/);
  assert.match(searchButtonRule, /height:\s*44px;/);
  assert.match(searchButtonRule, /flex:\s*0 0 44px;/);
  assert.match(searchButtonRule, /background:\s*transparent;/);
  assert.match(searchButtonRule, /border:\s*1px solid var\(--border-color\);/);
  assert.match(hoverRule, /border-color:\s*var\(--accent-crimson\);/);
  assert.match(hoverRule, /color:\s*var\(--accent-crimson\);/);
  assert.match(mobileRule, /width:\s*40px;/);
  assert.match(mobileRule, /height:\s*40px;/);
  assert.match(mobileRule, /flex:\s*0 0 40px;/);
  assert.doesNotMatch(mobileRule, /display:\s*none;/);
});

test('the Search page keeps its working form without adding a duplicate header icon', () => {
  assert.match(searchPage, /<form id="searchForm" action="\/search\.html"/);
  assert.equal((searchPage.match(/class="nav-search-btn"/g) || []).length, 0);
});

test('mobile bottom navigation keeps its other links without duplicating header search', () => {
  const mobileNav = ui.match(/nav\.innerHTML = `([\s\S]*?)`;/)?.[1] || '';
  assert.deepEqual(
    [...mobileNav.matchAll(/data-mobile-key="([^"]+)"/g)].map(match => match[1]),
    ['home', 'anime', 'my-list']
  );
  assert.match(responsive, /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\);/);
});
