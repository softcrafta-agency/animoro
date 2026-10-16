import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth } from './auth-init.js';
import { verifyAdminStatus } from './auth.js';
import { db, handleFirestoreError, isConfigured } from './firebase-init.js';
import {
  chunkAnimeListIds,
  planAnimeListMembership,
  validateAnimeListName,
} from './anime-list-core.js';

const MEMBER_PAGE_SIZE = 50;
const MEMBER_LOOKUP_SIZE = 30;
const MEMBER_WRITE_SIZE = 400;
let selectedAnimeProvider = null;
let listManagerBound = false;
let listOperationRunning = false;
let activeListId = '';
let memberPageCursors = [];
let memberPage = 0;
let memberPageHasMore = false;

export function setupAnimeListManager({ getSelectedAnime }) {
  selectedAnimeProvider = getSelectedAnime;
  if (listManagerBound) return;
  listManagerBound = true;

  const modal = document.getElementById('animeListsModal');
  const select = document.getElementById('animeListSelect');
  if (!modal || !select) return;
  document.getElementById('animeAddToListButton')?.addEventListener('click', openAnimeLists);
  document.getElementById('animeManageListsButton')?.addEventListener('click', openAnimeLists);
  document.getElementById('closeAnimeListsButton')?.addEventListener('click', closeAnimeLists);
  document.getElementById('createAnimeListButton')?.addEventListener('click', createAnimeList);
  document.getElementById('addAnimeToListConfirmButton')?.addEventListener('click', addSelectedAnime);
  document.getElementById('viewAnimeListButton')?.addEventListener('click', () => {
    activeListId = select.value;
    memberPage = 0;
    memberPageCursors = [];
    loadAnimeListMembers();
  });
  select.addEventListener('change', () => {
    activeListId = select.value;
    const addButton = document.getElementById('addAnimeToListConfirmButton');
    const viewButton = document.getElementById('viewAnimeListButton');
    if (addButton) addButton.disabled = !activeListId || listOperationRunning || !(selectedAnimeProvider?.() || []).length;
    if (viewButton) viewButton.disabled = !activeListId || listOperationRunning;
  });
  modal.addEventListener('click', event => {
    if (event.target === modal) closeAnimeLists();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !modal.hidden) closeAnimeLists();
  });
}

async function openAnimeLists() {
  const anime = selectedAnimeProvider?.() || [];
  const modal = document.getElementById('animeListsModal');
  const hint = document.getElementById('animeListSelectedHint');
  if (hint) {
    hint.textContent = anime.length
      ? `${anime.length} anime selected. Choose an existing list or create a new one.`
      : 'Create or view a list. Select anime in the database to add entries.';
  }
  if (modal) {
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add('show'));
  }
  await loadAnimeLists();
}

function closeAnimeLists() {
  if (listOperationRunning) return;
  const modal = document.getElementById('animeListsModal');
  if (!modal) return;
  modal.classList.remove('show');
  window.setTimeout(() => {
    if (!modal.classList.contains('show')) modal.hidden = true;
  }, 250);
}

async function loadAnimeLists() {
  const select = document.getElementById('animeListSelect');
  const message = document.getElementById('animeListMessage');
  if (!select) return;
  try {
    await requireAnimeListAdmin();
    const snapshot = await getDocs(query(collection(db, 'animeLists'), orderBy('name')));
    select.replaceChildren(new Option('Select a list', ''));
    snapshot.docs.forEach(listDocument => {
      const option = new Option(listDocument.data().name, listDocument.id);
      select.appendChild(option);
    });
    const existingSelection = snapshot.docs.some(listDocument => listDocument.id === activeListId);
    select.value = existingSelection ? activeListId : '';
    activeListId = select.value;
    select.dispatchEvent(new Event('change'));
    if (!snapshot.size) showListMessage(message, 'No lists yet. Create a named list to get started.', 'info');
  } catch (error) {
    handleFirestoreError(error, 'list', 'animeLists');
    showListMessage(message, `Could not load anime lists: ${error?.message || String(error)}`, 'error');
  }
}

