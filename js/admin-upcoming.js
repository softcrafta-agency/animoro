import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  writeBatch,
  updateDoc,
  where
} from 'firebase/firestore';
import { db, isConfigured, handleFirestoreError } from './firebase-init.js';
import { verifyAdminStatus } from './auth.js';
import { auth } from './auth-init.js';
import { normalizeAnimeSlug } from './anime-url.js';
import { ImageUploadField } from './image-upload-field.js';

let upcomingSlugManuallyEdited = false;
let upcomingPosterField = null;
const IMPORT_BATCH_SIZE = 400;
const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
const IMPORT_MAX_RECORDS = 1000;
const IMPORT_FIELDS = {
  title: ['animeTitle', 'title'],
  japaneseTitle: ['japaneseTitle'],
  slug: ['animeSlug', 'slug'],
  poster: ['posterImageUrl', 'poster'],
  shortDescription: ['shortDescription'],
  description: ['fullDescription', 'description'],
  releaseDate: ['releaseDate'],
  releaseYear: ['releaseYear'],
  season: ['season'],
  releaseStatus: ['releaseStatus'],
  type: ['type'],
  genres: ['genres'],
  studio: ['studio'],
  source: ['source'],
  episodes: ['episodes'],
  duration: ['duration'],
  ageRating: ['ageRating'],
  trailerUrl: ['trailerUrl'],
  officialUrl: ['officialWebsite', 'officialUrl'],
  malUrl: ['myAnimeListUrl', 'malUrl'],
  anilistUrl: ['aniListUrl', 'anilistUrl'],
  crunchyrollUrl: ['crunchyrollUrl'],
  featured: ['featuredUpcomingAnime', 'featured'],
  status: ['status'],
};
const IMPORT_IDENTIFIER_FIELDS = ['id', 'documentId', 'docId'];
const IMPORT_ALLOWED_FIELDS = new Set([
  ...Object.values(IMPORT_FIELDS).flat(),
  ...IMPORT_IDENTIFIER_FIELDS,
]);
const UPCOMING_SEASONS = ['TBA', 'Winter', 'Spring', 'Summer', 'Fall'];
const UPCOMING_RELEASE_STATUSES = ['TBA', 'Announced', 'Upcoming', 'Airing Soon', 'Delayed'];
const UPCOMING_TYPES = ['TV', 'Movie', 'OVA', 'ONA', 'Special'];
const UPCOMING_SOURCES = ['Manga', 'Light Novel', 'Original', 'Game', 'Web Manga', 'Other'];
let importRecords = [];
let importFile = null;
let importMode = 'skip';
let importOutcomes = new Map();
let importFailedRecords = [];
let importRunning = false;

export function setupUpcomingManager() {
  const form = document.getElementById('upcomingManagerForm');
  if (!form) return;
  setupUpcomingImport();

  upcomingPosterField = new ImageUploadField(document.getElementById('upcomingPoster'), {
    kind: 'upcoming',
    slug: () => normalizeAnimeSlug(
      document.getElementById('upcomingSlug')?.value ||
      document.getElementById('upcomingTitle')?.value ||
      ''
    ),
  });
  form.addEventListener('submit', saveUpcomingAnime);

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

function setupUpcomingImport() {
  const openButton = document.getElementById('openUpcomingImportButton');
  const modal = document.getElementById('upcomingImportModal');
  const fileInput = document.getElementById('upcomingImportFile');
  const dropzone = document.getElementById('upcomingImportDropzone');
  if (!openButton || !modal || !fileInput || !dropzone) return;

  openButton.addEventListener('click', () => openUpcomingImportModal());
  document.getElementById('cancelUpcomingImportButton')?.addEventListener('click', closeUpcomingImportModal);
  document.getElementById('upcomingImportBrowseButton')?.addEventListener('click', () => fileInput.click());
  document.getElementById('previewUpcomingImportButton')?.addEventListener('click', previewUpcomingImport);
  document.getElementById('confirmUpcomingImportButton')?.addEventListener('click', importUpcomingRecords);
  document.getElementById('retryUpcomingImportButton')?.addEventListener('click', retryFailedUpcomingImports);

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0] || null;
    setUpcomingImportFile(file);
    fileInput.value = '';
  });
  dropzone.addEventListener('dragover', event => {
    event.preventDefault();
    dropzone.classList.add('dragging');
  });
  dropzone.addEventListener('dragleave', event => {
    if (!dropzone.contains(event.relatedTarget)) dropzone.classList.remove('dragging');
  });
  dropzone.addEventListener('drop', event => {
    event.preventDefault();
    dropzone.classList.remove('dragging');
    setUpcomingImportFile(event.dataTransfer?.files?.[0] || null);
  });

  modal.addEventListener('click', event => {
    if (event.target === modal) closeUpcomingImportModal();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && modal.classList.contains('show')) closeUpcomingImportModal();
  });
  document.querySelectorAll('input[name="upcomingImportMode"]').forEach(input => {
    input.addEventListener('change', () => {
      importMode = document.querySelector('input[name="upcomingImportMode"]:checked')?.value || 'skip';
      renderUpcomingImportPlan();
    });
  });
  document.getElementById('confirmUpcomingImportCheck')?.addEventListener('change', updateUpcomingImportControls);
}

