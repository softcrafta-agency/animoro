import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { auth } from './auth-init.js';
import { db, isConfigured } from './firebase-init.js';

const MY_LIST_STORAGE_KEY = 'animoro_my_list';

export function getListStorageKey(uid = auth?.currentUser?.uid) {
  return uid ? `animoro_my_list_${uid}` : MY_LIST_STORAGE_KEY;
}

function readStoredList(key) {
  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set();
    return parsed.filter(item => {
      const keyValue = getListKey(item);
      if (seen.has(keyValue)) return false;
      seen.add(keyValue);
      return true;
    });
  } catch (error) {
    console.warn('Could not read Animoro My List from localStorage:', error);
    return [];
  }
}

export function getMyList() {
  const key = getListStorageKey();
  return readStoredList(key);
}

export function saveMyList(items) {
  window.localStorage.setItem(getListStorageKey(), JSON.stringify(items));
}

export function getPendingMyListItem() {
  try {
    const raw = window.sessionStorage.getItem('animoro_pending_my_list_item');
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('Could not restore pending My List item:', error);
    return null;
  }
}

export function queuePendingMyListItem(item) {
  if (!item) return null;
  window.sessionStorage.setItem('animoro_pending_my_list_item', JSON.stringify(item));
  return item;
}

export function clearPendingMyListItem() {
  window.sessionStorage.removeItem('animoro_pending_my_list_item');
}

async function resolveAuthenticatedUser(user) {
  if (auth) await auth.authStateReady();
  const currentUser = auth?.currentUser || null;
  if (user && currentUser && user.uid !== currentUser.uid) {
    const error = new Error('The signed-in account changed before the list operation completed.');
    error.code = 'auth/user-mismatch';
    throw error;
  }
  return currentUser || (!auth ? user || null : null);
}

