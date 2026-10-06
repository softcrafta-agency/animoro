import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where
} from 'firebase/firestore';
import { db, isConfigured, handleFirestoreError } from './firebase-init.js';
import { verifyAdminStatus } from './auth.js';
import { auth } from './auth-init.js';
import { uploadImageToR2 } from './r2-upload.js';
import { normalizeAnimeSlug } from './anime-url.js';

let upcomingSlugManuallyEdited = false;
let upcomingPosterPreviewUrl = '';
let selectedUpcomingPoster = null;
let currentUpcomingPosterUrl = '';

export function setupUpcomingManager() {
  const form = document.getElementById('upcomingManagerForm');
  if (!form) return;

  form.addEventListener('submit', saveUpcomingAnime);

  const posterInput = document.getElementById('upcomingPosterFile');
  const posterDropzone = document.getElementById('upcomingPosterDropzone');
  document.getElementById('chooseUpcomingPosterButton')?.addEventListener('click', () => posterInput?.click());
  posterInput?.addEventListener('change', event => {
    setPosterFile(event.currentTarget.files?.[0]);
    event.currentTarget.value = '';
  });
  posterDropzone?.addEventListener('dragover', event => {
    event.preventDefault();
    posterDropzone.classList.add('dragover');
  });
  posterDropzone?.addEventListener('dragleave', event => {
    if (!posterDropzone.contains(event.relatedTarget)) posterDropzone.classList.remove('dragover');
  });
  posterDropzone?.addEventListener('drop', event => {
    event.preventDefault();
    posterDropzone.classList.remove('dragover');
    setPosterFile(event.dataTransfer?.files?.[0]);
  });

  const titleField = document.getElementById('upcomingTitle');
  titleField?.addEventListener('input', (event) => {
    if (!upcomingSlugManuallyEdited) {
      const slugField = document.getElementById('upcomingSlug');
      if (slugField) slugField.value = normalizeAnimeSlug(event.target.value);
    }
  });

  document.getElementById('upcomingSlug')?.addEventListener('input', () => {
    upcomingSlugManuallyEdited = true;
  });

  document.getElementById('cancelUpcomingEditButton')?.addEventListener('click', resetUpcomingForm);

  const searchInput = document.getElementById('upcomingSearchInput');
  searchInput?.addEventListener('input', renderUpcomingRows);

  const statusFilter = document.getElementById('upcomingStatusFilter');
  statusFilter?.addEventListener('change', renderUpcomingRows);

  const releaseStatusFilter = document.getElementById('upcomingReleaseStatusFilter');
  releaseStatusFilter?.addEventListener('change', renderUpcomingRows);

  document.getElementById('upcomingYearFilter')?.addEventListener('change', renderUpcomingRows);
  document.getElementById('upcomingSeasonFilter')?.addEventListener('change', renderUpcomingRows);

  const sortFilter = document.getElementById('upcomingSortFilter');
  sortFilter?.addEventListener('change', renderUpcomingRows);

  loadUpcomingEntries();
}

async function loadUpcomingEntries() {
  const tbody = document.getElementById('upcomingAdminTableBody');
  if (!tbody) return;
  if (!isConfigured || !db) {
    renderUpcomingRows([], 'Firebase not configured.');
    return;
  }

  try {
    const snapshot = await getDocs(query(collection(db, 'upcomingAnime')));
    renderUpcomingRows(snapshot.docs.map(document => ({ id: document.id, ...document.data() })));
  } catch (error) {
    handleFirestoreError(error, 'list', 'upcomingAnime');
    renderUpcomingRows([], 'Unable to load upcoming anime.');
  }
}

