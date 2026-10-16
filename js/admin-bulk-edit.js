let bulkEditBound = false;
let activeEdit = null;
let saveRunning = false;

export function setupAdminBulkEdit({
  title,
  fields,
  saveRecord,
  onComplete,
}) {
  bindModal();
  return records => {
    if (saveRunning || !records.length) return;
    openEditor({ title, fields, records, saveRecord, onComplete });
  };
}

function bindModal() {
  if (bulkEditBound) return;
  const modal = document.getElementById('adminBulkEditModal');
  if (!modal) return;
  bulkEditBound = true;

  document.getElementById('closeAdminBulkEdit')?.addEventListener('click', closeEditor);
  document.getElementById('cancelAdminBulkEdit')?.addEventListener('click', closeEditor);
  document.getElementById('previousAdminBulkEdit')?.addEventListener('click', () => navigate(-1));
  document.getElementById('nextAdminBulkEdit')?.addEventListener('click', () => navigate(1));
  document.getElementById('saveAdminBulkEdit')?.addEventListener('click', saveEditedRecords);
  modal.addEventListener('click', event => {
    if (event.target === modal) closeEditor();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !modal.hidden) closeEditor();
  });
  document.getElementById('adminBulkEditForm')?.addEventListener('input', captureCurrentDraft);
  document.getElementById('adminBulkEditForm')?.addEventListener('change', captureCurrentDraft);
}

function openEditor(config) {
  const modal = document.getElementById('adminBulkEditModal');
  if (!modal) return;
  activeEdit = {
    ...config,
    index: 0,
    drafts: config.records.map(record => createDraft(config.fields, record)),
    originals: config.records.map(record => createDraft(config.fields, record)),
    failures: [],
  };
  document.getElementById('adminBulkEditTitle').textContent = config.title;
  const summary = document.getElementById('adminBulkEditSummary');
  if (summary) summary.textContent = '';
  document.getElementById('adminBulkEditFailures')?.replaceChildren();
  renderCurrentRecord();
  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add('show'));
}

function createDraft(fields, record) {
  return Object.fromEntries(fields.map(field => [
    field.key,
    record[field.key] == null && field.defaultValue !== undefined
      ? field.defaultValue
      : readFieldValue(record[field.key], field),
  ]));
}

function readFieldValue(value, field) {
  if (field.type === 'checkbox') return Boolean(value);
  if (Array.isArray(value)) return value.join(', ');
  return value == null ? '' : String(value);
}

function captureCurrentDraft() {
  if (!activeEdit || saveRunning) return;
  const form = document.getElementById('adminBulkEditForm');
  activeEdit.fields.forEach(field => {
    const control = form.elements.namedItem(field.key);
    if (!control) return;
    activeEdit.drafts[activeEdit.index][field.key] = field.type === 'checkbox'
      ? control.checked
      : control.value;
  });
  updateEditorControls();
}

function renderCurrentRecord() {
  if (!activeEdit) return;
  const { records, fields, drafts, index } = activeEdit;
  const record = records[index];
  const form = document.getElementById('adminBulkEditForm');
  const fieldContainer = document.getElementById('adminBulkEditFields');
  if (!form || !fieldContainer) return;

  fieldContainer.replaceChildren();
  fields.forEach(field => {
    const group = document.createElement('div');
    group.className = 'form-group';
    const label = document.createElement('label');
    label.className = 'form-label';
    label.htmlFor = `adminBulkEditField-${field.key}`;
    label.textContent = field.label;
    const control = field.type === 'textarea' || field.type === 'html'
      ? document.createElement('textarea')
      : field.type === 'select'
        ? document.createElement('select')
        : document.createElement('input');

    control.id = `adminBulkEditField-${field.key}`;
    control.name = field.key;
    control.className = field.type === 'textarea' || field.type === 'html'
      ? 'form-textarea'
      : field.type === 'select' ? 'form-select' : 'form-input';
    if (field.type !== 'textarea' && field.type !== 'html' && field.type !== 'select') {
      control.type = field.type === 'checkbox' ? 'checkbox' : field.type || 'text';
    }
    if (field.type === 'select') {
      field.options.forEach(optionData => {
        const option = document.createElement('option');
        option.value = optionData.value;
        option.textContent = optionData.label;
        control.appendChild(option);
      });
      if (!field.options.some(option => option.value === drafts[index][field.key])) {
        const currentOption = document.createElement('option');
        currentOption.value = drafts[index][field.key];
        currentOption.textContent = drafts[index][field.key] || 'Not specified';
        control.appendChild(currentOption);
      }
    }
    if (field.required) control.required = true;
    if (field.maxLength) control.maxLength = field.maxLength;
    if (field.min !== undefined) control.min = field.min;
    if (field.max !== undefined) control.max = field.max;
    if (field.step !== undefined) control.step = field.step;
    if (field.placeholder) control.placeholder = field.placeholder;
    if (field.rows) control.rows = field.rows;
    if (field.type === 'checkbox') {
      control.checked = drafts[index][field.key];
      label.append(control, document.createTextNode(` ${field.label}`));
      group.appendChild(label);
    } else {
      control.value = drafts[index][field.key];
      group.append(label, control);
    }
    if (field.hint) {
      const hint = document.createElement('small');
      hint.className = 'admin-selection-hint';
      hint.textContent = field.hint;
      group.appendChild(hint);
    }
    fieldContainer.appendChild(group);
  });

  const label = document.getElementById('adminBulkEditRecordLabel');
  if (label) label.textContent = `${record.title || record.name || record.slug || 'Untitled'} — ${index + 1} of ${records.length}`;
  updateEditorControls();
}

