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
  writeBatch,
  updateDoc,
  where
} from 'firebase/firestore';
import { db, handleFirestoreError, isConfigured } from './firebase-init.js';
import { auth } from './auth-init.js';
import { verifyAdminStatus } from './auth.js';
import { normalizeAnimeSlug } from './anime-url.js';
import { isValidReleaseSchedule } from './anime-release-calendar.js';
import { commitAnimeImportBatches } from './anime-import-batches.js';
import { createAdminTableSelection, openBulkDeleteConfirmation } from './admin-table-selection.js';
import { setupAnimeListManager } from './admin-anime-lists.js';
import { setupAdminBulkEdit } from './admin-bulk-edit.js';
import { ImageUploadField } from './image-upload-field.js';
import {
  markAnimeImportDuplicates,
  parseAnimeImportJson,
  validateAnimeImportRecord,
} from './anime-import-validation.js';

const ANIME_FIELDS = [
  'Title', 'Slug', 'AlternativeTitles', 'Synopsis', 'SeoTitle', 'SeoDescription', 'CoverImage', 'BannerImage',
  'Genres', 'Type', 'Status', 'ReleaseYear', 'Studio', 'Episodes', 'Season',
  'Source', 'Rating', 'Characters', 'Tags', 'ReleaseDay', 'ReleaseTime',
  'Timezone', 'NextEpisode', 'CalendarEnabled', 'EpisodeReleaseDate',
  'EpisodeNumber', 'EpisodeTitle', 'EpisodeReleaseTime', 'EpisodeTimezone',
  'EpisodeReleaseStatus', 'EpisodeScheduleNotes', 'Visibility'
];
const ANIME_IMPORT_BATCH_SIZE = 400;
const ANIME_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
const ANIME_IMPORT_MAX_RECORDS = 1000;
const ANIME_BULK_EDIT_FIELDS = [
  { key: 'title', label: 'Title', required: true, maxLength: 200 },
  { key: 'slug', label: 'Slug', required: true, maxLength: 200 },
  { key: 'alternativeTitles', label: 'Alternative Titles (comma separated)' },
  { key: 'synopsis', label: 'Synopsis', type: 'textarea', maxLength: 5000 },
  { key: 'seoTitle', label: 'SEO Title', maxLength: 200 },
  { key: 'seoDescription', label: 'SEO Description', type: 'textarea', maxLength: 1000 },
  { key: 'coverImage', label: 'Cover Image URL', type: 'url' },
  { key: 'bannerImage', label: 'Banner Image URL', type: 'url' },
  { key: 'genres', label: 'Genres (comma separated)' },
  { key: 'type', label: 'Type' },
  { key: 'status', label: 'Series Status', type: 'select', options: [
    { value: '', label: 'Not specified' },
    { value: 'upcoming', label: 'Upcoming' },
    { value: 'airing', label: 'Airing' },
    { value: 'completed', label: 'Completed' },
    { value: 'hiatus', label: 'Hiatus' },
  ] },
  { key: 'releaseYear', label: 'Release Year', type: 'number', min: 1900, max: 2200 },
  { key: 'studio', label: 'Studio' },
  { key: 'episodes', label: 'Episodes', type: 'number', min: 0 },
  { key: 'season', label: 'Season' },
  { key: 'source', label: 'Source' },
  { key: 'rating', label: 'Rating', type: 'number', min: 0, max: 10, step: 0.1 },
  { key: 'characters', label: 'Characters (comma separated)' },
  { key: 'tags', label: 'Tags (comma separated)' },
  { key: 'releaseDay', label: 'Release Day', type: 'select', options: [
    { value: '', label: 'Not scheduled' },
    ...['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(value => ({ value, label: value })),
  ] },
  { key: 'releaseTime', label: 'Release Time', type: 'time' },
  { key: 'timezone', label: 'Release Timezone (IANA)' },
  { key: 'nextEpisode', label: 'Next Episode', type: 'number', min: 1 },
  { key: 'visibility', label: 'Publication', type: 'select', options: [
    { value: 'draft', label: 'Draft' },
    { value: 'published', label: 'Published' },
  ] },
];
let slugManuallyEdited = false;
const animeImageFields = [];
let animeImportRecords = [];
let animeImportRunning = false;
let animeImportCompleted = false;
let animeEntries = [];
let animeTableSelection = null;

export function setupAnimeManager() {
  const form = document.getElementById('animeManagerForm');
  if (!form) return;

  animeImageFields.push(
    new ImageUploadField(document.getElementById('animeCoverImage'), { kind: 'covers' }),
    new ImageUploadField(document.getElementById('animeBannerImage'), { kind: 'covers' })
  );
  form.addEventListener('submit', saveAnime);
  document.getElementById('animeTitle')?.addEventListener('input', event => {
    if (!slugManuallyEdited) {
      document.getElementById('animeSlug').value = normalizeAnimeSlug(event.target.value);
    }
  });
  document.getElementById('animeSlug')?.addEventListener('input', () => {
    slugManuallyEdited = true;
  });
  document.getElementById('animeCalendarEnabled')?.addEventListener('change', event => {
    const fields = document.getElementById('animeReleaseCalendarFields');
    if (fields) fields.hidden = !event.target.checked;
  });
  const episodeTimezoneInput = document.getElementById('animeEpisodeTimezone');
  if (episodeTimezoneInput) episodeTimezoneInput.value = 'Asia/Kolkata';
  const timezoneList = document.getElementById('animeReleaseTimezones');
  if (timezoneList && typeof Intl.supportedValuesOf === 'function') {
    timezoneList.replaceChildren(...Intl.supportedValuesOf('timeZone').map(timezone => {
      const option = document.createElement('option');
      option.value = timezone;
      return option;
    }));
  }
  document.getElementById('cancelAnimeEditButton')?.addEventListener('click', resetAnimeForm);
  const openAnimeBulkEdit = setupAdminBulkEdit({
    title: 'Bulk Edit Anime',
    fields: ANIME_BULK_EDIT_FIELDS,
    saveRecord: saveAnimeBulkRecord,
    onComplete: async updatedIds => {
      await loadAnimeEntries();
      animeTableSelection?.removeSelectedIds(updatedIds);
    },
  });
  animeTableSelection = createAdminTableSelection({
    collectionName: 'anime',
    tbodyId: 'animeAdminTableBody',
    selectAllId: 'animeSelectAll',
    selectedCountId: 'animeSelectedCount',
    bulkEditButtonId: 'animeBulkEditButton',
    bulkDeleteButtonId: 'animeBulkDeleteButton',
    paginationId: 'animePagination',
    onSelectionChange: ids => {
      const addButton = document.getElementById('animeAddToListButton');
      if (addButton) addButton.disabled = ids.length === 0;
    },
    onBulkEdit: ids => openAnimeBulkEdit(animeEntries.filter(anime => ids.includes(anime.id))),
    onBulkDelete: ids => openBulkDeleteConfirmation({
      collectionName: 'anime',
      ids,
      label: 'anime',
      onComplete: async ({ failed }) => {
        const failedIds = new Set(failed.map(item => item.id));
        const removedIds = new Set(ids.filter(id => !failedIds.has(id)));
        if (valueOf('animeDocumentId') && removedIds.has(valueOf('animeDocumentId'))) resetAnimeForm();
        await loadAnimeEntries();
        animeTableSelection?.clearSelection();
      },
    }),
  });
  document.getElementById('animeSearchInput')?.addEventListener('input', () => {
    animeTableSelection?.resetPage();
    renderAnimeRows(animeEntries);
  });
  document.getElementById('animeVisibilityFilter')?.addEventListener('change', () => {
    animeTableSelection?.resetPage();
    renderAnimeRows(animeEntries);
  });
  setupAnimeListManager({
    getSelectedAnime: () => {
      const ids = new Set(animeTableSelection?.getSelectedIds() || []);
      return animeEntries.filter(anime => ids.has(anime.id));
    },
  });
  setupAnimeImport();
  loadAnimeEntries();
}

export async function loadAnimeEntries() {
  const tbody = document.getElementById('animeAdminTableBody');
  if (!tbody) return;
  if (!isConfigured || !db) {
    renderAnimeRows([], 'Firebase is not configured.');
    return;
  }

  try {
    const snapshot = await getDocs(collection(db, 'anime'));
    animeEntries = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
    renderAnimeRows(animeEntries);
  } catch (error) {
    handleFirestoreError(error, 'list', 'anime');
    animeEntries = [];
    renderAnimeRows([], 'Could not load anime entries. Verify admin permissions.');
  }
}

function setupAnimeImport() {
  const modal = document.getElementById('animeImportModal');
  const fileInput = document.getElementById('animeImportFile');
  const dropzone = document.getElementById('animeImportDropzone');
  if (!modal || !fileInput || !dropzone) return;

  document.getElementById('openAnimeImportButton')?.addEventListener('click', openAnimeImportModal);
  document.getElementById('closeAnimeImportButton')?.addEventListener('click', closeAnimeImportModal);
  document.getElementById('browseAnimeImportButton')?.addEventListener('click', () => fileInput.click());
  document.getElementById('validateAnimeImportButton')?.addEventListener('click', () => validateAnimeImport(false));
  document.getElementById('previewAnimeImportButton')?.addEventListener('click', () => validateAnimeImport(true));
  document.getElementById('importAnimeRecordsButton')?.addEventListener('click', importAnimeRecords);
  fileInput.addEventListener('change', () => {
    loadAnimeImportFile(fileInput.files?.[0] || null);
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
    loadAnimeImportFile(event.dataTransfer?.files?.[0] || null);
  });
  document.getElementById('animeImportJson')?.addEventListener('input', invalidateAnimeImportPreview);
  modal.addEventListener('click', event => {
    if (event.target === modal) closeAnimeImportModal();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !modal.hidden) closeAnimeImportModal();
  });
}

