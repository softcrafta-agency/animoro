import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where
} from 'firebase/firestore';
import { db, handleFirestoreError, isConfigured } from './firebase-init.js';
import { normalizeAnimeSlug } from './anime-url.js';

const ANIME_FIELDS = [
  'Title', 'Slug', 'AlternativeTitles', 'Synopsis', 'CoverImage', 'BannerImage',
  'Genres', 'Type', 'Status', 'ReleaseYear', 'Studio', 'Episodes', 'Season',
  'Source', 'Rating', 'Characters', 'Tags', 'ReleaseDay', 'ReleaseTime',
  'Timezone', 'NextEpisode', 'Visibility'
];
let slugManuallyEdited = false;

export function setupAnimeManager() {
  const form = document.getElementById('animeManagerForm');
  if (!form) return;

  form.addEventListener('submit', saveAnime);
  document.getElementById('animeTitle')?.addEventListener('input', event => {
    if (!slugManuallyEdited) {
      document.getElementById('animeSlug').value = normalizeAnimeSlug(event.target.value);
    }
  });
  document.getElementById('animeSlug')?.addEventListener('input', () => {
    slugManuallyEdited = true;
  });
  document.getElementById('cancelAnimeEditButton')?.addEventListener('click', resetAnimeForm);
  loadAnimeEntries();
}

async function loadAnimeEntries() {
  const tbody = document.getElementById('animeAdminTableBody');
  if (!tbody) return;
  if (!isConfigured || !db) {
    renderAnimeRows([], 'Firebase is not configured.');
    return;
  }

  try {
    const snapshot = await getDocs(query(collection(db, 'anime'), limit(100)));
    renderAnimeRows(snapshot.docs.map(document => ({ id: document.id, ...document.data() })));
  } catch (error) {
    handleFirestoreError(error, 'list', 'anime');
    renderAnimeRows([], 'Could not load anime entries. Verify admin permissions.');
  }
}

function renderAnimeRows(entries, emptyMessage = 'No anime entries yet. Add one using the form.') {
  const tbody = document.getElementById('animeAdminTableBody');
  if (!tbody) return;
  tbody.replaceChildren();

  if (entries.length === 0) {
    const row = tbody.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 5;
    cell.textContent = emptyMessage;
    return;
  }

  entries.forEach(anime => {
    const row = tbody.insertRow();
    const titleCell = row.insertCell();
    titleCell.textContent = anime.title || 'Untitled anime';
    const slugCell = row.insertCell();
    slugCell.textContent = anime.slug || '';
    const visibilityCell = row.insertCell();
    visibilityCell.textContent = anime.visibility || 'draft';
    const releaseCell = row.insertCell();
    releaseCell.textContent = anime.releaseDay && anime.releaseTime
      ? `${anime.releaseDay} ${anime.releaseTime}${anime.timezone ? ` (${anime.timezone})` : ''}`
      : 'Not scheduled';
    const actionsCell = row.insertCell();
    const editButton = document.createElement('button');
    editButton.className = 'action-btn-sm';
    editButton.type = 'button';
    editButton.textContent = 'Edit';
    editButton.addEventListener('click', () => populateAnimeForm(anime));
    const deleteButton = document.createElement('button');
    deleteButton.className = 'action-btn-sm delete';
    deleteButton.type = 'button';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', () => deleteAnimeEntry(anime));
    actionsCell.append(editButton, deleteButton);
  });
}