async function createAnimeList() {
  if (listOperationRunning) return;
  const input = document.getElementById('newAnimeListName');
  const message = document.getElementById('animeListMessage');
  const parsed = validateAnimeListName(input?.value || '');
  if (parsed.error) {
    showListMessage(message, parsed.error, 'error');
    return;
  }
  listOperationRunning = true;
  updateListControls(true);
  try {
    if (!await requireAnimeListAdmin()) return;
    const listRef = doc(db, 'animeLists', parsed.slug);
    await runTransaction(db, async transaction => {
      const current = await transaction.get(listRef);
      if (current.exists()) throw new Error('A list with that name already exists.');
      transaction.set(listRef, {
        name: parsed.name,
        slug: parsed.slug,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    activeListId = parsed.slug;
    memberPage = 0;
    memberPageCursors = [];
    memberPageHasMore = false;
    if (input) input.value = '';
    showListMessage(message, `Created "${parsed.name}".`, 'success');
    await loadAnimeLists();
    const select = document.getElementById('animeListSelect');
    if (select) {
      select.value = activeListId;
      select.dispatchEvent(new Event('change'));
    }
    await loadAnimeListMembers();
  } catch (error) {
    handleFirestoreError(error, 'create', `animeLists/${parsed.slug}`);
    showListMessage(message, `Could not create list: ${error?.message || String(error)}`, 'error');
  } finally {
    listOperationRunning = false;
    updateListControls(false);
  }
}

async function addSelectedAnime() {
  if (listOperationRunning) return;
  const selectedAnime = selectedAnimeProvider?.() || [];
  const listId = document.getElementById('animeListSelect')?.value || '';
  const message = document.getElementById('animeListMessage');
  if (!listId) {
    showListMessage(message, 'Select an existing list first.', 'error');
    return;
  }
  if (!selectedAnime.length) {
    showListMessage(message, 'Select at least one anime from the Anime database.', 'error');
    return;
  }
  listOperationRunning = true;
  updateListControls(true);
  try {
    if (!await requireAnimeListAdmin()) return;
    const memberCollection = collection(db, 'animeLists', listId, 'members');
    const existingIds = await findExistingMemberships(listId, selectedAnime.map(anime => anime.id));
    const plan = planAnimeListMembership(selectedAnime.map(anime => anime.id), existingIds);
    const failedIds = new Set();
    let added = 0;
    for (const chunk of chunkAnimeListIds(plan.toAdd, MEMBER_WRITE_SIZE)) {
      const batch = writeBatch(db);
      chunk.forEach(animeId => {
        const anime = selectedAnime.find(item => item.id === animeId);
        if (!anime) return;
        batch.set(doc(memberCollection, animeId), {
          animeId,
          slug: anime.slug || '',
          createdAt: serverTimestamp(),
        });
      });
      batch.update(doc(db, 'animeLists', listId), { updatedAt: serverTimestamp() });
      try {
        await batch.commit();
        added += chunk.length;
      } catch (error) {
        handleFirestoreError(error, 'bulk-add-members', `animeLists/${listId}/members`);
        chunk.forEach(animeId => failedIds.add(animeId));
      }
    }
    const listName = document.getElementById('animeListSelect')?.selectedOptions[0]?.textContent || 'list';
    showListMessage(
      message,
      failedIds.size
        ? `Added ${added}; already present ${plan.alreadyPresent}; failed ${failedIds.size}.`
        : `Added ${added} anime to "${listName}"; already present ${plan.alreadyPresent}.`,
      failedIds.size ? 'error' : 'success'
    );
    await loadAnimeListMembers();
  } catch (error) {
    handleFirestoreError(error, 'bulk-add-members', `animeLists/${listId}/members`);
    showListMessage(message, `Could not add anime to the list: ${error?.message || String(error)}`, 'error');
  } finally {
    listOperationRunning = false;
    updateListControls(false);
  }
}

async function findExistingMemberships(listId, animeIds) {
  const existingIds = new Set();
  for (const chunk of chunkAnimeListIds(animeIds, MEMBER_LOOKUP_SIZE)) {
    const snapshot = await getDocs(query(
      collection(db, 'animeLists', listId, 'members'),
      where(documentId(), 'in', chunk),
    ));
    snapshot.docs.forEach(member => existingIds.add(member.id));
  }
  return existingIds;
}

async function loadAnimeListMembers() {
  const contents = document.getElementById('animeListContents');
  const title = document.getElementById('animeListContentsTitle');
  const membersList = document.getElementById('animeListMembers');
  const message = document.getElementById('animeListMessage');
  if (!activeListId || !membersList) return;
  try {
    if (!await requireAnimeListAdmin()) return;
    const listSnapshot = await getDoc(doc(db, 'animeLists', activeListId));
    if (!listSnapshot.exists()) {
      showListMessage(message, 'That list no longer exists. Refresh the list selector.', 'error');
      return;
    }
    if (title) title.textContent = `${listSnapshot.data().name} — Anime`;
    const collectionRef = collection(db, 'animeLists', activeListId, 'members');
    let memberQuery = query(collectionRef, orderBy('animeId'), limit(MEMBER_PAGE_SIZE));
    if (memberPage > 0 && memberPageCursors[memberPage - 1]) {
      memberQuery = query(collectionRef, orderBy('animeId'), startAfter(memberPageCursors[memberPage - 1]), limit(MEMBER_PAGE_SIZE));
    }
    const snapshot = await getDocs(memberQuery);
    if (memberPage > 0 && snapshot.empty) {
      memberPage = Math.max(0, memberPage - 1);
      await loadAnimeListMembers();
      return;
    }
    memberPageCursors[memberPage] = snapshot.docs.at(-1) || null;
    memberPageHasMore = snapshot.size === MEMBER_PAGE_SIZE;
    const animeIds = snapshot.docs.map(member => member.id);
    const animeRecords = await loadAnimeByIds(animeIds);
    renderAnimeListMembers(animeRecords, animeIds, contents, membersList);
    renderAnimeListPagination(memberPageHasMore);
  } catch (error) {
    handleFirestoreError(error, 'list', `animeLists/${activeListId}/members`);
    showListMessage(message, `Could not load anime in this list: ${error?.message || String(error)}`, 'error');
  }
}

async function loadAnimeByIds(animeIds) {
  const records = [];
  for (const chunk of chunkAnimeListIds(animeIds, MEMBER_LOOKUP_SIZE)) {
    if (!chunk.length) continue;
    const snapshot = await getDocs(query(collection(db, 'anime'), where(documentId(), 'in', chunk)));
    snapshot.docs.forEach(anime => records.push({ id: anime.id, ...anime.data() }));
  }
  return records;
}

function renderAnimeListMembers(records, memberIds, contents, membersList) {
  if (contents) contents.hidden = false;
  membersList.replaceChildren();
  if (!memberIds.length) {
    const empty = document.createElement('li');
    empty.textContent = 'This list is empty. Select anime and add it above.';
    membersList.appendChild(empty);
    return;
  }
  const recordById = new Map(records.map(record => [record.id, record]));
  memberIds.forEach(animeId => {
    const record = recordById.get(animeId);
    const item = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = record ? `${record.title || 'Untitled anime'}${record.slug ? ` (${record.slug})` : ''}` : `Missing anime record (${animeId})`;
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'action-btn-sm delete';
    removeButton.textContent = 'Remove';
    removeButton.disabled = listOperationRunning;
    removeButton.addEventListener('click', () => removeAnimeFromList(animeId));
    item.append(label, removeButton);
    membersList.appendChild(item);
  });
}

async function removeAnimeFromList(animeId) {
  if (listOperationRunning || !activeListId) return;
  const message = document.getElementById('animeListMessage');
  listOperationRunning = true;
  updateListControls(true);
  try {
    if (!await requireAnimeListAdmin()) return;
    const batch = writeBatch(db);
    batch.delete(doc(db, 'animeLists', activeListId, 'members', animeId));
    batch.update(doc(db, 'animeLists', activeListId), { updatedAt: serverTimestamp() });
    await batch.commit();
    showListMessage(message, 'Anime removed from this list. The main anime record was not changed.', 'success');
    if (memberPage > 0) memberPageCursors.splice(memberPage);
    await loadAnimeListMembers();
  } catch (error) {
    handleFirestoreError(error, 'remove-list-member', `animeLists/${activeListId}/members/${animeId}`);
    showListMessage(message, `Could not remove anime from list: ${error?.message || String(error)}`, 'error');
  } finally {
    listOperationRunning = false;
    updateListControls(false);
  }
}

function renderAnimeListPagination(hasMore) {
  let pagination = document.getElementById('animeListMembersPagination');
  const contents = document.getElementById('animeListContents');
  if (!pagination && contents) {
    pagination = document.createElement('div');
    pagination.id = 'animeListMembersPagination';
    pagination.className = 'admin-table-pagination';
    contents.appendChild(pagination);
  }
  if (!pagination) return;
  pagination.replaceChildren();
  const status = document.createElement('span');
  status.textContent = `Page ${memberPage + 1}`;
  const actions = document.createElement('div');
  const previous = document.createElement('button');
  previous.type = 'button';
  previous.className = 'action-btn-sm';
  previous.textContent = 'Previous';
  previous.disabled = memberPage === 0 || listOperationRunning;
  previous.addEventListener('click', () => {
    if (memberPage === 0) return;
    memberPage -= 1;
    loadAnimeListMembers();
  });
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'action-btn-sm';
  next.textContent = 'Next';
  next.disabled = !hasMore || listOperationRunning;
  next.addEventListener('click', () => {
    if (!hasMore) return;
    memberPage += 1;
    loadAnimeListMembers();
  });
  actions.append(previous, next);
  pagination.append(status, actions);
}

async function requireAnimeListAdmin() {
  const user = auth?.currentUser;
  if (!db || !isConfigured || !user || !await verifyAdminStatus(user)) {
    throw new Error('Admin permission and an active Firebase connection are required.');
  }
  return true;
}

function updateListControls(disabled) {
  ['closeAnimeListsButton', 'createAnimeListButton', 'newAnimeListName', 'animeListSelect'].forEach(id => {
    const control = document.getElementById(id);
    if (control) control.disabled = disabled;
  });
  const hasSelectedList = Boolean(document.getElementById('animeListSelect')?.value);
  ['addAnimeToListConfirmButton', 'viewAnimeListButton'].forEach(id => {
    const control = document.getElementById(id);
    if (control) control.disabled = disabled || !hasSelectedList;
  });
  const addButton = document.getElementById('addAnimeToListConfirmButton');
  if (addButton && !disabled) addButton.disabled = !hasSelectedList || !(selectedAnimeProvider?.() || []).length;
  const removeButtons = document.querySelectorAll('#animeListMembers button');
  removeButtons.forEach(button => { button.disabled = disabled; });
  if (!disabled && document.getElementById('animeListMembersPagination')) {
    renderAnimeListPagination(memberPageHasMore);
  }
}

function showListMessage(element, text, type) {
  if (!element) return;
  element.className = `form-feedback ${type}`;
  element.textContent = text;
  element.hidden = false;
}