function openUpcomingImportModal() {
  const modal = document.getElementById('upcomingImportModal');
  if (!modal) return;
  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add('show'));
  document.getElementById('upcomingImportBrowseButton')?.focus();
}

function closeUpcomingImportModal() {
  const modal = document.getElementById('upcomingImportModal');
  if (!modal) return;
  modal.classList.remove('show');
  window.setTimeout(() => {
    if (!modal.classList.contains('show')) modal.hidden = true;
  }, 250);
}

function setUpcomingImportFile(file) {
  if (importRunning) return;
  const fileLabel = document.getElementById('upcomingImportFileLabel');
  const message = document.getElementById('upcomingImportMessage');
  resetUpcomingImportPreview();
  importFile = file;
  if (!file) {
    if (fileLabel) fileLabel.textContent = 'No file selected';
    return;
  }
  if (fileLabel) fileLabel.textContent = `${file.name} (${formatImportFileSize(file.size)})`;
  if (!file.name.toLowerCase().endsWith('.json')) {
    showImportMessage(message, 'Choose a .json file.', 'error');
    importFile = null;
    return;
  }
  if (file.size > IMPORT_MAX_BYTES) {
    showImportMessage(message, 'The JSON file must be 5 MB or smaller.', 'error');
    importFile = null;
    return;
  }
  if (message) {
    message.hidden = true;
    message.textContent = '';
  }
}

function resetUpcomingImportPreview() {
  importRecords = [];
  importOutcomes = new Map();
  importFailedRecords = [];
  importMode = 'skip';
  const preview = document.getElementById('upcomingImportPreview');
  const results = document.getElementById('upcomingImportResults');
  const mode = document.querySelector('input[name="upcomingImportMode"][value="skip"]');
  if (mode) mode.checked = true;
  if (preview) preview.hidden = true;
  if (results) results.hidden = true;
  document.getElementById('upcomingImportSummary')?.replaceChildren();
  document.getElementById('upcomingImportPreviewBody')?.replaceChildren();
  document.getElementById('upcomingImportErrors')?.replaceChildren();
  document.getElementById('upcomingImportResultSummary')?.replaceChildren();
  document.getElementById('upcomingImportFailureList')?.replaceChildren();
  const progress = document.getElementById('upcomingImportProgress');
  if (progress) {
    progress.value = 0;
    progress.hidden = true;
  }
  const progressLabel = document.getElementById('upcomingImportProgressLabel');
  if (progressLabel) progressLabel.textContent = '';
  const confirm = document.getElementById('confirmUpcomingImportCheck');
  if (confirm) confirm.checked = false;
  updateUpcomingImportControls();
}