export async function applyPendingMyListAction(user) {
  const pending = getPendingMyListItem();
  if (!pending) return null;
  user = await resolveAuthenticatedUser(user);
  if (!user) return null;

  const existing = await readUserList(user);
  const record = buildListRecord(pending);
  const key = getListKey(record);
  const alreadyInList = existing.some(item => getListKey(item) === key);
  const next = alreadyInList ? existing : [...existing, record];

  if (!alreadyInList) await writeUserList(user, next);
  clearPendingMyListItem();
  return next;
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

function buildListDocumentPayload(item) {
  return {
    animeId: item.slug,
    kind: item.kind,
    title: item.title,
    slug: item.slug,
    coverImage: item.coverImage || '',
    status: item.status || 'plan_to_watch',
    addedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    genres: item.genres || [],
    releaseYear: item.releaseYear || '',
    type: item.type || '',
    season: item.season || '',
    rating: item.rating ?? '',
    shortDescription: item.shortDescription || '',
    japaneseTitle: item.japaneseTitle || '',
  };
}

export function isInMyList(item) {
  const list = getMyList();
  const key = getListKey(item);
  return list.some(entry => getListKey(entry) === key);
}

export function migrateGuestListToUser(uid) {
  if (!uid) return [];
  const guestList = readStoredList(MY_LIST_STORAGE_KEY);
  if (!guestList.length) return readStoredList(getListStorageKey(uid));
  const userKey = getListStorageKey(uid);
  const userList = readStoredList(userKey);
  const merged = [...userList, ...guestList].filter((item, index, items) => {
    const key = getListKey(item);
    return items.findIndex(entry => getListKey(entry) === key) === index;
  });
  window.localStorage.setItem(userKey, JSON.stringify(merged));
  window.localStorage.removeItem(MY_LIST_STORAGE_KEY);
  return merged;
}

export async function readUserList(user) {
  user = await resolveAuthenticatedUser(user);
  if (!user || !isConfigured || !db) {
    return getMyList();
  }

  try {
    const snapshot = await getDocs(collection(db, 'users', user.uid, 'myList'));
    const list = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
    const normalized = list.map(item => ({
      ...buildListRecord({
        ...item,
        slug: item.animeId || item.slug || item.id,
        kind: item.kind || 'anime',
      }),
      status: item.status || '',
      addedAt: item.addedAt,
      updatedAt: item.updatedAt,
    }));
    saveMyList(normalized);
    return normalized;
  } catch (error) {
    console.warn('Could not read the authenticated My List from Firestore:', error);
    throw error;
  }
}

export async function writeUserList(user, items) {
  user = await resolveAuthenticatedUser(user);
  items = items || getMyList();
  if (!user || !isConfigured || !db) {
    saveMyList(items);
    return items;
  }

  const normalized = items
    .map(item => buildListRecord(item))
    .filter((item, index, list) => list.findIndex(candidate => getListKey(candidate) === getListKey(item)) === index);

  const current = await readUserList(user);
  const currentKeys = new Set(current.map(item => getListKey(item)));

  for (const item of normalized) {
    const documentId = getListKey(item);
    const payload = buildListDocumentPayload(item);
    if (!currentKeys.has(documentId)) {
      await setDoc(doc(db, 'users', user.uid, 'myList', documentId), payload);
    } else {
      await setDoc(doc(db, 'users', user.uid, 'myList', documentId), payload, { merge: true });
    }
  }

  const allIds = new Set(normalized.map(item => getListKey(item)));
  const existingDocs = await getDocs(collection(db, 'users', user.uid, 'myList'));
  for (const document of existingDocs.docs) {
    if (!allIds.has(document.id)) {
      await deleteDoc(doc(db, 'users', user.uid, 'myList', document.id));
    }
  }

  saveMyList(normalized);
  return normalized;
}

export async function toggleMyList(item) {
  const user = await resolveAuthenticatedUser();
  if (!user) {
    const error = new Error('Sign in before saving anime to your list.');
    error.code = 'auth/no-current-user';
    throw error;
  }

  if (!isConfigured || !db) {
    const error = new Error('Firebase is unavailable. Please try again later.');
    error.code = 'firebase/not-configured';
    throw error;
  }

  const record = buildListRecord(item);
  const documentId = getListKey(record);
  const itemRef = doc(db, 'users', user.uid, 'myList', documentId);
  const snapshot = await getDoc(itemRef);
  const list = getMyList();
  const exists = snapshot.exists();

  if (exists) {
    await deleteDoc(itemRef);
  } else {
    await setDoc(itemRef, buildListDocumentPayload(record));
  }

  const key = getListKey(record);
  const nextList = exists
    ? list.filter(entry => getListKey(entry) !== key)
    : [...list.filter(entry => getListKey(entry) !== key), record];
  saveMyList(nextList);
  return { exists: !exists, list: nextList };
}

function getMyListActionErrorMessage(error) {
  if (error?.code === 'auth/no-current-user') {
    return 'Please sign in to save anime to your list.';
  }
  if (error?.code === 'permission-denied') {
    return 'Your account could not access this list. Please verify your sign-in and try again.';
  }
  if (['unavailable', 'deadline-exceeded', 'network-request-failed', 'auth/network-request-failed'].includes(error?.code)) {
    return 'Network error. Check your connection and try again.';
  }
  if (error?.code === 'firebase/not-configured') {
    return 'Saving is unavailable right now. Please try again later.';
  }
  return 'Unable to update your list. Please try again.';
}

export function redirectToLoginForPendingAction(item) {
  queuePendingMyListItem(item);
  const redirect = encodeURIComponent(`${window.location.pathname}${window.location.search}` || '/');
  window.location.href = `/login.html?redirect=${redirect}`;
}

export function attachMyListToggle(button, item) {
  if (!button) return;
  button.type = 'button';
  let status = null;

  const syncButton = () => {
    const inList = isInMyList(item);
    button.classList.toggle('is-active', inList);
    button.textContent = inList ? '✓ In My List' : '＋ Add to My List';
    button.setAttribute('aria-pressed', String(inList));
    button.dataset.myListState = String(inList);
  };

  const setStatus = message => {
    if (!status) {
      status = document.createElement('span');
      status.className = 'my-list-action-status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      status.style.cssText = 'display:block;color:var(--text-muted);font-size:0.85rem;margin-top:6px;';
      button.insertAdjacentElement('afterend', status);
    }
    status.textContent = message;
  };

  syncButton();
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    const wasInList = button.dataset.myListState === 'true';
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = wasInList ? 'Removing…' : 'Saving…';
    if (status) status.textContent = '';

    try {
      const result = await toggleMyList(item);
      syncButton();
      document.dispatchEvent(new CustomEvent('animoro-my-list-change', {
        detail: { item, inList: result.exists, list: result.list }
      }));
    } catch (error) {
      console.error('Could not update the authenticated My List:', error);
      syncButton();
      setStatus(getMyListActionErrorMessage(error));
      if (error?.code === 'auth/no-current-user') {
        redirectToLoginForPendingAction(item);
      }
    } finally {
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  });
}