function navigate(offset) {
  if (!activeEdit || saveRunning) return;
  captureCurrentDraft();
  const nextIndex = activeEdit.index + offset;
  if (nextIndex < 0 || nextIndex >= activeEdit.records.length) return;
  activeEdit.index = nextIndex;
  renderCurrentRecord();
}

function isDirty(index) {
  return activeEdit.fields.some(field =>
    activeEdit.drafts[index][field.key] !== activeEdit.originals[index][field.key]
  );
}

function updateEditorControls() {
  if (!activeEdit) return;
  const { index, records } = activeEdit;
  const previous = document.getElementById('previousAdminBulkEdit');
  const next = document.getElementById('nextAdminBulkEdit');
  const save = document.getElementById('saveAdminBulkEdit');
  const counter = document.getElementById('adminBulkEditDirtyCount');
  if (previous) previous.disabled = saveRunning || index === 0;
  if (next) next.disabled = saveRunning || index === records.length - 1;
  if (save) save.disabled = saveRunning || !records.some((_, recordIndex) => isDirty(recordIndex));
  if (counter) {
    const dirtyCount = records.filter((_, recordIndex) => isDirty(recordIndex)).length;
    counter.textContent = `${dirtyCount} record${dirtyCount === 1 ? '' : 's'} with unsaved changes`;
  }
  const cancel = document.getElementById('cancelAdminBulkEdit');
  const close = document.getElementById('closeAdminBulkEdit');
  document.getElementById('adminBulkEditFields')?.querySelectorAll('input, textarea, select')
    .forEach(control => { control.disabled = saveRunning; });
  if (cancel) cancel.disabled = saveRunning;
  if (close) close.disabled = saveRunning;
}

async function saveEditedRecords() {
  if (!activeEdit || saveRunning) return;
  captureCurrentDraft();
  const dirtyIndices = activeEdit.records
    .map((_, index) => index)
    .filter(index => isDirty(index));
  if (!dirtyIndices.length) return;

  const form = document.getElementById('adminBulkEditForm');
  for (const index of dirtyIndices) {
    activeEdit.index = index;
    renderCurrentRecord();
    if (!form.reportValidity()) return;
  }

  saveRunning = true;
  updateEditorControls();
  const progress = document.getElementById('adminBulkEditProgress');
  const summary = document.getElementById('adminBulkEditSummary');
  const failuresList = document.getElementById('adminBulkEditFailures');
  const updatedIds = [];
  const failures = [];
  failuresList?.replaceChildren();
  try {
    for (let position = 0; position < dirtyIndices.length; position += 1) {
      const index = dirtyIndices[position];
      const record = activeEdit.records[index];
      if (progress) progress.textContent = `Saving record ${position + 1} of ${dirtyIndices.length}: ${record.title || record.slug || record.id}`;
      try {
        const savedFields = await activeEdit.saveRecord(record, { ...activeEdit.drafts[index] });
        if (savedFields && typeof savedFields === 'object') Object.assign(record, savedFields);
        activeEdit.drafts[index] = createDraft(activeEdit.fields, record);
        activeEdit.originals[index] = { ...activeEdit.drafts[index] };
        updatedIds.push(record.id);
      } catch (error) {
        failures.push({ id: record.id, title: record.title || record.slug || record.id, message: error.message || String(error) });
      }
    }
    let refreshError = null;
    if (updatedIds.length) {
      try {
        await activeEdit.onComplete?.(updatedIds);
      } catch (error) {
        refreshError = error;
      }
    }
    activeEdit.failures = failures;
    if (summary) {
      const unchanged = activeEdit.records.length - dirtyIndices.length;
      summary.textContent = `Updated ${updatedIds.length}; failed ${failures.length}; unchanged ${unchanged}.${refreshError ? ' The list could not be refreshed.' : ''}`;
    }
    failures.forEach(failure => {
      const item = document.createElement('li');
      item.textContent = `${failure.title} (${failure.id}): ${failure.message}`;
      failuresList?.appendChild(item);
    });
    if (progress) progress.textContent = refreshError
      ? `Changes were saved, but the table could not be refreshed: ${refreshError.message || String(refreshError)}`
      : failures.length
        ? 'Some records could not be saved. Correct the affected records and retry.'
        : 'All changes were saved.';
  } catch (error) {
    if (progress) progress.textContent = `Could not complete bulk save: ${error.message || String(error)}`;
  } finally {
    saveRunning = false;
    renderCurrentRecord();
    updateEditorControls();
  }
}

function closeEditor() {
  if (!activeEdit || saveRunning) return;
  const hasUnsaved = activeEdit.records.some((_, index) => isDirty(index));
  if (hasUnsaved && !window.confirm('Discard unsaved bulk edits?')) return;
  const modal = document.getElementById('adminBulkEditModal');
  if (!modal) return;
  modal.classList.remove('show');
  window.setTimeout(() => {
    if (!modal.classList.contains('show')) modal.hidden = true;
  }, 250);
  activeEdit = null;
}
