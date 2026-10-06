const MY_LIST_STORAGE_KEY = 'animoro_my_list';

export function getMyList() {
  try {
    const stored = window.localStorage.getItem(MY_LIST_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set();
    return parsed.filter(item => {
      const key = getListKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch (error) {
    console.warn('Could not read Animoro My List from localStorage:', error);
    return [];
  }
}

export function saveMyList(items) {
  window.localStorage.setItem(MY_LIST_STORAGE_KEY, JSON.stringify(items));
}

export function getListKey(item) {
  const slug = item?.slug || item?.id || item?.title || 'item';
  const kind = item?.kind || 'anime';
  return `${kind}:${slug}`;
}

export function buildListRecord(item) {
  const kind = item?.kind || 'anime';
  return {
    kind,
    slug: item?.slug || item?.id || item?.title || 'item',
    title: item?.title || 'Untitled',
    coverImage: item?.coverImage || item?.poster || '',
    genres: Array.isArray(item?.genres) ? item.genres : [],
    releaseYear: item?.releaseYear || item?.year || '',
    rating: item?.rating ?? '',
    type: item?.type || item?.releaseType || '',
    season: item?.season || '',
    status: item?.status || '',
    releaseStatus: item?.releaseStatus || '',
    featured: Boolean(item?.featured),
    shortDescription: item?.shortDescription || item?.synopsis || '',
    japaneseTitle: item?.japaneseTitle || '',
  };
}

export function isInMyList(item) {
  const list = getMyList();
  const key = getListKey(item);
  return list.some(entry => getListKey(entry) === key);
}

export function toggleMyList(item) {
  const list = getMyList();
  const record = buildListRecord(item);
  const key = getListKey(record);
  const exists = list.some(entry => getListKey(entry) === key);

  const nextList = exists
    ? list.filter(entry => getListKey(entry) !== key)
    : [...list, record];

  saveMyList(nextList);
  return { exists: !exists, list: nextList };
}

export function attachMyListToggle(button, item) {
  if (!button) return;
  button.type = 'button';
  const syncButton = () => {
    const inList = isInMyList(item);
    button.classList.toggle('is-active', inList);
    button.textContent = inList ? '✓ In My List' : '＋ Add to My List';
    button.setAttribute('aria-pressed', String(inList));
    button.dataset.myListState = String(inList);
  };

  syncButton();
  button.addEventListener('click', () => {
    const result = toggleMyList(item);
    syncButton();
    document.dispatchEvent(new CustomEvent('animoro-my-list-change', {
      detail: { item, inList: result.exists, list: result.list }
    }));
  });
}