async function previewUpcomingImport() {
  const message = document.getElementById('upcomingImportMessage');
  const previewButton = document.getElementById('previewUpcomingImportButton');
  if (!importFile) {
    showImportMessage(message, 'Select a JSON file before previewing.', 'error');
    return;
  }
  if (!db || !isConfigured) {
    showImportMessage(message, 'Firebase is not configured.', 'error');
    return;
  }
  const user = auth?.currentUser;
  if (!user || !await verifyAdminStatus(user)) {
    showImportMessage(message, 'Admin permission required to preview upcoming anime.', 'error');
    return;
  }

  resetUpcomingImportPreview();
  previewButton.disabled = true;
  showImportMessage(message, 'Reading and validating JSON…', 'info');
  try {
    const parsed = JSON.parse(await importFile.text());
    const rawRecords = Array.isArray(parsed) ? parsed : parsed?.anime ?? parsed?.records;
    if (!Array.isArray(rawRecords)) {
      throw new Error('Expected a JSON array or an object containing an "anime" or "records" array.');
    }
    if (rawRecords.length === 0) throw new Error('The JSON file contains no records.');
    if (rawRecords.length > IMPORT_MAX_RECORDS) {
      throw new Error(`The file contains ${rawRecords.length} records; the maximum supported is ${IMPORT_MAX_RECORDS}.`);
    }

    const existing = await getDocs(query(collection(db, 'upcomingAnime')));
    const existingEntries = existing.docs.map(document => ({ id: document.id, ...document.data() }));
    importRecords = rawRecords.map((record, index) => validateUpcomingImportRecord(record, index + 1));
    importRecords.forEach(record => {
      if (record.valid) {
        record.match = findUpcomingImportMatch(record, existingEntries);
        if (!record.payload.title && !record.match) {
          record.errors.push({ field: 'animeTitle', message: 'Anime title is required for a new record.' });
          record.valid = false;
        }
        if (!record.payload.slug && !record.match) {
          record.errors.push({ field: 'animeSlug', message: 'Anime slug is required when it cannot be generated from a title.' });
          record.valid = false;
        }
      }
    });
    const seenKeys = new Set();
    importRecords.forEach(record => {
      if (!record.valid) return;
      const duplicateKeys = [
        ...(record.documentId ? [`id:${record.documentId}`] : []),
        ...(record.payload.slug ? [`slug:${record.payload.slug}`] : []),
      ];
      if (duplicateKeys.some(key => seenKeys.has(key))) record.duplicateWithinFile = true;
      duplicateKeys.forEach(key => seenKeys.add(key));
    });
    importMode = 'skip';
    const skipMode = document.querySelector('input[name="upcomingImportMode"][value="skip"]');
    if (skipMode) skipMode.checked = true;
    const preview = document.getElementById('upcomingImportPreview');
    if (preview) preview.hidden = false;
    const results = document.getElementById('upcomingImportResults');
    if (results) results.hidden = true;
    renderUpcomingImportPlan();
    showImportMessage(message, 'Preview ready. Review all validation issues and the import plan before confirming.', 'success');
  } catch (error) {
    importRecords = [];
    if (error?.code) handleFirestoreError(error, 'list', 'upcomingAnime');
    const prefix = error instanceof SyntaxError ? 'Malformed JSON: ' : '';
    showImportMessage(message, `${prefix}${error?.message || String(error)}`, 'error');
  } finally {
    previewButton.disabled = false;
  }
}

