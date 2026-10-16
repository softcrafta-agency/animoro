import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
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
import {
  validateUpcomingImportRecord as validateUpcomingImportRecordInput,
} from './upcoming-import-validation.js';
import { createAdminTableSelection, openBulkDeleteConfirmation } from './admin-table-selection.js';
import { setupAdminBulkEdit } from './admin-bulk-edit.js';

let upcomingSlugManuallyEdited = false;
let upcomingPosterField = null;
let upcomingEntries = [];
let upcomingTableSelection = null;
const IMPORT_BATCH_SIZE = 400;
const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
const IMPORT_MAX_RECORDS = 1000;
const UPCOMING_BULK_EDIT_FIELDS = [
  { key: 'title', label: 'Anime Title', required: true, maxLength: 200 },
  { key: 'japaneseTitle', label: 'Japanese Title' },
  { key: 'slug', label: 'Anime Slug', required: true, maxLength: 200 },
  { key: 'poster', label: 'Poster Image URL', type: 'url' },
  { key: 'shortDescription', label: 'Short Description', type: 'textarea', maxLength: 400 },
  { key: 'description', label: 'Full Description', type: 'textarea', maxLength: 8000 },
  { key: 'releaseDate', label: 'Release Date' },
  { key: 'releaseYear', label: 'Release Year', type: 'number', min: 2025, max: 2100 },
  { key: 'season', label: 'Season', type: 'select', options: ['TBA', 'Winter', 'Spring', 'Summer', 'Fall'].map(value => ({ value, label: value })) },
  { key: 'releaseStatus', label: 'Release Status', type: 'select', options: ['TBA', 'Announced', 'Upcoming', 'Airing Soon', 'Airing', 'Completed', 'Delayed'].map(value => ({ value, label: value })) },
  { key: 'type', label: 'Type', type: 'select', options: ['TV', 'Movie', 'OVA', 'ONA', 'Special'].map(value => ({ value, label: value })) },
  { key: 'genres', label: 'Genres (comma separated)' },
  { key: 'studio', label: 'Studio' },
  { key: 'source', label: 'Source', type: 'select', options: ['Manga', 'Light Novel', 'Original', 'Game', 'Web Manga', 'Other'].map(value => ({ value, label: value })) },
  { key: 'episodes', label: 'Episodes' },
  { key: 'duration', label: 'Duration' },
  { key: 'ageRating', label: 'Age Rating' },
  { key: 'trailerUrl', label: 'Trailer URL', type: 'url' },
  { key: 'officialUrl', label: 'Official Website', type: 'url' },
  { key: 'malUrl', label: 'MyAnimeList URL', type: 'url' },
  { key: 'anilistUrl', label: 'AniList URL', type: 'url' },
  { key: 'crunchyrollUrl', label: 'Crunchyroll URL', type: 'url' },
  { key: 'featured', label: 'Featured Upcoming Anime', type: 'checkbox' },
  { key: 'status', label: 'Status', type: 'select', options: ['draft', 'published', 'archived'].map(value => ({ value, label: value })) },
];
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
  const openUpcomingBulkEdit = setupAdminBulkEdit({
    title: 'Bulk Edit Upcoming Anime',
    fields: UPCOMING_BULK_EDIT_FIELDS,
    saveRecord: saveUpcomingBulkRecord,
    onComplete: async updatedIds => {
      await loadUpcomingEntries();
      upcomingTableSelection?.removeSelectedIds(updatedIds);
    },
  });
  upcomingTableSelection = createAdminTableSelection({
    collectionName: 'upcomingAnime',
    tbodyId: 'upcomingAdminTableBody',
    selectAllId: 'upcomingSelectAll',
    selectedCountId: 'upcomingSelectedCount',
    bulkEditButtonId: 'upcomingBulkEditButton',
    bulkDeleteButtonId: 'upcomingBulkDeleteButton',
    paginationId: 'upcomingPagination',
    onBulkDelete: ids => openBulkDeleteConfirmation({
      collectionName: 'upcomingAnime',
      ids,
      label: 'upcoming anime records',
      onComplete: async ({ failed }) => {
        const failedIds = new Set(failed.map(item => item.id));
        const removedIds = new Set(ids.filter(id => !failedIds.has(id)));
        const editingId = document.getElementById('upcomingDocumentId').value;
        if (removedIds.has(editingId)) resetUpcomingForm();
        await loadUpcomingEntries();
        upcomingTableSelection?.clearSelection();
      },
    }),
    onBulkEdit: ids => openUpcomingBulkEdit(upcomingEntries.filter(item => ids.includes(item.id))),
  });

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
  searchInput?.addEventListener('input', () => {
    upcomingTableSelection?.resetPage();
    renderUpcomingRows();
  });

  const statusFilter = document.getElementById('upcomingStatusFilter');
  statusFilter?.addEventListener('change', () => {
    upcomingTableSelection?.resetPage();
    renderUpcomingRows();
  });

  const releaseStatusFilter = document.getElementById('upcomingReleaseStatusFilter');
  releaseStatusFilter?.addEventListener('change', () => {
    upcomingTableSelection?.resetPage();
    renderUpcomingRows();
  });

  document.getElementById('upcomingYearFilter')?.addEventListener('change', () => {
    upcomingTableSelection?.resetPage();
    renderUpcomingRows();
  });
  document.getElementById('upcomingSeasonFilter')?.addEventListener('change', () => {
    upcomingTableSelection?.resetPage();
    renderUpcomingRows();
  });

  const sortFilter = document.getElementById('upcomingSortFilter');
  sortFilter?.addEventListener('change', () => {
    upcomingTableSelection?.resetPage();
    renderUpcomingRows();
  });

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
    importRecords = rawRecords.map((record, index) => validateUpcomingImportRecordInput(record, index + 1));
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
    upcomingEntries = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
    renderUpcomingRows(upcomingEntries);
  } catch (error) {
    handleFirestoreError(error, 'list', 'upcomingAnime');
    upcomingEntries = [];
    renderUpcomingRows([], 'Unable to load upcoming anime.');
  }
}

