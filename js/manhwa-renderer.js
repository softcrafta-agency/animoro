import {
  FEATURED_MANHWA_ID,
  getManhwaSlug,
  getManhwaPath,
  OFFICIAL_FEATURED_URL,
} from './manhwa-service.js';
import { attachMyListToggle } from './my-list.js';

function element(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function safeImageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function addCover(parent, manhwa, className, loading = 'lazy') {
  const imageUrl = safeImageUrl(manhwa.coverImage);
  if (!imageUrl) {
    parent.appendChild(element('div', 'manhwa-cover-placeholder', 'Cover image unavailable'));
    return null;
  }
  const image = element('img', className);
  image.src = imageUrl;
  image.alt = `Cover art for ${manhwa.title}`;
  image.width = 600;
  image.height = 900;
  image.loading = loading;
  image.decoding = 'async';
  image.addEventListener('error', () => {
    image.replaceWith(element('div', 'manhwa-cover-placeholder', 'Cover image unavailable'));
  }, { once: true });
  parent.appendChild(image);
  return image;
}

function createTagList(labels, className = 'manhwa-tag-list') {
  const list = element('ul', className);
  labels.forEach(label => {
    const item = element('li', 'manhwa-tag', label);
    list.appendChild(item);
  });
  return list;
}

function addExternalPlatformButton(parent) {
  const link = element('a', 'btn-cta', 'View on WEBTOON');
  link.href = OFFICIAL_FEATURED_URL;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.setAttribute('aria-label', 'View The Greatest Estate Developer on the official WEBTOON platform');
  parent.appendChild(link);
}

export function createManhwaCard(manhwa) {
  const card = element('article', 'manhwa-card');
  const link = element('a', 'manhwa-card-cover-link');
  link.href = getManhwaPath(manhwa);
  link.setAttribute('aria-label', `View details for ${manhwa.title}`);
  addCover(link, manhwa, 'manhwa-card-cover');
  card.appendChild(link);

  const body = element('div', 'manhwa-card-body');
  const title = element('h3', 'manhwa-card-title');
  const titleLink = element('a', '', manhwa.title);
  titleLink.href = getManhwaPath(manhwa);
  title.appendChild(titleLink);
  body.appendChild(title);
  const metadata = [
    manhwa.contentType,
    manhwa.countryName ? `Origin: ${manhwa.countryName}` : 'Unknown origin',
    manhwa.originalLanguageName ? `Original language: ${manhwa.originalLanguageName}` : '',
  ].filter(Boolean);
  body.appendChild(element('p', 'manhwa-card-metadata', metadata.join(' · ')));
  if (manhwa.synopsis) body.appendChild(element('p', 'manhwa-card-synopsis', manhwa.synopsis));
  if (manhwa.genres.length) body.appendChild(createTagList(manhwa.genres.slice(0, 3)));
  if (manhwa.status) body.appendChild(element('p', 'manhwa-card-status', manhwa.status));
  const details = element('a', 'btn-outline manhwa-card-link', 'View Details');
  details.href = getManhwaPath(manhwa);
  body.appendChild(details);
  card.appendChild(body);
  return card;
}

export function renderManhwaCards(container, entries, emptyMessage = 'No comic recommendations are available here yet.') {
  container.replaceChildren();
  if (!entries.length) {
    const message = element('p', 'manhwa-empty-inline', emptyMessage);
    container.appendChild(message);
    return;
  }
  container.append(...entries.map(createManhwaCard));
}

export function renderFeaturedManhwa(container, manhwa, { linkToDetails = true, eager = false } = {}) {
  container.replaceChildren();
  const card = element('article', 'manhwa-featured-card');
  const cover = element('div', 'manhwa-featured-cover');
  addCover(cover, manhwa, '', eager ? 'eager' : 'lazy');
  card.appendChild(cover);

  const content = element('div', 'manhwa-featured-content');
  content.appendChild(element('p', 'manhwa-featured-label', `Featured ${manhwa.contentType || 'comic'} recommendation`));
  const heading = element('h3', 'manhwa-featured-title', manhwa.title);
  content.appendChild(heading);
  if (manhwa.synopsis) content.appendChild(element('p', 'manhwa-featured-synopsis', manhwa.synopsis));
  if (manhwa.genres.length) {
    const genres = element('div', 'manhwa-fact-block');
    genres.appendChild(element('h3', '', 'Genres'));
    genres.appendChild(createTagList(manhwa.genres));
    content.appendChild(genres);
  }

  const credits = element('dl', 'manhwa-featured-facts');
  const facts = [
    ['Content type', manhwa.contentType],
    ['Country of origin', manhwa.countryName],
    ['Original language', manhwa.originalLanguageName],
    ['Author', manhwa.authors.join(', ')],
    ['Artist', manhwa.artists.join(', ')],
    ['Publication status', manhwa.status],
  ].filter(([, value]) => value);
  facts.forEach(([label, value]) => {
    credits.append(element('dt', '', label), element('dd', '', value));
  });
  if (facts.length) content.appendChild(credits);

  const actions = element('div', 'manhwa-actions');
  if (linkToDetails) {
    const details = element('a', 'btn-outline', 'View Details');
    details.href = getManhwaPath(manhwa);
    actions.appendChild(details);
  }
  if (Number(manhwa.id) === FEATURED_MANHWA_ID) addExternalPlatformButton(actions);
  content.appendChild(actions);
  card.appendChild(content);
  container.appendChild(card);
}

export function renderManhwaDetails(container, manhwa) {
  container.replaceChildren();
  const layout = element('article', 'manhwa-detail-layout');
  const cover = element('div', 'manhwa-detail-cover-wrap');
  addCover(cover, manhwa, 'manhwa-detail-cover', 'eager');
  layout.appendChild(cover);

  const content = element('div', 'manhwa-detail-content');
  const classification = manhwa.countryName
    ? `${manhwa.contentType} · Country of origin: ${manhwa.countryName}`
    : `${manhwa.contentType} · Unknown origin`;
  content.appendChild(element('p', 'manhwa-featured-label', classification));
  const title = element('h1', 'manhwa-detail-title', manhwa.title);
  title.id = 'manhwaDetailTitle';
  content.appendChild(title);
  if (!manhwa.synopsis) {
    const synopsis = element('section', 'manhwa-detail-copy');
    synopsis.append(element('h2', '', 'Synopsis'), element('p', '', 'Synopsis is not available from the metadata provider.'));
    content.appendChild(synopsis);
  }
  if (manhwa.synopsis) {
    const synopsis = element('section', 'manhwa-detail-copy');
    synopsis.append(element('h2', '', 'Synopsis'), element('p', '', manhwa.synopsis));
    content.appendChild(synopsis);
  }
  if (manhwa.genres.length) {
    const genres = element('section', 'manhwa-detail-copy');
    genres.appendChild(element('h2', '', 'Genres'));
    genres.appendChild(createTagList(manhwa.genres));
    content.appendChild(genres);
  } else {
    const genres = element('section', 'manhwa-detail-copy');
    genres.append(element('h2', '', 'Genres'), element('p', '', 'Genre information is not available.'));
    content.appendChild(genres);
  }

  const credits = element('dl', 'manhwa-detail-facts');
  const facts = [
    ['English title', manhwa.title],
    ['Original title', manhwa.originalTitle || 'Not available'],
    ['Content type', manhwa.contentType],
    ['Country of origin', manhwa.countryName || 'Unknown'],
    ['Original language', manhwa.originalLanguageName],
    ['Author', manhwa.authors.join(', ') || 'Not available'],
    ['Artist', manhwa.artists.join(', ') || 'Not available'],
    ['Release year', manhwa.releaseYear || 'Not available'],
    ['Publication status', manhwa.status || 'Not available'],
    ['AniList rating', manhwa.rating ? `${(manhwa.rating / 10).toFixed(1)} / 10` : ''],
  ].filter(([, value]) => value);
  facts.forEach(([label, value]) => {
    credits.append(element('dt', '', label), element('dd', '', value));
  });
  if (facts.length) content.appendChild(credits);

  const tags = element('section', 'manhwa-detail-copy');
  if (manhwa.tags.length) {
    tags.appendChild(element('h2', '', 'Tags'));
    tags.appendChild(createTagList(manhwa.tags));
  } else {
    tags.append(element('h2', '', 'Tags'), element('p', '', 'Tag information is not available.'));
  }
  content.appendChild(tags);

  const actions = element('div', 'manhwa-actions');
  const save = element('button', 'btn-outline', 'Add to My List');
  save.setAttribute('aria-label', `Add ${manhwa.title} to My List`);
  attachMyListToggle(save, {
    ...manhwa,
    slug: getManhwaSlug(manhwa),
    kind: 'comic',
    releaseYear: manhwa.releaseYear,
  });
  actions.appendChild(save);
  if (Number(manhwa.id) === FEATURED_MANHWA_ID) addExternalPlatformButton(actions);
  const back = element('a', 'btn-outline', 'Back to Comics & Webcomics');
  back.href = '/manhwa';
  actions.appendChild(back);
  content.appendChild(actions);
  layout.appendChild(content);
  container.appendChild(layout);
}

export function renderLoading(container, label) {
  container.replaceChildren();
  const state = element('div', 'home-loading-state');
  state.setAttribute('role', 'status');
  state.setAttribute('aria-label', label);
  state.append(element('span', 'home-loading-line'), element('span', 'home-loading-line'));
  container.appendChild(state);
}

export function renderMessage(container, message, retry = null) {
  container.replaceChildren();
  const state = element('div', 'empty-state manhwa-empty-state');
  state.appendChild(element('p', 'empty-state-desc', message));
  if (retry) {
    const button = element('button', 'btn-outline', 'Retry');
    button.type = 'button';
    button.addEventListener('click', retry);
    state.appendChild(button);
  }
  container.appendChild(state);
}