function validateUpcomingImportRecord(record, number) {
  const errors = [];
  const payload = {};
  const supplied = new Set();
  let documentId = '';
  const addError = (field, message) => errors.push({ field, message });

  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return { number, valid: false, errors: [{ field: 'record', message: 'Each record must be a JSON object.' }], payload, supplied };
  }
  Object.keys(record).forEach(field => {
    if (!IMPORT_ALLOWED_FIELDS.has(field)) addError(field, 'Unsupported field; remove it or map it to a supported Upcoming Anime field.');
  });

  for (const [canonical, aliases] of Object.entries(IMPORT_FIELDS)) {
    const presentAliases = aliases.filter(alias => Object.hasOwn(record, alias));
    if (!presentAliases.length) continue;
    if (presentAliases.length > 1) {
      addError(aliases[0], `Provide only one of: ${presentAliases.join(', ')}.`);
      continue;
    }
    const field = presentAliases[0];
    supplied.add(canonical);
    const value = record[field];
    const normalized = normalizeUpcomingImportField(canonical, value);
    if (normalized.error) addError(field, normalized.error);
    else payload[canonical] = normalized.value;
  }

  const suppliedIds = IMPORT_IDENTIFIER_FIELDS.filter(field => Object.hasOwn(record, field));
  if (suppliedIds.length > 1) addError('documentId', `Provide only one of: ${IMPORT_IDENTIFIER_FIELDS.join(', ')}.`);
  if (suppliedIds.length) {
    const value = record[suppliedIds[0]];
    if (typeof value !== 'string' || !value.trim() || value.includes('/') || value.length > 1500) {
      addError(suppliedIds[0], 'Document ID must be a non-empty string without slashes and no longer than 1500 characters.');
    } else {
      documentId = value.trim();
    }
  }

  if (payload.title && !payload.slug && !supplied.has('slug')) {
    payload.slug = normalizeAnimeSlug(payload.title);
  } else if (supplied.has('slug') && typeof payload.slug === 'string') {
    payload.slug = normalizeAnimeSlug(payload.slug);
  }
  if (payload.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(payload.slug)) {
    addError('animeSlug', 'Slug must contain lowercase letters, numbers, and single hyphens only.');
  }
  if (supplied.has('slug') && !payload.slug) addError('animeSlug', 'Anime slug cannot be empty.');
  if (supplied.has('title') && !payload.title) addError('animeTitle', 'Anime title cannot be empty.');

  return { number, valid: errors.length === 0, errors, payload, supplied, documentId, duplicateWithinFile: false, match: null };
}

function normalizeUpcomingImportField(field, value) {
  const fail = message => ({ error: message });
  const optionalString = (maxLength, label = field) => {
    if (value === null) return { value: '' };
    if (typeof value !== 'string') return fail(`${label} must be a string.`);
    const text = value.trim();
    if (text.length > maxLength) return fail(`${label} must be ${maxLength} characters or fewer.`);
    return { value: text };
  };

  if (['title', 'japaneseTitle', 'slug', 'poster', 'shortDescription', 'description', 'releaseDate', 'season', 'releaseStatus', 'type', 'studio', 'source', 'duration', 'ageRating', 'trailerUrl', 'officialUrl', 'malUrl', 'anilistUrl', 'crunchyrollUrl'].includes(field)) {
    const limits = {
      title: 200, japaneseTitle: 200, slug: 200, poster: 2048, shortDescription: 400,
      description: 8000, releaseDate: 100, season: 30, releaseStatus: 30, type: 30,
      studio: 200, source: 50, duration: 80, ageRating: 40, trailerUrl: 2048,
      officialUrl: 2048, malUrl: 2048, anilistUrl: 2048, crunchyrollUrl: 2048,
    };
    const result = optionalString(limits[field], field);
    if (result.error) return result;
    const allowed = {
      season: UPCOMING_SEASONS,
      releaseStatus: UPCOMING_RELEASE_STATUSES,
      type: UPCOMING_TYPES,
      source: UPCOMING_SOURCES,
    }[field];
    if (allowed && result.value && !allowed.includes(result.value)) {
      return fail(`Must be one of: ${allowed.join(', ')}.`);
    }
    if (['poster', 'trailerUrl', 'officialUrl', 'malUrl', 'anilistUrl', 'crunchyrollUrl'].includes(field) && result.value) {
      const safeUrl = validateImportUrl(result.value);
      if (safeUrl.error) return safeUrl;
      return { value: safeUrl.value };
    }
    return result;
  }

  if (field === 'releaseYear') {
    if (value === null || value === '') return { value: null };
    if (!(typeof value === 'number' || (typeof value === 'string' && /^\d{4}$/.test(value)))) {
      return fail('Release year must be a four-digit year or null.');
    }
    const year = Number(value);
    if (!Number.isInteger(year) || year < 2025 || year > 2100) return fail('Release year must be between 2025 and 2100.');
    return { value: String(year) };
  }
  if (field === 'genres') {
    if (typeof value !== 'string' && !Array.isArray(value)) return fail('Genres must be an array of strings or a comma-separated string.');
    const genres = (Array.isArray(value) ? value : value.split(',')).map(genre => {
      if (typeof genre !== 'string') return null;
      return genre.trim();
    });
    if (genres.some(genre => genre === null)) return fail('Every genre must be a string.');
    const normalized = [...new Set(genres.filter(Boolean))];
    if (normalized.length > 30 || normalized.some(genre => genre.length > 80)) {
      return fail('Genres may contain at most 30 values, each no longer than 80 characters.');
    }
    return { value: normalized };
  }
  if (field === 'episodes') {
    if (value === null) return { value: 'TBA' };
    if (typeof value !== 'string' && typeof value !== 'number') return fail('Episodes must be a string, number, or null.');
    const episodes = String(value).trim();
    if (episodes.length > 30) return fail('Episodes must be 30 characters or fewer.');
    return { value: episodes || 'TBA' };
  }
  if (field === 'featured') {
    return typeof value === 'boolean' ? { value } : fail('Featured Upcoming Anime must be true or false.');
  }
  if (field === 'status') {
    if (typeof value !== 'string') return fail('Publication status must be Draft, Published, or Archived.');
    const status = value.trim().toLowerCase();
    if (!['draft', 'published', 'archived'].includes(status)) return fail('Publication status must be Draft, Published, or Archived.');
    return { value: status };
  }
  return fail('Unsupported field.');
}

function validateImportUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      return { error: 'URL must use HTTP or HTTPS and cannot contain credentials.' };
    }
    return { value: url.toString() };
  } catch {
    return { error: 'Enter a valid HTTP or HTTPS URL.' };
  }
}

function findUpcomingImportMatch(record, entries) {
  if (record.documentId) {
    const idMatch = entries.find(entry => entry.id === record.documentId);
    if (idMatch) return idMatch;
  }
  if (!record.payload.slug) return null;
  return entries.find(entry => entry.slug === record.payload.slug) || null;
}

function renderUpcomingImportPlan() {
  const summary = document.getElementById('upcomingImportSummary');
  const body = document.getElementById('upcomingImportPreviewBody');
  const errorsList = document.getElementById('upcomingImportErrors');
  if (!summary || !body || !errorsList) return;

  const valid = importRecords.filter(record => record.valid).length;
  const invalid = importRecords.length - valid;
  const decisions = importRecords.map(record => getUpcomingImportDecision(record));
  const counts = decisions.reduce((result, decision) => {
    result[decision] += 1;
    return result;
  }, { create: 0, update: 0, skip: 0, reject: 0 });
  summary.replaceChildren();
  [
    ['Total records', importRecords.length],
    ['Valid records', valid],
    ['Invalid records', invalid],
    ['Duplicate records', counts.skip + counts.update],
    ['Will create', counts.create],
    ['Will update', counts.update],
    ['Will skip', counts.skip],
    ['Will reject', counts.reject],
  ].forEach(([label, value]) => {
    const item = document.createElement('div');
    item.className = 'upcoming-import-stat';
    const amount = document.createElement('strong');
    amount.textContent = String(value);
    const caption = document.createElement('span');
    caption.textContent = label;
    item.append(amount, caption);
    summary.appendChild(item);
  });

  body.replaceChildren();
  const previewRows = importRecords.slice(0, 200);
  previewRows.forEach((record, index) => {
    const row = body.insertRow();
    const values = [
      String(record.number),
      record.payload.title || '—',
      record.payload.slug || '—',
      record.payload.releaseYear || '—',
      record.payload.releaseStatus || '—',
      record.payload.status || 'draft',
      decisionLabel(decisions[index]),
    ];
    values.forEach(value => {
      const cell = row.insertCell();
      cell.textContent = String(value);
    });
    if (!record.valid || record.duplicateWithinFile) row.classList.add('upcoming-import-row-warning');
  });
  if (importRecords.length > previewRows.length) {
    const row = body.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 7;
    cell.textContent = `${importRecords.length - previewRows.length} additional records are not shown in the table.`;
  }

  errorsList.replaceChildren();
  importRecords.flatMap(record => record.errors.map(error => ({ number: record.number, ...error }))).forEach(error => {
    const item = document.createElement('li');
    item.textContent = `Record ${error.number} — ${error.field}: ${error.message}`;
    errorsList.appendChild(item);
  });
  importRecords.filter(record => record.duplicateWithinFile).forEach(record => {
    const item = document.createElement('li');
    item.textContent = `Record ${record.number} — animeSlug: Duplicate of an earlier record in this file; it will be skipped.`;
    errorsList.appendChild(item);
  });
  const errorPanel = document.getElementById('upcomingImportValidationPanel');
  if (errorPanel) errorPanel.hidden = errorsList.childElementCount === 0;
  renderUpcomingImportCounts(counts, valid, invalid);
  updateUpcomingImportControls();
}

