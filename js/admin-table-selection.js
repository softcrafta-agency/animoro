import {
  collection,
  deleteDoc,
  doc,
  documentId,
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth } from './auth-init.js';
import { verifyAdminStatus } from './auth.js';
import { db, handleFirestoreError, isConfigured } from './firebase-init.js';
import { commitAdminDeleteBatches } from './admin-table-core.js';

const PAGE_SIZE = 25;
const DELETE_BATCH_SIZE = 400;
const LOOKUP_BATCH_SIZE = 30;
let pendingDelete = null;
let deleteRunning = false;
let deleteModalBound = false;
let deleteFinished = false;

export function createAdminTableSelection({
  collectionName,
  tbodyId,
  selectAllId,
  selectedCountId,
  bulkDeleteButtonId,
  paginationId,
  onBulkDelete,
  onSelectionChange,
}) {
  const tbody = document.getElementById(tbodyId);
  const selectAll = document.getElementById(selectAllId);
  const countLabel = document.getElementById(selectedCountId);
  const bulkButton = document.getElementById(bulkDeleteButtonId);
  const pagination = document.getElementById(paginationId);
  if (!tbody || !selectAll || !countLabel || !bulkButton || !pagination) return null;

  const selectedIds = new Set();
  let visibleIds = [];
  let page = 1;
  let filteredRecords = [];

  selectAll.addEventListener('change', () => {
    visibleIds.forEach(id => {
      if (selectAll.checked) selectedIds.add(id);
      else selectedIds.delete(id);
    });
    updateSelectionControls();
    tbody.querySelectorAll('[data-record-select]').forEach(input => {
      input.checked = selectAll.checked;
    });
  });

  tbody.addEventListener('change', event => {
    const checkbox = event.target.closest('[data-record-select]');
    if (!checkbox) return;
    const id = checkbox.dataset.recordSelect;
    if (checkbox.checked) selectedIds.add(id);
    else selectedIds.delete(id);
    updateSelectionControls();
  });

  bulkButton.addEventListener('click', () => {
    if (!selectedIds.size || deleteRunning) return;
    onBulkDelete?.([...selectedIds]);
  });

  function render(records, createRow, colSpan, emptyMessage) {
    filteredRecords = records;
    const pageCount = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
    page = Math.min(page, pageCount);
    const start = (page - 1) * PAGE_SIZE;
    const currentRecords = records.slice(start, start + PAGE_SIZE);
    visibleIds = currentRecords.map(record => record.id);
    tbody.replaceChildren();

    if (!currentRecords.length) {
      const row = tbody.insertRow();
      const cell = row.insertCell();
      cell.colSpan = colSpan + 1;
      cell.textContent = emptyMessage;
    } else {
      currentRecords.forEach(record => {
        const row = createRow(record);
        row.dataset.recordId = record.id;
        const selectionCell = row.insertCell(0);
        selectionCell.className = 'admin-row-select-cell';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.dataset.recordSelect = record.id;
        checkbox.checked = selectedIds.has(record.id);
        checkbox.setAttribute('aria-label', `Select ${record.title || record.name || record.slug || 'record'}`);
        selectionCell.appendChild(checkbox);
        tbody.appendChild(row);
      });
    }

    const previous = pagination.querySelector('[data-page-previous]');
    const next = pagination.querySelector('[data-page-next]');
    const pageStatus = pagination.querySelector('[data-page-status]');
    if (previous) previous.disabled = page <= 1;
    if (next) next.disabled = page >= pageCount;
    if (pageStatus) {
      pageStatus.textContent = records.length
        ? `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, records.length)} of ${records.length}`
        : 'No records';
    }
    updateSelectionControls();
    return currentRecords;
  }

  pagination.querySelector('[data-page-previous]')?.addEventListener('click', () => {
    page = Math.max(1, page - 1);
    rerender();
  });
  pagination.querySelector('[data-page-next]')?.addEventListener('click', () => {
    const pageCount = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE));
    page = Math.min(pageCount, page + 1);
    rerender();
  });

  let currentRenderer = null;
  let currentColSpan = 0;
  let currentEmptyMessage = '';
  function rerender() {
    if (currentRenderer) render(filteredRecords, currentRenderer, currentColSpan, currentEmptyMessage);
  }
  function updateSelectionControls() {
    countLabel.textContent = `${selectedIds.size} selected`;
    bulkButton.disabled = selectedIds.size === 0 || deleteRunning;
    const selectedVisible = visibleIds.filter(id => selectedIds.has(id)).length;
    selectAll.checked = visibleIds.length > 0 && selectedVisible === visibleIds.length;
    selectAll.indeterminate = selectedVisible > 0 && selectedVisible < visibleIds.length;
    onSelectionChange?.([...selectedIds]);
  }

  return {
    collectionName,
    render(records, createRow, colSpan, emptyMessage) {
      currentRenderer = createRow;
      currentColSpan = colSpan;
      currentEmptyMessage = emptyMessage;
      render(records, createRow, colSpan, emptyMessage);
    },
    resetPage() {
      page = 1;
    },
    getSelectedIds() {
      return [...selectedIds];
    },
    clearSelection() {
      selectedIds.clear();
      updateSelectionControls();
      rerender();
    },
    removeSelectedIds(ids) {
      ids.forEach(id => selectedIds.delete(id));
      updateSelectionControls();
      rerender();
    },
    updateSelectionControls,
  };
}