function openAnimeImportModal() {
  const modal = document.getElementById('animeImportModal');
  if (!modal) return;
  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add('show'));
  document.getElementById('animeImportJson')?.focus();
}

function closeAnimeImportModal() {
  if (animeImportRunning) return;
  const modal = document.getElementById('animeImportModal');
  if (!modal) return;
  modal.classList.remove('show');
  window.setTimeout(() => {
    if (!modal.classList.contains('show')) modal.hidden = true;
  }, 250);
}

async function loadAnimeImportFile(file) {
  if (animeImportRunning) return;
  const label = document.getElementById('animeImportFileLabel');
  const message = document.getElementById('animeImportMessage');
  invalidateAnimeImportPreview();
  if (!file) {
    if (label) label.textContent = 'No file selected';
    return;
  }
  if (!file.name.toLowerCase().endsWith('.json')) {
    showAnimeImportMessage(message, 'Choose a .json file.', 'error');
    if (label) label.textContent = 'No file selected';
    return;
  }
  if (file.size > ANIME_IMPORT_MAX_BYTES) {
    showAnimeImportMessage(message, 'The JSON file must be 5 MB or smaller.', 'error');
    if (label) label.textContent = 'No file selected';
    return;
  }
  try {
    document.getElementById('animeImportJson').value = await file.text();
    if (label) label.textContent = `${file.name} (${formatAnimeImportFileSize(file.size)})`;
    showAnimeImportMessage(message, 'JSON file loaded into the editor.', 'info');
  } catch (error) {
    showAnimeImportMessage(message, `Could not read the JSON file: ${error.message}`, 'error');
  }
}