function getUpcomingImportDecision(record) {
  if (!record.valid) return 'reject';
  if (record.duplicateWithinFile) return 'skip';
  if (!record.match) return 'create';
  return importMode === 'update' ? 'update' : 'skip';
}

function decisionLabel(decision) {
  return {
    create: 'Create',
    update: 'Update',
    skip: 'Skip duplicate',
    reject: 'Reject',
  }[decision];
}

function renderUpcomingImportCounts(counts, valid, invalid) {
  const node = document.getElementById('upcomingImportPlanText');
  if (!node) return;
  node.textContent = `${valid} valid · ${counts.create} to create · ${counts.update} to update · ${counts.skip} duplicates to skip · ${invalid} rejected`;
}

function updateUpcomingImportControls() {
  const confirm = document.getElementById('confirmUpcomingImportCheck');
  const button = document.getElementById('confirmUpcomingImportButton');
  const previewExists = importRecords.length > 0;
  const hasWrites = importRecords.some(record => ['create', 'update'].includes(getUpcomingImportDecision(record)));
  if (button) button.disabled = importRunning || !previewExists || !hasWrites || !confirm?.checked;
  document.querySelectorAll('input[name="upcomingImportMode"]').forEach(input => {
    input.disabled = importRunning;
  });
  const previewButton = document.getElementById('previewUpcomingImportButton');
  if (previewButton) previewButton.disabled = importRunning;
  const browseButton = document.getElementById('upcomingImportBrowseButton');
  if (browseButton) browseButton.disabled = importRunning;
  const fileInput = document.getElementById('upcomingImportFile');
  if (fileInput) fileInput.disabled = importRunning;
  const retryButton = document.getElementById('retryUpcomingImportButton');
  if (retryButton) retryButton.disabled = importRunning;
}

async function importUpcomingRecords() {
  if (importRunning) return;
  importRunning = true;
  updateUpcomingImportControls();
  const confirmation = document.getElementById('confirmUpcomingImportCheck');
  const message = document.getElementById('upcomingImportMessage');
  try {
    if (!confirmation?.checked) {
      showImportMessage(message, 'Confirm the import plan before starting.', 'error');
      return;
    }
    const user = auth?.currentUser;
    if (!db || !isConfigured || !user || !await verifyAdminStatus(user)) {
      showImportMessage(message, 'Admin permission and a configured Firebase connection are required to import records.', 'error');
      return;
    }

    const freshSnapshot = await getUpcomingImportSnapshot(message);
    if (!freshSnapshot) return;
    const freshEntries = freshSnapshot.docs.map(document => ({ id: document.id, ...document.data() }));
    importRecords.forEach(record => {
      if (record.valid) record.match = findUpcomingImportMatch(record, freshEntries);
    });
    renderUpcomingImportPlan();
    importRecords.forEach(record => {
      if (record.valid && getUpcomingImportDecision(record) === 'skip') {
        importOutcomes.set(record.number, { status: 'skipped', message: 'Duplicate record skipped.' });
      }
    });
    if (!importRecords.some(record => ['create', 'update'].includes(getUpcomingImportDecision(record)))) {
      renderUpcomingImportResults();
      showImportMessage(message, 'There are no records to write for the selected import mode.', 'info');
      return;
    }
    confirmation.checked = false;
    updateUpcomingImportControls();
    await commitUpcomingImportRecords(importRecords.filter(record => ['create', 'update'].includes(getUpcomingImportDecision(record))));
  } finally {
    importRunning = false;
    updateUpcomingImportControls();
  }
}