async function saveAnime(event) {
  event.preventDefault();
  const feedback = document.getElementById('animeManagerFeedback');
  const submit = document.getElementById('saveAnimeButton');
  if (!db || !isConfigured) {
    showFeedback(feedback, 'Firebase is not configured.', 'error');
    return;
  }

  const title = valueOf('animeTitle').trim();
  const slug = normalizeAnimeSlug(valueOf('animeSlug') || title);
  const releaseDay = valueOf('animeReleaseDay');
  const releaseTime = valueOf('animeReleaseTime');
  const timezone = valueOf('animeTimezone').trim();
  if (!title) {
    showFeedback(feedback, 'Enter an anime title.', 'error');
    return;
  }
  if (Boolean(releaseDay) !== Boolean(releaseTime)) {
    showFeedback(feedback, 'Enter both a release day and time, or leave both blank.', 'error');
    return;
  }
  if (timezone) {
    try {
      new Intl.DateTimeFormat('en', { timeZone: timezone });
    } catch {
      showFeedback(feedback, 'Enter a valid IANA timezone, such as Asia/Kolkata.', 'error');
      return;
    }
  }

  submit.disabled = true;
  try {
    const currentId = valueOf('animeDocumentId');
    const matches = await getDocs(query(
      collection(db, 'anime'),
      where('slug', '==', slug),
      limit(2)
    ));
    if (matches.docs.some(document => document.id !== currentId)) {
      showFeedback(feedback, 'That anime slug is already in use. Choose a unique slug.', 'error');
      return;
    }

    const existingDocument = currentId ? await getDoc(doc(db, 'anime', currentId)) : null;
    const data = {
      title,
      slug,
      alternativeTitles: parseList(valueOf('animeAlternativeTitles')),
      synopsis: valueOf('animeSynopsis').trim(),
      coverImage: normalizeImageUrl(valueOf('animeCoverImage')),
      bannerImage: normalizeImageUrl(valueOf('animeBannerImage')),
      genres: parseList(valueOf('animeGenres')),
      type: valueOf('animeType').trim(),
      status: valueOf('animeStatus'),
      releaseYear: numberOrNull('animeReleaseYear'),
      studio: valueOf('animeStudio').trim(),
      episodes: numberOrNull('animeEpisodes'),
      season: valueOf('animeSeason').trim(),
      source: valueOf('animeSource').trim(),
      rating: numberOrNull('animeRating'),
      characters: parseList(valueOf('animeCharacters')),
      tags: parseList(valueOf('animeTags')),
      releaseDay,
      releaseTime,
      timezone,
      nextEpisode: numberOrNull('animeNextEpisode'),
      visibility: valueOf('animeVisibility'),
      updatedAt: serverTimestamp(),
      ...(currentId ? {} : { createdAt: serverTimestamp() }),
    };

    if (currentId) {
      if (!existingDocument?.exists()) throw new Error('The anime entry being edited no longer exists.');
      await updateDoc(doc(db, 'anime', currentId), data);
    } else {
      await addDoc(collection(db, 'anime'), data);
    }
    showFeedback(feedback, currentId ? 'Anime entry updated.' : 'Anime entry created.', 'success');
    resetAnimeForm();
    await loadAnimeEntries();
  } catch (error) {
    handleFirestoreError(error, valueOf('animeDocumentId') ? 'update' : 'create', 'anime');
    showFeedback(feedback, `Could not save anime entry: ${error.message}`, 'error');
  } finally {
    submit.disabled = false;
  }
}

function populateAnimeForm(anime) {
  document.getElementById('animeFormHeading').textContent = 'Edit Anime';
  document.getElementById('animeDocumentId').value = anime.id;
  ANIME_FIELDS.forEach(field => {
    const element = document.getElementById(`anime${field}`);
    if (!element) return;
    const key = field[0].toLowerCase() + field.slice(1);
    const value = anime[key];
    element.value = Array.isArray(value) ? value.join(', ') : value ?? '';
  });
  document.getElementById('cancelAnimeEditButton').hidden = false;
  slugManuallyEdited = false;
  document.getElementById('animeFormHeading').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteAnimeEntry(anime) {
  if (!db || !window.confirm(`Delete "${anime.title}" from the anime database?`)) return;
  try {
    await deleteDoc(doc(db, 'anime', anime.id));
    if (valueOf('animeDocumentId') === anime.id) resetAnimeForm();
    await loadAnimeEntries();
  } catch (error) {
    handleFirestoreError(error, 'delete', `anime/${anime.id}`);
    showFeedback(document.getElementById('animeManagerFeedback'), `Could not delete anime: ${error.message}`, 'error');
  }
}

function resetAnimeForm() {
  document.getElementById('animeManagerForm')?.reset();
  document.getElementById('animeDocumentId').value = '';
  document.getElementById('animeFormHeading').textContent = 'Add Anime';
  document.getElementById('cancelAnimeEditButton').hidden = true;
  slugManuallyEdited = false;
}

function valueOf(id) {
  return document.getElementById(id)?.value || '';
}

function parseList(value) {
  return [...new Set(value.split(',').map(item => item.trim()).filter(Boolean))];
}

function numberOrNull(id) {
  const value = valueOf(id).trim();
  return value ? Number(value) : null;
}

function normalizeImageUrl(value) {
  const candidate = value.trim();
  if (!candidate) return '';
  const url = new URL(candidate);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Image URLs must use HTTP or HTTPS.');
  }
  return url.toString();
}

function showFeedback(element, message, type) {
  if (!element) return;
  element.className = `form-feedback ${type}`;
  element.textContent = message;
  element.style.display = 'block';
}