function invalidateAnimeImportPreview() {
  animeImportRecords = [];
  animeImportCompleted = false;
  const preview = document.getElementById('animeImportPreview');
  const results = document.getElementById('animeImportResults');
  if (preview) preview.hidden = true;
  if (results) results.hidden = true;
  document.getElementById('animeImportSummary')?.replaceChildren();
  document.getElementById('animeImportPreviewBody')?.replaceChildren();
  document.getElementById('animeImportErrors')?.replaceChildren();
  document.getElementById('animeImportFailures')?.replaceChildren();
  document.getElementById('animeImportResultSummary')?.replaceChildren();
  const importButton = document.getElementById('importAnimeRecordsButton');
  if (importButton) importButton.disabled = true;
}

async function validateAnimeImport(checkExisting) {
  const editor = document.getElementById('animeImportJson');
  const message = document.getElementById('animeImportMessage');
  const validateButton = document.getElementById('validateAnimeImportButton');
  const previewButton = document.getElementById('previewAnimeImportButton');
  const buttons = [validateButton, previewButton].filter(Boolean);
  if (!db || !isConfigured) {
    showAnimeImportMessage(message, 'Firebase is not configured.', 'error');
    return;
  }
  if (checkExisting) {
    const user = auth?.currentUser;
    if (!user || !await verifyAdminStatus(user)) {
      showAnimeImportMessage(message, 'Admin permission is required to preview anime imports.', 'error');
      return;
    }
  }

  invalidateAnimeImportPreview();
  buttons.forEach(button => { button.disabled = true; });
  showAnimeImportMessage(message, checkExisting ? 'Validating records and checking existing slugs…' : 'Validating JSON…', 'info');
  try {
    const parsed = parseAnimeImportJson(editor.value);
    if (!parsed.length) throw new Error('The JSON array contains no records.');
    if (parsed.length > ANIME_IMPORT_MAX_RECORDS) {
      throw new Error(`The import contains ${parsed.length} records; the maximum supported is ${ANIME_IMPORT_MAX_RECORDS}.`);
    }
    animeImportRecords = parsed.map((record, index) => validateAnimeImportRecord(record, index + 1));
    if (checkExisting) {
      const slugs = [...new Set(animeImportRecords.filter(record => record.valid).map(record => record.payload.slug))];
      const existingSlugs = await findExistingAnimeSlugs(slugs);
      animeImportRecords = markAnimeImportDuplicates(animeImportRecords, existingSlugs);
    }
    renderAnimeImportPreview(checkExisting);
    showAnimeImportMessage(
      message,
      checkExisting
        ? 'Preview ready. Invalid and duplicate records will be skipped.'
        : 'JSON syntax and record fields are valid. Preview to check duplicate slugs.',
      'success'
    );
  } catch (error) {
    animeImportRecords = [];
    if (error?.code) handleFirestoreError(error, 'list', 'anime');
    const prefix = error instanceof SyntaxError ? 'Malformed JSON: ' : '';
    showAnimeImportMessage(message, `${prefix}${error?.message || String(error)}`, 'error');
  } finally {
    buttons.forEach(button => { button.disabled = false; });
  }
}