async function retryFailedUpcomingImports() {
  if (!importFailedRecords.length || importRunning) return;
  importRunning = true;
  updateUpcomingImportControls();
  const message = document.getElementById('upcomingImportMessage');
  try {
    const user = auth?.currentUser;
    if (!db || !isConfigured || !user || !await verifyAdminStatus(user)) {
      showImportMessage(message, 'Admin permission and a configured Firebase connection are required to retry writes.', 'error');
      return;
    }
    const snapshot = await getUpcomingImportSnapshot(message);
    if (!snapshot) return;
    const entries = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
    const retryRecords = [...importFailedRecords];
    importFailedRecords = [];
    retryRecords.forEach(record => {
      record.match = findUpcomingImportMatch(record, entries);
      if (record.match && importMode === 'skip') {
        importOutcomes.set(record.number, { status: 'skipped', message: 'Matching record now exists.' });
      }
    });
    await commitUpcomingImportRecords(retryRecords.filter(record => !importOutcomes.has(record.number) || importOutcomes.get(record.number).status === 'failed'));
  } finally {
    importRunning = false;
    updateUpcomingImportControls();
  }
}

async function getUpcomingImportSnapshot(message) {
  try {
    return await getDocs(query(collection(db, 'upcomingAnime')));
  } catch (error) {
    handleFirestoreError(error, 'list', 'upcomingAnime');
    showImportMessage(message, `Could not check existing records: ${error?.message || String(error)}`, 'error');
    return null;
  }
}

async function commitUpcomingImportRecords(records) {
  const progress = document.getElementById('upcomingImportProgress');
  const progressLabel = document.getElementById('upcomingImportProgressLabel');
  const resultPanel = document.getElementById('upcomingImportResults');
  const message = document.getElementById('upcomingImportMessage');
  const retryButton = document.getElementById('retryUpcomingImportButton');
  importRunning = true;
  if (resultPanel) resultPanel.hidden = false;
  if (progress) {
    progress.hidden = false;
    progress.max = Math.max(records.length, 1);
    progress.value = 0;
  }
  importFailedRecords = [];
  let processed = 0;

  for (let offset = 0; offset < records.length; offset += IMPORT_BATCH_SIZE) {
    const chunk = records.slice(offset, offset + IMPORT_BATCH_SIZE);
    const batch = writeBatch(db);
    const writes = [];
    try {
      chunk.forEach(record => {
        const decision = getUpcomingImportDecision(record);
        if (decision === 'skip') {
          importOutcomes.set(record.number, { status: 'skipped', message: 'Duplicate record skipped.' });
          return;
        }
        const now = serverTimestamp();
        if (decision === 'update' && record.match) {
          const updates = { ...record.payload };
          if (!record.supplied.has('slug')) delete updates.slug;
          if (!record.supplied.has('title')) delete updates.title;
          batch.set(doc(db, 'upcomingAnime', record.match.id), { ...updates, updatedAt: now }, { merge: true });
          writes.push({ record, status: 'updated' });
        } else if (decision === 'create') {
          const newRef = doc(collection(db, 'upcomingAnime'));
          const data = {
            title: '',
            japaneseTitle: '',
            slug: '',
            poster: '',
            shortDescription: '',
            description: '',
            releaseDate: null,
            releaseYear: null,
            season: 'TBA',
            releaseStatus: 'TBA',
            type: 'TV',
            genres: [],
            studio: '',
            source: 'Original',
            episodes: 'TBA',
            duration: '',
            ageRating: '',
            trailerUrl: '',
            officialUrl: '',
            malUrl: '',
            anilistUrl: '',
            crunchyrollUrl: '',
            featured: false,
            status: 'draft',
            createdAt: now,
            updatedAt: now,
            ...record.payload,
          };
          batch.set(newRef, data);
          writes.push({ record, status: 'created' });
        }
      });
      if (writes.length) {
        await batch.commit();
        writes.forEach(({ record, status }) => importOutcomes.set(record.number, { status }));
      }
    } catch (error) {
      handleFirestoreError(error, 'bulk-import', 'upcomingAnime');
      const reason = describeImportWriteError(error);
      writes.forEach(({ record }) => {
        importOutcomes.set(record.number, { status: 'failed', message: reason });
        importFailedRecords.push(record);
      });
    }
    processed += chunk.length;
    if (progress) progress.value = processed;
    if (progressLabel) progressLabel.textContent = `${processed} of ${records.length} import records processed`;
    renderUpcomingImportResults();
  }

  if (retryButton) retryButton.hidden = importFailedRecords.length === 0;
  if (importFailedRecords.length) {
    showImportMessage(message, `Import finished with ${importFailedRecords.length} failed write(s). Review the reasons below; successful writes were confirmed by Firestore.`, 'error');
  } else {
    showImportMessage(message, 'Import writes were confirmed by Firestore.', 'success');
  }
  await loadUpcomingEntries();
  renderUpcomingImportResults();
  importRunning = false;
  updateUpcomingImportControls();
}