export function openBulkDeleteConfirmation({ collectionName, ids, label, onComplete }) {
  if (!ids.length || deleteRunning) return;
  bindDeleteModal();
  const modal = document.getElementById('adminBulkDeleteModal');
  const count = document.getElementById('adminBulkDeleteCount');
  const confirmButton = document.getElementById('confirmAdminBulkDelete');
  const progress = document.getElementById('adminBulkDeleteProgress');
  const summary = document.getElementById('adminBulkDeleteSummary');
  const failures = document.getElementById('adminBulkDeleteFailures');
  if (!modal || !count || !confirmButton) return;

  pendingDelete = { collectionName, ids: [...new Set(ids)], label, onComplete };
  deleteFinished = false;
  count.textContent = `${pendingDelete.ids.length} ${label} selected for permanent deletion.`;
  if (progress) progress.textContent = '';
  if (summary) summary.textContent = '';
  failures?.replaceChildren();
  confirmButton.disabled = false;
  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add('show'));
}

function bindDeleteModal() {
  if (deleteModalBound) return;
  deleteModalBound = true;
  const modal = document.getElementById('adminBulkDeleteModal');
  const close = () => {
    if (deleteRunning || !modal) return;
    modal.classList.remove('show');
    window.setTimeout(() => {
      if (!modal.classList.contains('show')) modal.hidden = true;
    }, 250);
    pendingDelete = null;
    const confirmButton = document.getElementById('confirmAdminBulkDelete');
    if (confirmButton) confirmButton.textContent = 'Delete selected';
    deleteFinished = false;
  };
  document.getElementById('cancelAdminBulkDelete')?.addEventListener('click', close);
  modal?.addEventListener('click', event => {
    if (event.target === modal) close();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && modal && !modal.hidden) close();
  });
  document.getElementById('confirmAdminBulkDelete')?.addEventListener('click', executeBulkDelete);
}