function renderUpcomingRows(entries = [], emptyMessage = 'No upcoming anime entries yet.') {
  const tbody = document.getElementById('upcomingAdminTableBody');
  if (!tbody) return;

  const searchValue = (document.getElementById('upcomingSearchInput')?.value || '').trim().toLowerCase();
  const statusFilter = document.getElementById('upcomingStatusFilter')?.value || 'all';
  const releaseStatusFilter = document.getElementById('upcomingReleaseStatusFilter')?.value || 'all';
  const yearFilter = document.getElementById('upcomingYearFilter')?.value || 'all';
  const seasonFilter = document.getElementById('upcomingSeasonFilter')?.value || 'all';
  const sortFilter = document.getElementById('upcomingSortFilter')?.value || 'release-date';

  let filtered = [...entries];
  if (searchValue) {
    filtered = filtered.filter(item => String(item.title || '').toLowerCase().includes(searchValue));
  }
  if (statusFilter !== 'all') filtered = filtered.filter(item => (item.status || 'draft') === statusFilter);
  if (releaseStatusFilter !== 'all') filtered = filtered.filter(item => (item.releaseStatus || 'TBA') === releaseStatusFilter);
  if (yearFilter === 'other') {
    filtered = filtered.filter(item => !['2026', '2027'].includes(String(item.releaseYear || '')));
  } else if (yearFilter !== 'all') {
    filtered = filtered.filter(item => String(item.releaseYear || '') === yearFilter);
  }
  if (seasonFilter !== 'all') {
    filtered = filtered.filter(item => (item.season || 'TBA') === seasonFilter);
  }

  filtered.sort((a, b) => {
    if (sortFilter === 'az') return (a.title || '').localeCompare(b.title || '');
    if (sortFilter === 'recently-updated') return new Date(b.updatedAt?.toDate?.() || b.updatedAt || 0).getTime() - new Date(a.updatedAt?.toDate?.() || a.updatedAt || 0).getTime();
    if (sortFilter === 'recently-added') return new Date(b.createdAt?.toDate?.() || b.createdAt || 0).getTime() - new Date(a.createdAt?.toDate?.() || a.createdAt || 0).getTime();
    return getReleaseSortValue(a.releaseDate) - getReleaseSortValue(b.releaseDate);
  });

  tbody.replaceChildren();
  if (!filtered.length) {
    const row = tbody.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 10;
    cell.textContent = emptyMessage;
    return;
  }

  function getReleaseSortValue(value) {
    const timestamp = value ? new Date(value).getTime() : Number.NaN;
    return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
  }

  filtered.forEach(item => {
    const row = tbody.insertRow();
    const posterCell = row.insertCell();
    const poster = document.createElement('img');
    poster.src = item.poster || '/favicon.svg';
    poster.alt = `${item.title} poster`;
    poster.style.width = '48px';
    poster.style.height = '68px';
    poster.style.objectFit = 'cover';
    poster.style.borderRadius = '8px';
    posterCell.appendChild(poster);

    const titleCell = row.insertCell();
    const title = document.createElement('div');
    title.style.fontWeight = '700';
    title.style.color = 'var(--text-primary)';
    title.textContent = item.title || 'Untitled';
    const slug = document.createElement('div');
    slug.style.fontSize = '.75rem';
    slug.style.color = 'var(--text-muted)';
    slug.textContent = item.slug || '';
    titleCell.append(title, slug);

    const dateCell = row.insertCell();
    dateCell.textContent = item.releaseDate || 'TBA';

    const seasonCell = row.insertCell();
    seasonCell.textContent = item.season || 'TBA';

    const typeCell = row.insertCell();
    typeCell.textContent = item.type || 'TBA';

    const releaseStatusCell = row.insertCell();
    releaseStatusCell.textContent = item.releaseStatus || 'TBA';

    const publicStatusCell = row.insertCell();
    const status = document.createElement('span');
    status.className = `status-pill ${item.status === 'published' ? 'published' : 'draft'}`;
    status.textContent = item.status || 'draft';
    publicStatusCell.appendChild(status);

    const featuredCell = row.insertCell();
    featuredCell.textContent = item.featured ? 'On' : 'Off';

    const updatedCell = row.insertCell();
    updatedCell.textContent = item.updatedAt?.toDate ? item.updatedAt.toDate().toLocaleDateString() : 'Recently';

    const actionsCell = row.insertCell();
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'action-btn-sm';
    editButton.textContent = 'Edit';
    editButton.addEventListener('click', () => populateUpcomingForm(item));

    const publishButton = document.createElement('button');
    publishButton.type = 'button';
    publishButton.className = 'action-btn-sm';
    publishButton.textContent = item.status === 'published' ? 'Unpublish' : 'Publish';
    publishButton.addEventListener('click', () => toggleUpcomingPublish(item));

    const previewButton = document.createElement('button');
    previewButton.type = 'button';
    previewButton.className = 'action-btn-sm';
    previewButton.textContent = 'Preview';
    previewButton.addEventListener('click', () => window.open(
      `/upcoming-anime.html/${encodeURIComponent(item.slug || normalizeAnimeSlug(item.title))}?preview=1`,
      '_blank'
    ));

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'action-btn-sm delete';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', () => deleteUpcomingEntry(item));

    actionsCell.append(editButton, publishButton, previewButton, deleteButton);
  });
}