async function findExistingAnimeSlugs(slugs) {
  const existingSlugs = new Set();
  for (let offset = 0; offset < slugs.length; offset += 30) {
    const chunk = slugs.slice(offset, offset + 30);
    if (!chunk.length) continue;
    const snapshot = await getDocs(query(
      collection(db, 'anime'),
      where('slug', 'in', chunk)
    ));
    snapshot.docs.forEach(document => {
      const slug = document.data().slug;
      if (typeof slug === 'string') existingSlugs.add(slug);
    });
  }
  return existingSlugs;
}

function renderAnimeImportPreview(includeDuplicates) {
  const preview = document.getElementById('animeImportPreview');
  const summary = document.getElementById('animeImportSummary');
  const body = document.getElementById('animeImportPreviewBody');
  const errors = document.getElementById('animeImportErrors');
  const errorPanel = document.getElementById('animeImportErrorPanel');
  if (!preview || !summary || !body || !errors || !errorPanel) return;

  const total = animeImportRecords.length;
  const invalid = animeImportRecords.filter(record => !record.valid).length;
  const valid = total - invalid;
  const duplicate = includeDuplicates
    ? animeImportRecords.filter(record => record.valid && record.duplicate).length
    : 0;
  const newRecords = valid - duplicate;
  summary.replaceChildren();
  [
    ['Total records', total],
    ['Valid records', valid],
    ['Invalid records', invalid],
    ['Duplicate records', duplicate],
    ['New records', newRecords],
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
  animeImportRecords.slice(0, 200).forEach(record => {
    const row = body.insertRow();
    if (!record.valid) row.classList.add('anime-import-row-invalid');
    else if (record.duplicate) row.classList.add('anime-import-row-duplicate');
    [
      record.number,
      record.payload.title || '—',
      record.payload.slug || '—',
      record.payload.status || '—',
      !record.valid ? 'Invalid' : record.duplicate ? 'Duplicate — skip' : 'New',
    ].forEach(value => {
      const cell = row.insertCell();
      cell.textContent = String(value);
    });
  });
  if (animeImportRecords.length > 200) {
    const row = body.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 5;
    cell.textContent = `${animeImportRecords.length - 200} additional records are not shown in this table.`;
  }

  errors.replaceChildren();
  animeImportRecords.forEach(record => {
    record.errors.forEach(error => {
      const item = document.createElement('li');
      item.textContent = `Record ${record.number} — ${error.field}: ${error.message}`;
      errors.appendChild(item);
    });
  });
  errorPanel.hidden = errors.childElementCount === 0;
  preview.hidden = false;
  const importButton = document.getElementById('importAnimeRecordsButton');
  if (importButton) importButton.disabled = !includeDuplicates || newRecords === 0;
}

async function importAnimeRecords() {
  if (animeImportRunning || animeImportCompleted) return;
  animeImportRunning = true;
  updateAnimeImportControls(true);
  const message = document.getElementById('animeImportMessage');
  try {
    const user = auth?.currentUser;
    if (!db || !isConfigured || !user || !await verifyAdminStatus(user)) {
      showAnimeImportMessage(message, 'Admin permission and a configured Firebase connection are required to import records.', 'error');
      return;
    }
    const freshExistingSlugs = await findExistingAnimeSlugs(
      [...new Set(animeImportRecords.filter(record => record.valid && !record.duplicate).map(record => record.payload.slug))]
    );
    animeImportRecords = markAnimeImportDuplicates(animeImportRecords, freshExistingSlugs);
    renderAnimeImportPreview(true);
    const recordsToImport = animeImportRecords.filter(record => record.valid && !record.duplicate);
    if (!recordsToImport.length) {
      showAnimeImportMessage(message, 'There are no new valid records to import.', 'info');
      return;
    }
    animeImportCompleted = true;
    await commitAnimeImportRecords(recordsToImport);
  } catch (error) {
    handleFirestoreError(error, 'bulk-import', 'anime');
    showAnimeImportMessage(message, `Import could not be completed: ${error?.message || String(error)}`, 'error');
  } finally {
    animeImportRunning = false;
    updateAnimeImportControls(false);
  }
}

async function commitAnimeImportRecords(records) {
  const resultPanel = document.getElementById('animeImportResults');
  const resultSummary = document.getElementById('animeImportResultSummary');
  const failures = document.getElementById('animeImportFailures');
  const message = document.getElementById('animeImportMessage');
  if (resultPanel) resultPanel.hidden = false;
  const result = await commitAnimeImportBatches(records, async chunk => {
    const batch = writeBatch(db);
    chunk.forEach(record => {
      const reference = doc(collection(db, 'anime'));
      const timestamp = serverTimestamp();
      batch.set(reference, {
        ...record.payload,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    });
    await batch.commit();
  }, ANIME_IMPORT_BATCH_SIZE);
  const failedRecords = result.failures.flatMap(({ records: failedBatch, error }) => {
    handleFirestoreError(error, 'bulk-import', 'anime');
    const reason = describeAnimeImportError(error);
    return failedBatch.map(record => ({ record, reason }));
  });
  const imported = result.imported;
  if (resultSummary) {
    resultSummary.textContent = `Imported ${imported} of ${records.length} valid new records. Failed writes: ${failedRecords.length}.`;
  }

  if (failures) {
    failures.replaceChildren();
    failedRecords.forEach(({ record, reason }) => {
      const item = document.createElement('li');
      item.textContent = `Record ${record.number} (${record.payload.title}): ${reason}`;
      failures.appendChild(item);
    });
  }
  if (imported > 0) await loadAnimeEntries();
  showAnimeImportMessage(
    message,
    failedRecords.length
      ? `Import finished with ${imported} successful write(s) and ${failedRecords.length} failed write(s).`
      : `Successfully imported ${imported} anime record(s).`,
    failedRecords.length ? 'error' : 'success'
  );
}

function describeAnimeImportError(error) {
  if (error?.code === 'permission-denied' || /missing or insufficient permissions/i.test(error?.message || '')) {
    return 'Permission denied by Firestore. Confirm administrator access and the existing Firestore rules.';
  }
  if (error?.code === 'unavailable' || /offline|network/i.test(error?.message || '')) {
    return `Network unavailable: ${error?.message || 'check the connection and retry.'}`;
  }
  return error?.message || 'Firestore rejected this batch.';
}

function updateAnimeImportControls(disabled) {
  [
    'closeAnimeImportButton',
    'browseAnimeImportButton',
    'validateAnimeImportButton',
    'previewAnimeImportButton',
    'importAnimeRecordsButton',
    'animeImportFile',
    'animeImportJson',
  ].forEach(id => {
    const control = document.getElementById(id);
    if (control) control.disabled = disabled;
  });
  const importButton = document.getElementById('importAnimeRecordsButton');
  if (importButton && !disabled) {
    importButton.disabled = animeImportCompleted ||
      !animeImportRecords.some(record => record.valid && !record.duplicate);
  }
}

function showAnimeImportMessage(element, text, type) {
  if (!element) return;
  element.className = `form-feedback ${type}`;
  element.textContent = text;
  element.hidden = false;
}

function formatAnimeImportFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function renderAnimeRows(entries, emptyMessage = 'No anime entries yet. Add one using the form.') {
  const tbody = document.getElementById('animeAdminTableBody');
  if (!tbody) return;
  const search = (document.getElementById('animeSearchInput')?.value || '').trim().toLowerCase();
  const visibility = document.getElementById('animeVisibilityFilter')?.value || 'all';
  const filtered = entries.filter(anime => {
    const matchesSearch = !search || [anime.title, anime.slug].some(value => String(value || '').toLowerCase().includes(search));
    return matchesSearch && (visibility === 'all' || (anime.visibility || 'draft') === visibility);
  });
  const createRow = anime => {
    const row = document.createElement('tr');
    const titleCell = row.insertCell();
    titleCell.textContent = anime.title || 'Untitled anime';
    const slugCell = row.insertCell();
    slugCell.textContent = anime.slug || '';
    const visibilityCell = row.insertCell();
    visibilityCell.textContent = anime.visibility || 'draft';
    const releaseCell = row.insertCell();
    releaseCell.textContent = anime.calendarEnabled && anime.episodeReleaseDate
      ? `${anime.episodeReleaseDate} — ${anime.episodeReleaseStatus || 'Scheduled'}`
      : anime.releaseDay && anime.releaseTime
        ? `Weekly: ${anime.releaseDay} ${anime.releaseTime}${anime.timezone ? ` (${anime.timezone})` : ''}`
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
    return row;
  };
  if (animeTableSelection) animeTableSelection.render(filtered, createRow, 5, emptyMessage);
  else tbody.replaceChildren(...filtered.map(createRow));
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
  const calendarEnabled = document.getElementById('animeCalendarEnabled').checked;
  const episodeTimezone = valueOf('animeEpisodeTimezone').trim() || 'Asia/Kolkata';
  const episodeSchedule = {
    episodeReleaseDate: valueOf('animeEpisodeReleaseDate'),
    episodeReleaseTime: valueOf('animeEpisodeReleaseTime'),
    episodeTimezone,
    episodeReleaseStatus: valueOf('animeEpisodeReleaseStatus') || 'Scheduled',
  };
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
  if (calendarEnabled) {
    if (!isValidReleaseSchedule(episodeSchedule)) {
      showFeedback(feedback, 'Enter a valid episode release date, time, timezone, and schedule status.', 'error');
      return;
    }
    if (valueOf('animeEpisodeNumber').trim().length > 40 ||
        valueOf('animeEpisodeTitle').trim().length > 200 ||
        valueOf('animeEpisodeScheduleNotes').trim().length > 1000) {
      showFeedback(feedback, 'Episode number, title, or schedule notes exceed their allowed length.', 'error');
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
      seoTitle: valueOf('animeSeoTitle').trim(),
      seoDescription: valueOf('animeSeoDescription').trim(),
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
      calendarEnabled,
      ...episodeSchedule,
      episodeNumber: valueOf('animeEpisodeNumber').trim(),
      episodeTitle: valueOf('animeEpisodeTitle').trim(),
      episodeScheduleNotes: valueOf('animeEpisodeScheduleNotes').trim(),
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

async function saveAnimeBulkRecord(anime, draft) {
  const user = auth?.currentUser;
  if (!db || !isConfigured || !user || !await verifyAdminStatus(user)) {
    throw new Error('Admin permission and a configured Firebase connection are required.');
  }

  const title = draft.title.trim();
  const slug = normalizeAnimeSlug(draft.slug.trim() || title);
  if (!title || title.length > 200 || !slug) {
    throw new Error('Enter a title and a valid slug (maximum 200 characters).');
  }
  let matches;
  try {
    matches = await getDocs(query(collection(db, 'anime'), where('slug', '==', slug), limit(2)));
  } catch (error) {
    handleFirestoreError(error, 'check-slug', 'anime');
    throw error;
  }
  if (matches.docs.some(document => document.id !== anime.id)) {
    throw new Error(`The slug "${slug}" is already used by another anime record.`);
  }
  if (Boolean(draft.releaseDay) !== Boolean(draft.releaseTime)) {
    throw new Error('Enter both a release day and time, or leave both blank.');
  }
  if (draft.timezone) {
    try {
      new Intl.DateTimeFormat('en', { timeZone: draft.timezone.trim() });
    } catch {
      throw new Error('Enter a valid IANA timezone, such as Asia/Kolkata.');
    }
  }

  const payload = {
    title,
    slug,
    alternativeTitles: parseList(draft.alternativeTitles),
    synopsis: draft.synopsis.trim(),
    seoTitle: draft.seoTitle.trim(),
    seoDescription: draft.seoDescription.trim(),
    coverImage: normalizeImageUrl(draft.coverImage),
    bannerImage: normalizeImageUrl(draft.bannerImage),
    genres: parseList(draft.genres),
    type: draft.type.trim(),
    status: draft.status,
    releaseYear: numberFromDraft(draft.releaseYear),
    studio: draft.studio.trim(),
    episodes: numberFromDraft(draft.episodes),
    season: draft.season.trim(),
    source: draft.source.trim(),
    rating: numberFromDraft(draft.rating),
    characters: parseList(draft.characters),
    tags: parseList(draft.tags),
    releaseDay: draft.releaseDay,
    releaseTime: draft.releaseTime,
    timezone: draft.timezone.trim(),
    nextEpisode: numberFromDraft(draft.nextEpisode),
    visibility: draft.visibility,
    updatedAt: serverTimestamp(),
  };
  try {
    await updateDoc(doc(db, 'anime', anime.id), payload);
  } catch (error) {
    handleFirestoreError(error, 'update', `anime/${anime.id}`);
    throw error;
  }
  return payload;
}

function numberFromDraft(value) {
  if (value.trim() === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error('Enter a valid number.');
  return number;
}

function populateAnimeForm(anime) {
  document.getElementById('animeFormHeading').textContent = 'Edit Anime';
  document.getElementById('animeDocumentId').value = anime.id;
  ANIME_FIELDS.forEach(field => {
    const element = document.getElementById(`anime${field}`);
    if (!element) return;
    const key = field[0].toLowerCase() + field.slice(1);
    const value = anime[key];
    if (element.type === 'checkbox') element.checked = Boolean(value);
    else element.value = Array.isArray(value) ? value.join(', ') : value ?? '';
  });
  const scheduleFields = document.getElementById('animeReleaseCalendarFields');
  if (scheduleFields) scheduleFields.hidden = !anime.calendarEnabled;
  const episodeTimezone = document.getElementById('animeEpisodeTimezone');
  if (episodeTimezone && !episodeTimezone.value) episodeTimezone.value = anime.episodeTimezone || anime.timezone || 'Asia/Kolkata';
  const episodeStatus = document.getElementById('animeEpisodeReleaseStatus');
  if (episodeStatus && !episodeStatus.value) episodeStatus.value = 'Scheduled';
  animeImageFields.forEach(field => field.refresh());
  document.getElementById('cancelAnimeEditButton').hidden = false;
  slugManuallyEdited = false;
  document.getElementById('animeFormHeading').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteAnimeEntry(anime) {
  if (!db || !window.confirm(`Delete "${anime.title}" from the anime list?`)) return;
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
  animeImageFields.forEach(field => field.refresh());
  document.getElementById('animeDocumentId').value = '';
  document.getElementById('animeEpisodeTimezone').value = 'Asia/Kolkata';
  document.getElementById('animeEpisodeReleaseStatus').value = 'Scheduled';
  document.getElementById('animeReleaseCalendarFields').hidden = true;
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