async function executeBulkDelete() {
  if (deleteFinished) {
    closeDeleteModalAfterCompletion();
    return;
  }
  if (deleteRunning || !pendingDelete) return;
  const user = auth?.currentUser;
  const { collectionName, ids, label, onComplete } = pendingDelete;
  const confirmButton = document.getElementById('confirmAdminBulkDelete');
  const cancelButton = document.getElementById('cancelAdminBulkDelete');
  const progress = document.getElementById('adminBulkDeleteProgress');
  const summary = document.getElementById('adminBulkDeleteSummary');
  const failuresList = document.getElementById('adminBulkDeleteFailures');
  deleteRunning = true;
  if (confirmButton) confirmButton.disabled = true;
  if (cancelButton) cancelButton.disabled = true;

  try {
    if (!db || !isConfigured || !user || !await verifyAdminStatus(user)) {
      throw new Error('Admin permission and an active Firebase connection are required to delete records.');
    }
    if (progress) progress.textContent = `Checking ${ids.length} selected ${label}…`;
    const existingIds = await findExistingIds(collectionName, ids);
    const missingCount = ids.length - existingIds.length;
    const deletionResult = await commitAdminDeleteBatches(existingIds, async chunk => {
      const batch = writeBatch(db);
      chunk.forEach(id => batch.delete(doc(db, collectionName, id)));
      await batch.commit();
    }, DELETE_BATCH_SIZE, (processed, total) => {
      if (progress) progress.textContent = `Processed ${processed} of ${total} existing ${label}…`;
    });
    const failed = deletionResult.failedBatches.flatMap(({ ids: batchIds, error }) => {
      handleFirestoreError(error, 'bulk-delete', collectionName);
      return batchIds.map(id => ({ id, message: describeDeleteError(error) }));
    });
    const deletedCount = deletionResult.deletedCount;
    await onComplete?.({ deletedCount, missingCount, failed });
    if (progress) progress.textContent = 'Deletion complete.';
    if (summary) {
      summary.textContent = `Deleted: ${deletedCount} · Already missing: ${missingCount} · Failed: ${failed.length}`;
    }
    if (failuresList) {
      failuresList.replaceChildren();
      failed.slice(0, 100).forEach(({ id, message }) => {
        const item = document.createElement('li');
        item.textContent = `${id}: ${message}`;
        failuresList.appendChild(item);
      });
      if (failed.length > 100) {
        const item = document.createElement('li');
        item.textContent = `${failed.length - 100} additional failures not shown.`;
        failuresList.appendChild(item);
      }
    }
    if (progress) progress.textContent = failed.length
      ? `Finished with ${deletedCount} deleted, ${missingCount} missing, and ${failed.length} failed.`
      : `Successfully processed ${deletedCount} selected ${label}${missingCount ? `; ${missingCount} were already missing` : ''}.`;
  } catch (error) {
    if (error?.code) handleFirestoreError(error, 'bulk-delete', collectionName);
    if (progress) progress.textContent = `Bulk delete failed: ${error?.message || String(error)}`;
  } finally {
    deleteRunning = false;
    deleteFinished = true;
    if (cancelButton) cancelButton.disabled = false;
    if (confirmButton) {
      confirmButton.textContent = 'Done';
      confirmButton.disabled = false;
    }
  }
}

function closeDeleteModalAfterCompletion() {
  const modal = document.getElementById('adminBulkDeleteModal');
  const confirmButton = document.getElementById('confirmAdminBulkDelete');
  if (modal) {
    modal.classList.remove('show');
    window.setTimeout(() => {
      if (!modal.classList.contains('show')) modal.hidden = true;
    }, 250);
  }
  if (confirmButton) {
    confirmButton.textContent = 'Delete selected';
  }
  pendingDelete = null;
  deleteFinished = false;
}

async function findExistingIds(collectionName, ids) {
  const existingIds = [];
  for (let offset = 0; offset < ids.length; offset += LOOKUP_BATCH_SIZE) {
    const chunk = ids.slice(offset, offset + LOOKUP_BATCH_SIZE);
    const snapshot = await getDocs(query(
      collection(db, collectionName),
      where(documentId(), 'in', chunk),
    ));
    snapshot.docs.forEach(document => existingIds.push(document.id));
  }
  return existingIds;
}

function describeDeleteError(error) {
  if (error?.code === 'permission-denied' || /missing or insufficient permissions/i.test(error?.message || '')) {
    return 'Permission denied by Firestore. Confirm administrator access and deployed rules.';
  }
  if (error?.code === 'unavailable' || /offline|network/i.test(error?.message || '')) {
    return 'Network unavailable; retry after reconnecting.';
  }
  return error?.message || 'Firestore rejected the delete batch.';
}