async function saveUpcomingAnime(event) {
  event.preventDefault();
  const feedback = document.getElementById('upcomingManagerFeedback');
  const submitButton = document.getElementById('saveUpcomingButton');
  if (!db || !isConfigured) {
    showUpcomingFeedback(feedback, 'Firebase is not configured.', 'error');
    return;
  }

  const user = auth?.currentUser;
  if (!user) {
    showUpcomingFeedback(feedback, 'You must be logged in as an admin to add Upcoming Anime.', 'error');
    return;
  }
  if (!await verifyAdminStatus(user)) {
    showUpcomingFeedback(feedback, 'Admin permission required.', 'error');
    return;
  }

  const title = document.getElementById('upcomingTitle').value.trim();
  const slug = normalizeAnimeSlug(document.getElementById('upcomingSlug').value || title);
  if (!title) {
    showUpcomingFeedback(feedback, 'Anime title is required.', 'error');
    return;
  }

  submitButton.disabled = true;
  try {
    const currentId = document.getElementById('upcomingDocumentId').value;
    const currentRecord = currentId ? await getDocs(query(collection(db, 'upcomingAnime'), where('slug', '==', slug))) : { docs: [] };
    const duplicateExists = currentRecord.docs.some(doc => doc.id !== currentId);
    if (duplicateExists) {
      showUpcomingFeedback(feedback, 'That upcoming anime slug is already in use.', 'error');
      return;
    }

    const poster = selectedUpcomingPoster
      ? await uploadImageToR2(selectedUpcomingPoster, {
        kind: 'upcoming',
        fileName: selectedUpcomingPoster.name,
        slug,
      })
      : currentUpcomingPosterUrl;

    const payload = {
      title,
      japaneseTitle: document.getElementById('upcomingJapaneseTitle').value.trim(),
      slug,
      poster,
      shortDescription: document.getElementById('upcomingShortDescription').value.trim(),
      description: document.getElementById('upcomingDescription').value.trim(),
      releaseDate: document.getElementById('upcomingReleaseDate').value || null,
      releaseYear: document.getElementById('upcomingReleaseYear').value || null,
      season: document.getElementById('upcomingSeason').value || 'TBA',
      releaseStatus: document.getElementById('upcomingReleaseStatus').value || 'TBA',
      type: document.getElementById('upcomingType').value || 'TV',
      genres: parseList(document.getElementById('upcomingGenres').value),
      studio: document.getElementById('upcomingStudio').value.trim(),
      source: document.getElementById('upcomingSource').value || 'Original',
      episodes: document.getElementById('upcomingEpisodes').value || 'TBA',
      duration: document.getElementById('upcomingDuration').value.trim(),
      ageRating: document.getElementById('upcomingAgeRating').value.trim(),
      trailerUrl: document.getElementById('upcomingTrailerUrl').value.trim(),
      officialUrl: document.getElementById('upcomingOfficialUrl').value.trim(),
      malUrl: document.getElementById('upcomingMalUrl').value.trim(),
      anilistUrl: document.getElementById('upcomingAnilistUrl').value.trim(),
      crunchyrollUrl: document.getElementById('upcomingCrunchyrollUrl').value.trim(),
      featured: document.getElementById('upcomingFeatured').checked,
      status: document.getElementById('upcomingStatus').value || 'draft',
      updatedAt: serverTimestamp(),
      ...(currentId ? {} : { createdAt: serverTimestamp() }),
    };

    if (currentId) {
      await updateDoc(doc(db, 'upcomingAnime', currentId), payload);
      showUpcomingFeedback(feedback, 'Upcoming anime updated.', 'success');
    } else {
      await addDoc(collection(db, 'upcomingAnime'), payload);
      showUpcomingFeedback(feedback, 'Upcoming anime created.', 'success');
    }

    resetUpcomingForm();
    await loadUpcomingEntries();
  } catch (error) {
    handleFirestoreError(
      error,
      document.getElementById('upcomingDocumentId').value ? 'update' : 'create',
      'upcomingAnime'
    );
    const isPermissionError = error?.code === 'permission-denied' ||
      /missing or insufficient permissions/i.test(error?.message || '');
    const message = isPermissionError
      ? "You don't have permission to save Upcoming Anime. Please make sure you are logged in with an authorized admin account."
      : `Could not save upcoming anime: ${error?.message || String(error)}`;
    showUpcomingFeedback(feedback, message, 'error');
  } finally {
    submitButton.disabled = false;
  }
}