function renderUpcomingRows(entries = upcomingEntries, emptyMessage = 'No upcoming anime entries yet.') {
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

  function getReleaseSortValue(value) {
    const timestamp = value ? new Date(value).getTime() : Number.NaN;
    return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
  }

  const createRow = item => {
    const row = document.createElement('tr');
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
    return row;
  };
  if (upcomingTableSelection) upcomingTableSelection.render(filtered, createRow, 10, emptyMessage);
  else tbody.replaceChildren(...filtered.map(createRow));
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

async function saveUpcomingBulkRecord(item, draft) {
  const user = auth?.currentUser;
  if (!db || !isConfigured || !user || !await verifyAdminStatus(user)) {
    throw new Error('Admin permission and a configured Firebase connection are required.');
  }
  const title = draft.title.trim();
  const slug = normalizeAnimeSlug(draft.slug.trim() || title);
  if (!title || !slug) throw new Error('Enter an anime title and a valid slug.');
  let matches;
  try {
    matches = await getDocs(query(
      collection(db, 'upcomingAnime'),
      where('slug', '==', slug),
      limit(2),
    ));
  } catch (error) {
    handleFirestoreError(error, 'check-slug', 'upcomingAnime');
    throw error;
  }
  if (matches.docs.some(document => document.id !== item.id)) {
    throw new Error(`The slug "${slug}" is already used by another upcoming anime record.`);
  }
  const poster = normalizeImageUrl(draft.poster);
  const optionalUrls = ['trailerUrl', 'officialUrl', 'malUrl', 'anilistUrl', 'crunchyrollUrl'];
  optionalUrls.forEach(key => {
    const value = draft[key].trim();
    if (!value) return;
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error(`${key} must be a complete HTTP(S) URL.`);
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new Error(`${key} must use HTTP or HTTPS and cannot contain credentials.`);
    }
  });
  if (!['draft', 'published', 'archived'].includes(draft.status)) {
    throw new Error('Choose a valid publication status.');
  }

  const payload = {
    title,
    japaneseTitle: draft.japaneseTitle.trim(),
    slug,
    poster,
    shortDescription: draft.shortDescription.trim(),
    description: draft.description.trim(),
    releaseDate: draft.releaseDate.trim() || null,
    releaseYear: draft.releaseYear.trim() || null,
    season: draft.season,
    releaseStatus: draft.releaseStatus,
    type: draft.type,
    genres: parseList(draft.genres),
    studio: draft.studio.trim(),
    source: draft.source,
    episodes: draft.episodes.trim() || 'TBA',
    duration: draft.duration.trim(),
    ageRating: draft.ageRating.trim(),
    trailerUrl: draft.trailerUrl.trim(),
    officialUrl: draft.officialUrl.trim(),
    malUrl: draft.malUrl.trim(),
    anilistUrl: draft.anilistUrl.trim(),
    crunchyrollUrl: draft.crunchyrollUrl.trim(),
    featured: Boolean(draft.featured),
    status: draft.status,
    updatedAt: serverTimestamp(),
  };
  try {
    await updateDoc(doc(db, 'upcomingAnime', item.id), payload);
  } catch (error) {
    handleFirestoreError(error, 'update', `upcomingAnime/${item.id}`);
    throw error;
  }
  return payload;
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