function describeImportWriteError(error) {
  if (error?.code === 'permission-denied' || /missing or insufficient permissions/i.test(error?.message || '')) {
    return 'Permission denied by Firestore. Confirm administrator access and the existing Firestore rules.';
  }
  if (error?.code === 'unavailable' || /offline|network/i.test(error?.message || '')) {
    return `Network unavailable: ${error?.message || 'check the connection and retry.'}`;
  }
  if (error?.code === 'resource-exhausted') return `Firestore quota or write limit reached: ${error.message || 'retry later.'}`;
  return error?.message || String(error);
}

function renderUpcomingImportResults() {
  const summary = document.getElementById('upcomingImportResultSummary');
  const failures = document.getElementById('upcomingImportFailureList');
  if (!summary || !failures) return;
  const counts = { created: 0, updated: 0, skipped: 0, rejected: 0, failed: 0 };
  importRecords.forEach(record => {
    if (!record.valid) counts.rejected += 1;
    const outcome = importOutcomes.get(record.number);
    if (outcome?.status && Object.hasOwn(counts, outcome.status)) counts[outcome.status] += 1;
  });
  summary.textContent = `Created: ${counts.created} · Updated: ${counts.updated} · Duplicates skipped: ${counts.skipped} · Invalid rejected: ${counts.rejected} · Failed writes: ${counts.failed}`;
  failures.replaceChildren();
  importRecords.forEach(record => {
    const outcome = importOutcomes.get(record.number);
    if (outcome?.status !== 'failed') return;
    const item = document.createElement('li');
    item.textContent = `Record ${record.number} (${record.payload.title || record.payload.slug || 'untitled'}): ${outcome.message}`;
    failures.appendChild(item);
  });
}

function showImportMessage(element, text, type) {
  if (!element) return;
  element.className = `form-feedback ${type}`;
  element.textContent = text;
  element.hidden = false;
}

function formatImportFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
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
  let poster;
  try {
    poster = normalizeImageUrl(document.getElementById('upcomingPoster').value);
  } catch (error) {
    showUpcomingFeedback(feedback, error.message, 'error');
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

function populateUpcomingForm(item) {
  document.getElementById('upcomingFormHeading').textContent = 'Edit Upcoming Anime';
  document.getElementById('upcomingDocumentId').value = item.id;
  const fields = [
    ['upcomingTitle', item.title],
    ['upcomingJapaneseTitle', item.japaneseTitle],
    ['upcomingSlug', item.slug],
    ['upcomingPoster', item.poster],
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
  upcomingPosterField?.refresh();
  const featuredCheckbox = document.getElementById('upcomingFeatured');
  if (featuredCheckbox) featuredCheckbox.checked = Boolean(item.featured);
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
  upcomingPosterField?.refresh();
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

function normalizeImageUrl(value) {
  const candidate = value.trim();
  if (!candidate) return '';
  const url = new URL(candidate);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Poster image URLs must use HTTP or HTTPS.');
  }
  return url.toString();
}