function setPosterFile(file) {
  if (!file) return;
  const feedback = document.getElementById('upcomingManagerFeedback');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    showUpcomingFeedback(feedback, 'Choose a JPG, PNG, or WebP image.', 'error');
    return;
  }
  if (file.size > 3 * 1024 * 1024) {
    showUpcomingFeedback(feedback, 'Poster images must be 3 MB or smaller.', 'error');
    return;
  }

  const preview = document.getElementById('upcomingPosterPreview');
  const previewWrap = document.getElementById('upcomingPosterPreviewWrap');
  const fileName = document.getElementById('upcomingPosterFileName');
  if (!preview || !previewWrap || !fileName) return;
  if (upcomingPosterPreviewUrl) URL.revokeObjectURL(upcomingPosterPreviewUrl);
  selectedUpcomingPoster = file;
  upcomingPosterPreviewUrl = URL.createObjectURL(file);
  preview.src = upcomingPosterPreviewUrl;
  fileName.textContent = file.name;
  previewWrap.hidden = false;
  showUpcomingFeedback(feedback, '', '');
}

function populateUpcomingForm(item) {
  if (upcomingPosterPreviewUrl) URL.revokeObjectURL(upcomingPosterPreviewUrl);
  upcomingPosterPreviewUrl = '';
  document.getElementById('upcomingFormHeading').textContent = 'Edit Upcoming Anime';
  document.getElementById('upcomingDocumentId').value = item.id;
  const fields = [
    ['upcomingTitle', item.title],
    ['upcomingJapaneseTitle', item.japaneseTitle],
    ['upcomingSlug', item.slug],
    ['upcomingShortDescription', item.shortDescription],
    ['upcomingDescription', item.description],
    ['upcomingReleaseDate', item.releaseDate],
    ['upcomingReleaseYear', item.releaseYear],
    ['upcomingSeason', item.season],
    ['upcomingReleaseStatus', item.releaseStatus],
    ['upcomingType', item.type],
    ['upcomingGenres', Array.isArray(item.genres) ? item.genres.join(', ') : ''],
    ['upcomingStudio', item.studio],
    ['upcomingSource', item.source],
    ['upcomingEpisodes', item.episodes],
    ['upcomingDuration', item.duration],
    ['upcomingAgeRating', item.ageRating],
    ['upcomingTrailerUrl', item.trailerUrl],
    ['upcomingOfficialUrl', item.officialUrl],
    ['upcomingMalUrl', item.malUrl],
    ['upcomingAnilistUrl', item.anilistUrl],
    ['upcomingCrunchyrollUrl', item.crunchyrollUrl],
    ['upcomingStatus', item.status || 'draft'],
  ];

  fields.forEach(([id, value]) => {
    const node = document.getElementById(id);
    if (!node) return;
    if (node.type === 'checkbox') node.checked = Boolean(value);
    else if (node.tagName === 'SELECT') node.value = value || node.options[0]?.value || '';
    else node.value = value || '';
  });

  const featuredCheckbox = document.getElementById('upcomingFeatured');
  if (featuredCheckbox) featuredCheckbox.checked = Boolean(item.featured);

  const posterPreview = document.getElementById('upcomingPosterPreview');
  const posterPreviewWrap = document.getElementById('upcomingPosterPreviewWrap');
  const posterFileName = document.getElementById('upcomingPosterFileName');
  currentUpcomingPosterUrl = item.poster || '';
  selectedUpcomingPoster = null;
  if (posterPreview) posterPreview.removeAttribute('src');
  if (posterPreviewWrap) posterPreviewWrap.hidden = !item.poster;
  if (posterPreview && item.poster) {
    posterPreview.src = item.poster;
    if (posterPreviewWrap) posterPreviewWrap.hidden = false;
    if (posterFileName) posterFileName.textContent = 'Current poster';
  }
  document.getElementById('cancelUpcomingEditButton').hidden = false;
  upcomingSlugManuallyEdited = false;
  document.getElementById('upcomingFormHeading').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function toggleUpcomingPublish(item) {
  if (!db || !isConfigured) return;
  try {
    const user = auth?.currentUser;
    if (!user) throw new Error('You must be logged in as an admin to add Upcoming Anime.');
    if (!await verifyAdminStatus(user)) throw new Error('Admin permission required.');
    const nextStatus = item.status === 'published' ? 'draft' : 'published';
    await updateDoc(doc(db, 'upcomingAnime', item.id), {
      status: nextStatus,
      updatedAt: serverTimestamp()
    });
    await loadUpcomingEntries();
  } catch (error) {
    handleFirestoreError(error, 'update', `upcomingAnime/${item.id}`);
    showUpcomingFeedback(
      document.getElementById('upcomingManagerFeedback'),
      `Could not update publication status: ${error?.message || String(error)}`,
      'error'
    );
  }
}

async function deleteUpcomingEntry(item) {
  if (!db || !window.confirm(`Delete "${item.title}"?`)) return;
  try {
    await deleteDoc(doc(db, 'upcomingAnime', item.id));
    if (document.getElementById('upcomingDocumentId').value === item.id) resetUpcomingForm();
    await loadUpcomingEntries();
  } catch (error) {
    handleFirestoreError(error, 'delete', `upcomingAnime/${item.id}`);
    showUpcomingFeedback(document.getElementById('upcomingManagerFeedback'), `Could not delete: ${error.message}`, 'error');
  }
}

function resetUpcomingForm() {
  const form = document.getElementById('upcomingManagerForm');
  if (form) form.reset();
  const preview = document.getElementById('upcomingPosterPreview');
  const previewWrap = document.getElementById('upcomingPosterPreviewWrap');
  if (upcomingPosterPreviewUrl) URL.revokeObjectURL(upcomingPosterPreviewUrl);
  upcomingPosterPreviewUrl = '';
  selectedUpcomingPoster = null;
  currentUpcomingPosterUrl = '';
  if (preview) preview.removeAttribute('src');
  if (previewWrap) previewWrap.hidden = true;
  document.getElementById('upcomingDocumentId').value = '';
  document.getElementById('upcomingFormHeading').textContent = 'Add Upcoming Anime';
  document.getElementById('cancelUpcomingEditButton').hidden = true;
  upcomingSlugManuallyEdited = false;
}

function showUpcomingFeedback(element, message, type) {
  if (!element) return;
  element.className = `form-feedback ${type}`;
  element.textContent = message;
}

function parseList(value) {
  return (value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}
