import { 
  collection, 
  doc, 
  getDoc, 
  addDoc, 
  updateDoc, 
  serverTimestamp,
  deleteField,
  query,
  where,
  limit,
  getDocs
} from 'firebase/firestore';
import { db, isConfigured, handleFirestoreError } from './firebase-init.js';
import { requireAdminAuth, verifyAdminStatus } from './auth.js';
import { auth } from './auth-init.js';
import { uploadImageToR2 } from './r2-upload.js';
import { isValidArticleSlug, normalizeArticleSlug } from './article-url.js';
import { normalizeAnimeSlug } from './anime-url.js';
import { sanitizeArticleEditorHtml } from './article-content.js';

let currentAdminUser = null;
let editingPostId = null;
let originalPostSlug = '';
let originalPostStatus = 'draft';
let originalPublishedAt = null;
let originalCreatedAt = null;
let slugWasManuallyEdited = false;
let postTags = [];
let uploadedCoverUrl = '';
let currentUploadedCoverData = null;
let currentCoverMode = 'upload';
let existingCoverData = null;
let userRequestedCoverRemoval = false;
const MAX_COMPRESSED_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_ARTICLE_DOCUMENT_BYTES = 900 * 1024;
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const COVER_MAX_DIMENSION = 1600;
const ARTICLE_FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 36];
let lastEditorRange = null;
let editorDialogAction = null;
let editorAutosaveTimer = null;
let editorIsDirty = false;
let editorInitialSnapshot = '';
let editorSaveInProgress = false;

function getRichEditor() {
  return document.getElementById('richEditorArea');
}

function rememberEditorSelection() {
  const editor = getRichEditor();
  const selection = window.getSelection();
  if (!editor || !selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (editor.contains(range.commonAncestorContainer)) lastEditorRange = range.cloneRange();
}

function restoreEditorSelection() {
  const editor = getRichEditor();
  if (!editor) return null;
  editor.focus();
  const selection = window.getSelection();
  if (!selection) return null;
  selection.removeAllRanges();
  if (lastEditorRange && editor.contains(lastEditorRange.commonAncestorContainer)) {
    selection.addRange(lastEditorRange.cloneRange());
  } else {
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection.addRange(range);
  }
  rememberEditorSelection();
  return selection.rangeCount ? selection.getRangeAt(0) : null;
}

function escapeEditorHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function getEditorPlainText() {
  return getRichEditor()?.innerText || '';
}

function updateEditorStatistics() {
  const text = getEditorPlainText().trim();
  const words = text ? text.split(/\s+/u).length : 0;
  const characters = getEditorPlainText().length;
  document.getElementById('editorWordCount').textContent = String(words);
  document.getElementById('editorCharacterCount').textContent = String(characters);
  document.getElementById('editorReadingTime').textContent = `${words ? Math.max(1, Math.ceil(words / 200)) : 0} min`;
}

function setEditorSaveStatus(message, state = 'idle') {
  const status = document.getElementById('editorSaveStatus');
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state;
}

function getEditorSnapshot() {
  const values = Array.from(document.querySelectorAll('#postEditorForm input[id], #postEditorForm textarea[id], #postEditorForm select[id]'))
    .filter(field => field.type !== 'file')
    .map(field => [field.id, field.type === 'checkbox' ? field.checked : field.value]);
  return JSON.stringify({
    values,
    tags: postTags,
    content: getRichEditor()?.innerHTML || '',
  });
}

function getEditorAutosaveKey() {
  return `animoro_article_editor_${editingPostId || 'new'}`;
}

function saveEditorLocally() {
  if (!editorIsDirty) return;
  setEditorSaveStatus('Saving draft on this device…', 'saving');
  try {
    localStorage.setItem(getEditorAutosaveKey(), JSON.stringify({
      savedAt: Date.now(),
      values: Array.from(document.querySelectorAll('#postEditorForm input[id], #postEditorForm textarea[id], #postEditorForm select[id]'))
        .filter(field => field.type !== 'file')
        .map(field => [field.id, field.type === 'checkbox' ? field.checked : field.value]),
      tags: postTags,
      content: sanitizeArticleEditorHtml(getRichEditor()?.innerHTML || ''),
    }));
    const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date());
    setEditorSaveStatus(`Draft auto-saved locally at ${time}.`, 'saved');
  } catch (error) {
    console.error('Article editor local autosave failed:', error);
    setEditorSaveStatus('Autosave failed. Use Save as Draft to keep your changes.', 'error');
  }
}

function scheduleEditorAutosave() {
  clearTimeout(editorAutosaveTimer);
  editorAutosaveTimer = setTimeout(saveEditorLocally, 900);
}

function restoreEditorAutosave() {
  const key = getEditorAutosaveKey();
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (!saved || !Number.isFinite(saved.savedAt) || Date.now() - saved.savedAt > 7 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(key);
      return;
    }
    const differs = saved.content !== (getRichEditor()?.innerHTML || '') ||
      JSON.stringify(saved.values || []) !== JSON.stringify(JSON.parse(getEditorSnapshot()).values);
    if (!differs || !confirm('A newer locally auto-saved draft is available. Restore it?')) return;

    (saved.values || []).forEach(([id, value]) => {
      const field = document.getElementById(id);
      if (!field || field.type === 'file') return;
      if (field.type === 'checkbox') field.checked = Boolean(value);
      else field.value = value;
    });
    if (Array.isArray(saved.tags)) {
      postTags = saved.tags.filter(tag => typeof tag === 'string');
      renderTagChips();
    }
    getRichEditor().innerHTML = sanitizeArticleEditorHtml(saved.content || '');
    markEditorChanged();
    setEditorSaveStatus('Recovered a locally auto-saved draft.', 'saved');
  } catch (error) {
    console.error('Could not restore the local article draft:', error);
    setEditorSaveStatus('A local draft could not be restored.', 'error');
  }
}

function markEditorChanged() {
  editorIsDirty = getEditorSnapshot() !== editorInitialSnapshot;
  if (editorIsDirty) {
    scheduleEditorAutosave();
  } else {
    clearTimeout(editorAutosaveTimer);
    setEditorSaveStatus('All changes are saved.', 'saved');
  }
  updateEditorStatistics();
  if (document.getElementById('articlePreview')?.hidden === false) renderArticlePreview();
}

function getEditorBlock(range) {
  let node = range?.startContainer;
  if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;
  while (node && node !== getRichEditor()) {
    if (/^(P|DIV|H[1-6]|BLOCKQUOTE|LI|PRE)$/.test(node.tagName)) return node;
    node = node.parentElement;
  }
  return getRichEditor();
}

function convertLegacyFontMarkup(fontSize = null) {
  const editor = getRichEditor();
  editor?.querySelectorAll('font').forEach((font) => {
    const span = document.createElement('span');
    const color = font.getAttribute('color');
    const size = font.getAttribute('size');
    if (color && /^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(color)) span.style.color = color;
    if (size === '7' && fontSize) span.style.fontSize = fontSize;
    font.replaceWith(span);
    while (font.firstChild) span.appendChild(font.firstChild);
  });
}

function applyStyleToSelectedText(range, property, value) {
  const editor = getRichEditor();
  if (!range || range.collapsed) return false;
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) {
    if (range.intersectsNode(walker.currentNode)) textNodes.push(walker.currentNode);
  }

  const startContainer = range.startContainer;
  const endContainer = range.endContainer;
  const startOffset = range.startOffset;
  const endOffset = range.endOffset;
  const selectedNodes = [];
  textNodes.forEach((node) => {
    const start = startContainer === node ? startOffset : 0;
    const end = endContainer === node ? endOffset : node.length;
    if (start >= end) return;
    if (end < node.length) node.splitText(end);
    const selectedNode = start > 0 ? node.splitText(start) : node;
    const span = document.createElement('span');
    span.style[property] = value;
    selectedNode.parentNode.insertBefore(span, selectedNode);
    span.appendChild(selectedNode);
    selectedNodes.push(selectedNode);
  });

  if (!selectedNodes.length) return false;
  const selectionRange = document.createRange();
  selectionRange.setStart(selectedNodes[0], 0);
  selectionRange.setEnd(selectedNodes[selectedNodes.length - 1], selectedNodes[selectedNodes.length - 1].length);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(selectionRange);
  lastEditorRange = selectionRange.cloneRange();
  return true;
}

function applyEditorFontSize(size) {
  const range = restoreEditorSelection();
  if (!range) return;
  const block = getEditorBlock(range);
  if (range.collapsed) {
    if (size === 'reset') {
      block.style.removeProperty('font-size');
      let node = range.startContainer.nodeType === Node.TEXT_NODE
        ? range.startContainer.parentElement
        : range.startContainer;
      while (node && node !== block) {
        node.style?.removeProperty('font-size');
        if (node.getAttribute?.('style') === '') node.removeAttribute('style');
        node = node.parentElement;
      }
    }
    else block.style.fontSize = `${size}px`;
  } else {
    applyStyleToSelectedText(range, 'fontSize', size === 'reset' ? '1.1rem' : `${size}px`);
  }
  getRichEditor().dispatchEvent(new Event('input', { bubbles: true }));
  rememberEditorSelection();
  updateCurrentEditorFontSize();
}

function updateCurrentEditorFontSize() {
  const editor = getRichEditor();
  const sizeLabel = document.getElementById('editorCurrentFontSize');
  const sizeSelect = document.getElementById('editorFontSize');
  if (!editor || !sizeLabel) return;
  const selection = window.getSelection();
  if (!selection?.rangeCount || !editor.contains(selection.getRangeAt(0).commonAncestorContainer)) return;
  const range = selection.getRangeAt(0);
  const node = range.startContainer.nodeType === Node.TEXT_NODE
    ? range.startContainer.parentElement
    : range.startContainer;
  const pixels = Math.round(Number.parseFloat(getComputedStyle(node).fontSize) || 16);
  sizeLabel.textContent = `${pixels}px`;
  if (sizeSelect) {
    const option = Array.from(sizeSelect.options).find(item => item.value === String(pixels));
    sizeSelect.value = option ? String(pixels) : '';
  }
}

function validateEditorUrl(value, { image = false } = {}) {
  const candidate = String(value || '').trim();
  if (!candidate || candidate.startsWith('//')) return '';
  try {
    const url = new URL(candidate, window.location.origin);
    if (url.username || url.password) return '';
    const allowed = image ? ['http:', 'https:'] : ['http:', 'https:', 'mailto:'];
    return allowed.includes(url.protocol) ? candidate : '';
  } catch {
    return '';
  }
}

function openEditorDialog(title, fields, onSubmit) {
  const dialog = document.getElementById('editorInsertDialog');
  const form = document.getElementById('editorDialogForm');
  const fieldsContainer = document.getElementById('editorDialogFields');
  if (!dialog || !form || !fieldsContainer) return;
  document.getElementById('editorDialogTitle').textContent = title;
  fieldsContainer.replaceChildren();
  fields.forEach((field) => {
    const label = document.createElement('label');
    label.textContent = field.label;
    let input;
    if (field.type === 'textarea') {
      input = document.createElement('textarea');
    } else if (field.type === 'select') {
      input = document.createElement('select');
      field.options.forEach(({ value, label: optionLabel }) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = optionLabel;
        input.appendChild(option);
      });
    } else {
      input = document.createElement('input');
      input.type = field.type || 'text';
    }
    input.name = field.name;
    if (field.placeholder) input.placeholder = field.placeholder;
    if (field.required) input.required = true;
    if (field.min !== undefined) input.min = field.min;
    if (field.max !== undefined) input.max = field.max;
    if (field.value !== undefined) input.value = field.value;
    if (field.type === 'checkbox') {
      input.checked = Boolean(field.value);
      label.classList.add('editor-dialog-checkbox');
      label.prepend(input);
    } else {
      label.appendChild(input);
    }
    fieldsContainer.appendChild(label);
  });

  editorDialogAction = onSubmit;
  if (!dialog.open) dialog.showModal();
  fieldsContainer.querySelector('input, textarea, select')?.focus();
}

function setupEditorDialog() {
  const dialog = document.getElementById('editorInsertDialog');
  const form = document.getElementById('editorDialogForm');
  if (!dialog || !form) return;
  dialog.querySelectorAll('[data-dialog-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const values = Object.fromEntries(new FormData(form));
    const checkbox = form.querySelector('input[type="checkbox"]');
    if (checkbox) values[checkbox.name] = checkbox.checked;
    dialog.close();
    const action = editorDialogAction;
    editorDialogAction = null;
    action?.(values);
  });
  dialog.addEventListener('close', () => { editorDialogAction = null; });
}

function insertEditorHtml(html, { block = false } = {}) {
  const range = restoreEditorSelection();
  if (!range) return;
  const safeHtml = sanitizeArticleEditorHtml(html);
  if (block) {
    document.execCommand('insertHTML', false, safeHtml);
    rememberEditorSelection();
    getRichEditor().dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  range.deleteContents();
  const fragment = range.createContextualFragment(safeHtml);
  const lastNode = fragment.lastChild;
  range.insertNode(fragment);
  if (lastNode) {
    range.setStartAfter(lastNode);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }
  rememberEditorSelection();
  getRichEditor().dispatchEvent(new Event('input', { bubbles: true }));
}

function showLinkDialog() {
  const selection = restoreEditorSelection();
  const selectedText = selection?.toString() || '';
  openEditorDialog('Insert link', [
    { name: 'url', label: 'URL', type: 'url', placeholder: 'https://example.com/article', required: true },
    { name: 'text', label: 'Link text', value: selectedText, required: !selectedText },
    { name: 'newTab', label: 'Open in a new tab', type: 'checkbox', value: true },
  ], ({ url: rawUrl, text, newTab }) => {
    const url = validateEditorUrl(rawUrl);
    if (!url) {
      setEditorSaveStatus('That link URL is not allowed.', 'error');
      return;
    }
    const range = restoreEditorSelection();
    const anchorAttributes = `href="${escapeEditorHtml(url)}"${newTab ? ' target="_blank" rel="noopener noreferrer"' : ''}`;
    if (range && !range.collapsed) {
      document.execCommand('createLink', false, url);
      const current = window.getSelection();
      const anchor = current?.anchorNode?.parentElement?.closest('a');
      if (anchor) {
        anchor.setAttribute('href', url);
        if (newTab) {
          anchor.target = '_blank';
          anchor.rel = 'noopener noreferrer';
        } else {
          anchor.removeAttribute('target');
          anchor.removeAttribute('rel');
        }
      }
    } else {
      insertEditorHtml(`<a ${anchorAttributes}>${escapeEditorHtml(text)}</a>`);
    }
    markEditorChanged();
  });
}

function showImageUrlDialog() {
  openEditorDialog('Insert image', [
    { name: 'url', label: 'Image URL', type: 'url', placeholder: 'https://…', required: true },
    { name: 'alt', label: 'Alt text', placeholder: 'Describe the image for accessibility', required: true },
    { name: 'caption', label: 'Caption (optional)', placeholder: 'Image caption' },
  ], ({ url: rawUrl, alt, caption }) => {
    const url = validateEditorUrl(rawUrl, { image: true });
    if (!url) {
      setEditorSaveStatus('Use a valid HTTP or HTTPS image URL.', 'error');
      return;
    }
    const captionHtml = caption.trim() ? `<figcaption>${escapeEditorHtml(caption.trim())}</figcaption>` : '';
    insertEditorHtml(`<figure class="article-figure"><img src="${escapeEditorHtml(url)}" alt="${escapeEditorHtml(alt.trim())}" loading="lazy" decoding="async">${captionHtml}</figure><p><br></p>`, { block: true });
  });
}

function getYouTubeEmbedUrl(value) {
  try {
    const url = new URL(value);
    if (url.username || url.password) return '';
    let videoId = '';
    if (url.hostname === 'youtu.be') videoId = url.pathname.slice(1);
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(url.hostname)) {
      if (url.pathname === '/watch') videoId = url.searchParams.get('v') || '';
      else videoId = url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1] || '';
    }
    return /^[A-Za-z0-9_-]{6,20}$/.test(videoId)
      ? `https://www.youtube-nocookie.com/embed/${videoId}`
      : '';
  } catch {
    return '';
  }
}

function showVideoDialog() {
  openEditorDialog('Embed YouTube video', [
    { name: 'url', label: 'YouTube URL', type: 'url', placeholder: 'https://www.youtube.com/watch?v=…', required: true },
    { name: 'title', label: 'Accessible video title', placeholder: 'Video title', required: true },
  ], ({ url, title }) => {
    const src = getYouTubeEmbedUrl(url);
    if (!src) {
      setEditorSaveStatus('Enter a valid YouTube video URL.', 'error');
      return;
    }
    insertEditorHtml(`<iframe src="${src}" title="${escapeEditorHtml(title.trim())}" width="560" height="315" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe><p><br></p>`, { block: true });
  });
}

function showTableDialog() {
  openEditorDialog('Insert table', [
    { name: 'rows', label: 'Rows', type: 'number', value: 3, min: 1, max: 12, required: true },
    { name: 'columns', label: 'Columns', type: 'number', value: 3, min: 1, max: 8, required: true },
  ], ({ rows, columns }) => {
    const rowCount = Math.min(12, Math.max(1, Number(rows)));
    const columnCount = Math.min(8, Math.max(1, Number(columns)));
    const headers = Array.from({ length: columnCount }, (_, index) => `<th>Header ${index + 1}</th>`).join('');
    const body = Array.from({ length: rowCount - 1 }, () =>
      `<tr>${Array.from({ length: columnCount }, () => '<td>Cell</td>').join('')}</tr>`).join('');
    insertEditorHtml(`<table><thead><tr>${headers}</tr></thead><tbody>${body}</tbody></table><p><br></p>`, { block: true });
  });
}

function insertCodeBlock() {
  openEditorDialog('Insert code block', [
    { name: 'code', label: 'Code', type: 'textarea', placeholder: 'Paste or type code…', required: true },
  ], ({ code }) => {
    insertEditorHtml(`<pre class="article-code-block"><code>${escapeEditorHtml(code)}</code></pre><p><br></p>`, { block: true });
  });
}

function generateEditorToc() {
  const editor = getRichEditor();
  const headings = Array.from(editor.querySelectorAll('h2, h3'))
    .filter(heading => heading.textContent.trim());
  if (!headings.length) {
    setEditorSaveStatus('Add an H2 or H3 heading before generating a table of contents.', 'error');
    return;
  }
  const usedIds = new Set();
  const items = headings.map((heading) => {
    const baseId = heading.textContent.trim().toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'section';
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
    usedIds.add(id);
    heading.id = id;
    return `<li><a href="#${id}">${escapeEditorHtml(heading.textContent.trim())}</a></li>`;
  }).join('');
  insertEditorHtml(`<div class="article-toc"><p>In this article</p><ul>${items}</ul></div>`, { block: true });
}

function showFindReplaceDialog() {
  openEditorDialog('Find and replace', [
    { name: 'find', label: 'Find', required: true },
    { name: 'replace', label: 'Replace with' },
    { name: 'matchCase', label: 'Match case', type: 'checkbox' },
  ], ({ find, replace, matchCase }) => {
    const editor = getRichEditor();
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    let replacements = 0;
    nodes.forEach((node) => {
      const original = node.nodeValue;
      const expression = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), matchCase ? 'g' : 'gi');
      const updated = original.replace(expression, () => {
        replacements += 1;
        return replace;
      });
      if (updated !== original) node.nodeValue = updated;
    });
    if (replacements) {
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      setEditorSaveStatus(`Replaced ${replacements} occurrence${replacements === 1 ? '' : 's'}.`, 'saved');
    } else {
      setEditorSaveStatus('No matches found.', 'idle');
    }
  });
}

function renderArticlePreview() {
  const preview = document.getElementById('articlePreview');
  if (!preview) return;
  const title = document.getElementById('postTitle')?.value.trim() || 'Untitled article';
  const excerpt = document.getElementById('postExcerpt')?.value.trim() || '';
  preview.innerHTML = `<h1 class="article-preview-title">${escapeEditorHtml(title)}</h1>${excerpt ? `<p class="article-excerpt-lead">${escapeEditorHtml(excerpt)}</p>` : ''}${sanitizeArticleEditorHtml(getRichEditor()?.innerHTML || '')}`;
}

function setEditorMode(previewMode) {
  const editor = getRichEditor();
  const preview = document.getElementById('articlePreview');
  editor.hidden = previewMode;
  preview.hidden = !previewMode;
  document.getElementById('editorEditMode').classList.toggle('active', !previewMode);
  document.getElementById('editorPreviewMode').classList.toggle('active', previewMode);
  document.getElementById('editorEditMode').setAttribute('aria-selected', String(!previewMode));
  document.getElementById('editorPreviewMode').setAttribute('aria-selected', String(previewMode));
  if (previewMode) renderArticlePreview();
  else editor.focus();
}

function runEditorToolbarAction(action, button) {
  const editor = getRichEditor();
  if (!editor) return;
  const command = button?.dataset.cmd;
  const value = button?.dataset.val;

  if (action === 'font-step') {
    const range = restoreEditorSelection();
    let fontNode = range?.startContainer;
    if (fontNode?.nodeType === Node.TEXT_NODE) fontNode = fontNode.parentElement;
    const current = Math.round(Number.parseFloat(getComputedStyle(fontNode || editor).fontSize) || 16);
    const closestIndex = ARTICLE_FONT_SIZES.reduce((best, size, index) =>
      Math.abs(size - current) < Math.abs(ARTICLE_FONT_SIZES[best] - current) ? index : best, 0);
    const next = Math.max(0, Math.min(ARTICLE_FONT_SIZES.length - 1, closestIndex + Number(button.dataset.step)));
    applyEditorFontSize(ARTICLE_FONT_SIZES[next]);
  } else if (action === 'block') {
    restoreEditorSelection();
    document.execCommand('formatBlock', false, value);
  } else if (action === 'insert-link') showLinkDialog();
  else if (action === 'insert-image') showImageUrlDialog();
  else if (action === 'upload-image') openImageModalForEditor();
  else if (action === 'insert-video') showVideoDialog();
  else if (action === 'insert-table') showTableDialog();
  else if (action === 'code-block') insertCodeBlock();
  else if (action === 'toc') generateEditorToc();
  else if (action === 'find-replace') showFindReplaceDialog();
  else if (action === 'expand-editor') document.getElementById('editorWorkspace').classList.toggle('is-expanded');
  else if (action === 'distraction-free') {
    document.getElementById('editorWorkspace').classList.toggle('is-distraction-free');
    document.body.classList.toggle('editor-distraction-free');
  } else if (command) {
    restoreEditorSelection();
    document.execCommand(command, false, null);
    convertLegacyFontMarkup('36px');
  }

  editor.dispatchEvent(new Event('input', { bubbles: true }));
}

function setupRichEditor() {
  const editor = getRichEditor();
  const toolbar = document.querySelector('.editor-toolbar');
  if (!editor || !toolbar) return;

  toolbar.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button, input, select')) rememberEditorSelection();
    if (event.target.closest('button')) event.preventDefault();
  });
  toolbar.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action], button[data-cmd]');
    if (!button) return;
    event.preventDefault();
    runEditorToolbarAction(button.dataset.action, button);
  });

  const sizeSelect = document.getElementById('editorFontSize');
  sizeSelect.addEventListener('change', () => {
    if (sizeSelect.value) applyEditorFontSize(sizeSelect.value);
    sizeSelect.value = '';
  });
  toolbar.querySelectorAll('input[type="color"]').forEach((input) => {
    input.addEventListener('input', () => {
      const range = restoreEditorSelection();
      const block = getEditorBlock(range);
      const property = input.dataset.action === 'highlight' ? 'backgroundColor' : 'color';
      if (range?.collapsed) {
        block.style[property] = input.value;
        let node = range.startContainer.nodeType === Node.TEXT_NODE
          ? range.startContainer.parentElement
          : range.startContainer;
        while (node && node !== block) {
          node.style?.removeProperty(property === 'backgroundColor' ? 'background-color' : 'color');
          if (node.getAttribute?.('style') === '') node.removeAttribute('style');
          node = node.parentElement;
        }
      }
        else applyStyleToSelectedText(range, property, input.value);
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });

  editor.addEventListener('input', () => {
    markEditorChanged();
    updateCurrentEditorFontSize();
  });
  editor.addEventListener('keyup', rememberEditorSelection);
  editor.addEventListener('mouseup', rememberEditorSelection);
  editor.addEventListener('paste', (event) => {
    const clipboard = event.clipboardData;
    if (!clipboard) return;
    event.preventDefault();
    const html = clipboard.getData('text/html');
    const clean = sanitizeArticleEditorHtml(html || escapeEditorHtml(clipboard.getData('text/plain')).replace(/\n/g, '<br>'));
    document.execCommand('insertHTML', false, clean);
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  });
  editor.addEventListener('keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === 'k') {
      event.preventDefault();
      showLinkDialog();
    } else if (key === 'h') {
      event.preventDefault();
      showFindReplaceDialog();
    }
  });
  document.addEventListener('selectionchange', updateCurrentEditorFontSize);
  document.getElementById('editorEditMode').addEventListener('click', () => setEditorMode(false));
  document.getElementById('editorPreviewMode').addEventListener('click', () => setEditorMode(true));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      document.getElementById('editorWorkspace')?.classList.remove('is-distraction-free');
      document.body.classList.remove('editor-distraction-free');
    }
  });
  document.getElementById('postTitle').addEventListener('input', () => {
    if (document.getElementById('articlePreview').hidden === false) renderArticlePreview();
  });
  document.getElementById('postEditorForm').addEventListener('input', (event) => {
    if (event.target !== editor) markEditorChanged();
  });
  document.getElementById('postEditorForm').addEventListener('change', (event) => {
    if (event.target !== editor) markEditorChanged();
  });
  setupEditorDialog();
  updateEditorStatistics();

  window.addEventListener('beforeunload', (event) => {
    if (!editorIsDirty || editorSaveInProgress) return;
    event.preventDefault();
    event.returnValue = '';
  });
}

export async function initAdminEditor() {
  requireAdminAuth(async (user) => {
    currentAdminUser = user;
    setupFormControls();

    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (id) {
      editingPostId = id;
      document.getElementById('editorPageTitle').textContent = 'Edit Article';
      document.getElementById('publishSubmitBtn').textContent = 'Save Changes';
      await loadPostForEditing(id);
    } else {
      // Set default author name
      const authorInput = document.getElementById('postAuthor');
      if (authorInput && user) {
        authorInput.value = user.displayName || user.email.split('@')[0];
      }
      editorInitialSnapshot = getEditorSnapshot();
      restoreEditorAutosave();
    }
    updateEditorStatistics();
  });
}

function setupFormControls() {
  // Title -> Slug auto-generate
  const titleInput = document.getElementById('postTitle');
  const slugInput = document.getElementById('postSlug');

  if (titleInput && slugInput) {
    titleInput.addEventListener('input', () => {
      if (!editingPostId && !slugWasManuallyEdited) {
        slugInput.value = normalizeArticleSlug(titleInput.value);
      }
    });
    slugInput.addEventListener('input', () => {
      slugWasManuallyEdited = true;
    });
  }

  // Tags input
  const tagInput = document.getElementById('tagInput');
  if (tagInput) {
    tagInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addTag(tagInput.value.trim());
        tagInput.value = '';
      }
    });
  }

  setupRichEditor();

  setupArticleImageModal();

  // Direct Cover Image URL Handler (No Firebase Storage)
  setupCoverImageUrl();

  // Save / Publish form submit
  const form = document.getElementById('postEditorForm');
  if (form) {
    form.addEventListener('submit', handlePostSubmit);
  }

  const saveDraftBtn = document.getElementById('saveDraftBtn');
  if (saveDraftBtn) {
    saveDraftBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const statusSelect = document.getElementById('postStatus');
      if (statusSelect) {
        statusSelect.value = 'draft';
        statusSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
      handlePostSubmit(e);
    });
  }
}

function addTag(tag) {
  const clean = tag.replace(/^#/, '').trim();
  if (clean && !postTags.includes(clean)) {
    postTags.push(clean);
    renderTagChips();
    markEditorChanged();
  }
}

function removeTag(tag) {
  postTags = postTags.filter(t => t !== tag);
  renderTagChips();
  markEditorChanged();
}

function renderTagChips() {
  const container = document.getElementById('tagsContainer');
  const tagInput = document.getElementById('tagInput');
  if (!container) return;

  container.querySelectorAll('.tag-badge').forEach(el => el.remove());

  postTags.forEach(tag => {
    const badge = document.createElement('span');
    badge.className = 'tag-badge';
    badge.innerHTML = `#${tag} <button type="button" data-tag="${tag}">&times;</button>`;
    badge.querySelector('button').addEventListener('click', () => removeTag(tag));
    container.insertBefore(badge, tagInput);
  });
}

let savedImageInsertRange = null;
let articleImageModalState = [];

function getCurrentArticleIdFromEditor() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id') || editingPostId || '';
}

function saveCurrentArticleEditorSelection() {
  const editor = document.getElementById('richEditorArea');
  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0 || !editor) {
    savedImageInsertRange = null;
    return false;
  }

  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) {
    savedImageInsertRange = null;
    return false;
  }

  savedImageInsertRange = range.cloneRange();
  return true;
}

function openImageModalForEditor() {
  const editor = document.getElementById('richEditorArea');
  const articleId = getCurrentArticleIdFromEditor();

  if (!editor) return;

  if (!articleId) {
    const feedbackEl = document.getElementById('editorFeedback');
    showFeedback(feedbackEl, 'Please save this article before adding body images so it has an article ID.', 'error');
    return;
  }

  saveCurrentArticleEditorSelection();
  editor.focus();
  const modal = document.getElementById('articleImageModalOverlay');
  if (!modal) return;

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  const fileInput = document.getElementById('articleImageFileInput');
  if (fileInput) fileInput.focus();
}

function closeImageModalForEditor(resetSelection = false) {
  const modal = document.getElementById('articleImageModalOverlay');
  if (modal) {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }

  const dropzone = document.getElementById('articleImageDropzone');
  if (dropzone) {
    dropzone.classList.remove('dragover');
    const text = document.getElementById('dropzoneText');
    if (text) text.textContent = 'Drag & Drop Images Here';
  }

  const input = document.getElementById('articleImageFileInput');
  if (input) input.value = '';

  articleImageModalState = [];
  renderArticleImageModalItems();

  if (resetSelection && savedImageInsertRange) {
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(savedImageInsertRange.cloneRange());
    }
  }
}

function getArticleImageModalInsertHtml(images) {
  const batchId = `article-image-batch-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return images.map((image) => {
    const alt = escapeEditorHtml(image.alt || 'Article image');
    const src = escapeEditorHtml(image.src || '');
    const caption = image.caption?.trim()
      ? `<figcaption>${escapeEditorHtml(image.caption.trim())}</figcaption>`
      : '';
    const width = Number.isFinite(image.width) ? ` width="${image.width}"` : '';
    const height = Number.isFinite(image.height) ? ` height="${image.height}"` : '';
    return `<figure class="article-figure"><img src="${src}" alt="${alt}"${width}${height} loading="lazy" decoding="async" class="article-content-image" data-image-batch="${batchId}" />${caption}</figure>`;
  }).join('');
}

function restoreSavedSelectionAndInsert(images) {
  const editor = document.getElementById('richEditorArea');
  const selection = window.getSelection();

  if (!editor) return;

  let rangeToUse = savedImageInsertRange ? savedImageInsertRange.cloneRange() : null;

  if (!rangeToUse) {
    const fallbackRange = document.createRange();
    fallbackRange.selectNodeContents(editor);
    fallbackRange.collapse(false);
    rangeToUse = fallbackRange;
  }

  const imageCount = editor.querySelectorAll('.article-content-image').length;
  if (selection) {
    selection.removeAllRanges();
    selection.addRange(rangeToUse);
  }
  editor.focus();
  document.execCommand('insertHTML', false, sanitizeArticleEditorHtml(getArticleImageModalInsertHtml(images)));
  const insertedImages = Array.from(editor.querySelectorAll('.article-content-image')).slice(imageCount);
  const lastInserted = insertedImages[insertedImages.length - 1];

  if (selection && lastInserted) {
    const cursorRange = document.createRange();
    cursorRange.setStartAfter(lastInserted.closest('figure') || lastInserted);
    cursorRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(cursorRange);
  }

  editor.dispatchEvent(new Event('input', { bubbles: true }));
  rememberEditorSelection();
  savedImageInsertRange = null;
}

function createImageModalStatus(message, type = 'info') {
  const status = document.getElementById('articleImageModalStatus');
  if (!status) return;
  status.textContent = message;
  status.className = `article-image-modal-status ${type}`;
}

function renderArticleImageModalItems() {
  const section = document.getElementById('articleImageSelectedSection');
  const list = document.getElementById('articleImageSelectedList');
  const countBadge = document.getElementById('articleImageCountBadge');
  const insertBtn = document.getElementById('insertArticleImagesBtn');

  if (!section || !list || !countBadge || !insertBtn) return;

  list.innerHTML = '';
  countBadge.textContent = String(articleImageModalState.length);

  if (!articleImageModalState.length) {
    section.style.display = 'none';
    insertBtn.disabled = true;
    return;
  }

  section.style.display = 'block';
  insertBtn.disabled = false;

  articleImageModalState.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'article-image-item';

    const previewWrap = document.createElement('div');
    previewWrap.className = 'article-image-thumb-wrap';

    const thumb = document.createElement('img');
    thumb.src = item.preview;
    thumb.alt = item.alt || item.fileName;
    thumb.className = 'article-image-thumb';

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'article-image-remove';
    removeBtn.textContent = '×';
    removeBtn.title = 'Remove image';
    removeBtn.addEventListener('click', () => {
      articleImageModalState.splice(index, 1);
      renderArticleImageModalItems();
    });

    previewWrap.appendChild(thumb);
    previewWrap.appendChild(removeBtn);

    const meta = document.createElement('div');
    meta.className = 'article-image-meta';

    const label = document.createElement('label');
    label.className = 'article-image-field-label';
    label.textContent = 'Alt Text';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'article-image-alt-input';
    input.value = item.alt || '';
    input.placeholder = 'Itachi Uchiha';
    input.addEventListener('input', (event) => {
      item.alt = event.target.value.trim() || item.defaultAlt || 'Article image';
    });

    const captionLabel = document.createElement('label');
    captionLabel.className = 'article-image-field-label';
    captionLabel.textContent = 'Caption (optional)';

    const captionInput = document.createElement('input');
    captionInput.type = 'text';
    captionInput.className = 'article-image-caption-input';
    captionInput.value = item.caption || '';
    captionInput.placeholder = 'Image caption';
    captionInput.addEventListener('input', (event) => {
      item.caption = event.target.value;
    });

    const fileName = document.createElement('div');
    fileName.className = 'article-image-filename';
    fileName.textContent = item.fileName;

    meta.appendChild(fileName);
    meta.appendChild(label);
    meta.appendChild(input);
    meta.appendChild(captionLabel);
    meta.appendChild(captionInput);

    card.appendChild(previewWrap);
    card.appendChild(meta);
    list.appendChild(card);
  });
}

function handleArticleImageFiles(fileList) {
  if (!fileList || fileList.length === 0) return;

  const files = Array.from(fileList);
  const queued = [];

  files.forEach((file) => {
    if (!file.type.startsWith('image/')) {
      const feedbackEl = document.getElementById('editorFeedback');
      showFeedback(feedbackEl, 'Unsupported file type. Please use JPG, JPEG, PNG, WEBP, or GIF.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      queued.push({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        file,
        preview: reader.result,
        fileName: file.name,
        alt: file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Article image',
        caption: '',
        defaultAlt: file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Article image',
      });

      if (queued.length === files.filter(Boolean).length) {
        articleImageModalState = [...articleImageModalState, ...queued];
        renderArticleImageModalItems();
      }
    };
    reader.onerror = () => {
      const feedbackEl = document.getElementById('editorFeedback');
      showFeedback(feedbackEl, 'Could not read a selected image. Please try a different file.', 'error');
    };
    reader.readAsDataURL(file);
  });
}

function getArticleImageModalDropzoneText() {
  return document.getElementById('dropzoneText');
}

function setupArticleImageModal() {
  const modal = document.getElementById('articleImageModalOverlay');
  if (!modal) return;

  const fileInput = document.getElementById('articleImageFileInput');
  const dropzone = document.getElementById('articleImageDropzone');
  const chooseBtn = document.getElementById('articleImageChooseBtn');
  const closeBtn = document.getElementById('closeArticleImageModalBtn');
  const cancelBtn = document.getElementById('cancelArticleImageModalBtn');
  const insertBtn = document.getElementById('insertArticleImagesBtn');

  chooseBtn?.addEventListener('click', () => fileInput?.click());
  closeBtn?.addEventListener('click', () => closeImageModalForEditor());
  cancelBtn?.addEventListener('click', () => closeImageModalForEditor());

  fileInput?.addEventListener('change', (event) => {
    handleArticleImageFiles(event.target.files || []);
    event.target.value = '';
  });

  dropzone?.addEventListener('click', () => fileInput?.click());
  dropzone?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput?.click();
    }
  });

  ['dragenter', 'dragover'].forEach((eventName) => {
    dropzone?.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.add('dragover');
      const label = getArticleImageModalDropzoneText();
      if (label) label.textContent = 'Drop Images Here';
    });
  });

  ['dragleave', 'dragend', 'drop'].forEach((eventName) => {
    dropzone?.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.remove('dragover');
      const label = getArticleImageModalDropzoneText();
      if (label) label.textContent = 'Drag & Drop Images Here';
    });
  });

  dropzone?.addEventListener('drop', (event) => {
    event.preventDefault();
    handleArticleImageFiles(event.dataTransfer?.files || []);
  });

  insertBtn?.addEventListener('click', async () => {
    if (!articleImageModalState.length) return;

    const articleId = getCurrentArticleIdFromEditor();
    if (!articleId) {
      const feedbackEl = document.getElementById('editorFeedback');
      showFeedback(feedbackEl, 'Article ID is missing. Please open this editor from a valid article page.', 'error');
      return;
    }

    insertBtn.disabled = true;
    insertBtn.textContent = 'Uploading...';

    try {
      const savedImages = [];

      for (const item of articleImageModalState) {
        const compressed = await compressArticleImage(item.file, item.alt || item.defaultAlt || 'Article image');
        const imageUrl = await uploadImageToR2(compressed.blob, {
          kind: 'articles',
          fileName: compressed.fileName,
        });
        const docRef = await addDoc(collection(db, 'imageAssets'), {
          articleId,
          fileName: compressed.fileName,
          mimeType: compressed.mimeType,
          alt: compressed.alt,
          url: imageUrl,
          width: compressed.width,
          height: compressed.height,
          createdAt: serverTimestamp()
        });

        savedImages.push({
          id: docRef.id,
          src: imageUrl,
          alt: compressed.alt,
          caption: item.caption || '',
          width: compressed.width,
          height: compressed.height,
        });
      }

      if (savedImages.length) {
        restoreSavedSelectionAndInsert(savedImages);
      }

      closeImageModalForEditor();
      const feedbackEl = document.getElementById('editorFeedback');
      showFeedback(feedbackEl, 'Images inserted successfully.', 'success');
    } catch (error) {
      const feedbackEl = document.getElementById('editorFeedback');
      showFeedback(feedbackEl, error?.message || 'Image upload failed. Please try again.', 'error');
    } finally {
      insertBtn.disabled = false;
      insertBtn.textContent = 'Insert Images';
    }
  });

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeImageModalForEditor();
    }
  });

  renderArticleImageModalItems();
}

function loadArticleImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This image could not be read.'));
    };
    img.src = url;
  });
}

function articleImageCanvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

async function compressArticleImage(file, altText) {
  if (!file || !file.type || !file.type.startsWith('image/')) {
    throw new Error('Unsupported file type. Please choose JPG, JPEG, PNG, WEBP, or GIF.');
  }

  const sourceImage = await loadArticleImageElement(file);
  const imageWidth = sourceImage.naturalWidth || sourceImage.width;
  const imageHeight = sourceImage.naturalHeight || sourceImage.height;
  const scale = Math.min(1, 1600 / Math.max(imageWidth, 1), 1200 / Math.max(imageHeight, 1));
  const targetWidth = Math.max(1, Math.round(imageWidth * scale));
  const targetHeight = Math.max(1, Math.round(imageHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Your browser could not process this image.');
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(sourceImage, 0, 0, targetWidth, targetHeight);

  const mimeType = 'image/webp';
  let bestCandidate = null;

  for (let quality = 0.85; quality >= 0.45; quality -= 0.05) {
    const blob = await articleImageCanvasToBlob(canvas, mimeType, quality);
    if (!blob) continue;

    if (blob.size <= MAX_COMPRESSED_IMAGE_BYTES) {
      return {
        fileName: `${(file.name || 'article-image').replace(/\.[^.]+$/, '')}.webp`,
        mimeType,
        alt: altText || 'Article image',
        blob,
        width: targetWidth,
        height: targetHeight,
      };
    }

    if (!bestCandidate || blob.size < bestCandidate.size) {
      bestCandidate = { blob, size: blob.size };
    }
  }

  if (bestCandidate && bestCandidate.size > MAX_COMPRESSED_IMAGE_BYTES) {
    throw new Error('Image is too large. Please choose a smaller image.');
  }

  throw new Error('Compression failed. Please try a different image.');
}

/**
 * Direct URL + Drag-and-drop upload support for cover images.
 * Uploaded images are compressed to WebP in-browser and sent to the Vercel upload API.
 */
function setupCoverImageUrl() {
  const urlInput = document.getElementById('coverUrlInput');
  const previewImg = document.getElementById('coverPreview');
  const placeholder = document.getElementById('coverPlaceholder');
  const fileInput = document.getElementById('coverFileInput');
  const uploadBox = document.getElementById('coverUploadBox');
  const clearBtn = document.getElementById('clearCoverBtn');
  const replaceBtn = document.getElementById('replaceCoverBtn');
  const coverSelectedMeta = document.getElementById('coverSelectedMeta');
  const coverFileName = document.getElementById('coverFileName');
  const coverFileMeta = document.getElementById('coverFileMeta');
  const modeButtons = document.querySelectorAll('.cover-mode-toggle');
  const urlPanel = document.getElementById('coverUrlPanel');
  const uploadPanel = document.getElementById('coverUploadPanel');

  function setPreviewMeta({ name, size, width, height, imageSource }) {
    if (coverSelectedMeta) {
      coverSelectedMeta.style.display = name ? 'block' : 'none';
    }
    if (coverFileName) {
      coverFileName.textContent = name || 'cover-image.webp';
    }
    if (coverFileMeta) {
      const sizeLabel = size ? formatBytes(size) : '0 KB';
      const dims = width && height ? ` • ${width} × ${height}` : '';
      coverFileMeta.textContent = `${sizeLabel}${dims}`;
      if (imageSource === 'url') {
        coverFileMeta.textContent = imageSource === 'url' ? 'Direct URL image' : coverFileMeta.textContent;
      }
    }
  }

  function resetPreviewState(messageText = 'No cover image selected. Choose an upload or enter a direct URL.') {
    if (currentUploadedCoverData?.previewUrl) {
      URL.revokeObjectURL(currentUploadedCoverData.previewUrl);
    }
    currentUploadedCoverData = null;
    uploadedCoverUrl = '';
    if (previewImg) {
      previewImg.src = '';
      previewImg.style.display = 'none';
    }
    if (placeholder) {
      placeholder.style.display = 'block';
      placeholder.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin: 0 auto 6px auto; opacity: 0.6; display: block;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
        <span>${messageText}</span>
      `;
    }
    if (coverSelectedMeta) {
      coverSelectedMeta.style.display = 'none';
    }
  }

  function updateUrlPreview(url) {
    const trimmed = (url || '').trim();
    uploadedCoverUrl = trimmed;
    userRequestedCoverRemoval = false;

    if (!trimmed) {
      resetPreviewState();
      return;
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(trimmed);
    } catch {
      resetPreviewState('Enter a complete image URL starting with https://.');
      return;
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      resetPreviewState('The image URL must start with http:// or https://.');
      return;
    }

    currentUploadedCoverData = null;
    if (previewImg) {
      previewImg.src = trimmed;
      previewImg.style.display = 'block';
      previewImg.onload = () => {
        if (placeholder) placeholder.style.display = 'none';
        setPreviewMeta({ name: 'Direct URL image', size: 0, width: previewImg.naturalWidth || 0, height: previewImg.naturalHeight || 0, imageSource: 'url' });
      };
      previewImg.onerror = () => {
        console.warn('Could not preview image from:', trimmed);
        resetPreviewState('This URL did not return an image. Use the direct image address, not a page or search-result URL.');
      };
    }
    if (placeholder) placeholder.style.display = 'none';
    if (coverSelectedMeta) {
      coverSelectedMeta.style.display = 'block';
    }
    setPreviewMeta({ name: 'Direct URL image', size: 0, width: 0, height: 0, imageSource: 'url' });
  }

  function syncMode(mode) {
    currentCoverMode = mode;
    const isUploadMode = mode === 'upload';
    if (urlPanel) urlPanel.style.display = isUploadMode ? 'none' : 'block';
    if (uploadPanel) uploadPanel.style.display = isUploadMode ? 'block' : 'none';
    modeButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.coverMode === mode);
    });
  }

  async function processSelectedFile(file) {
    if (!file) return;

    try {
      const validation = validateCoverFile(file);
      if (!validation.valid) {
        throw new Error(validation.message);
      }

      const compressedCover = await compressCoverImage(file);
      if (currentUploadedCoverData?.previewUrl) {
        URL.revokeObjectURL(currentUploadedCoverData.previewUrl);
      }
      currentUploadedCoverData = {
        ...compressedCover,
        previewUrl: URL.createObjectURL(compressedCover.blob),
      };
      uploadedCoverUrl = '';
      userRequestedCoverRemoval = false;
      currentCoverMode = 'upload';
      syncMode('upload');

      if (previewImg) {
        previewImg.src = currentUploadedCoverData.previewUrl;
        previewImg.style.display = 'block';
      }
      if (placeholder) placeholder.style.display = 'none';
      setPreviewMeta({
        name: currentUploadedCoverData.name,
        size: currentUploadedCoverData.size,
        width: currentUploadedCoverData.width,
        height: currentUploadedCoverData.height,
        imageSource: 'upload'
      });
      if (coverSelectedMeta) coverSelectedMeta.style.display = 'block';
    } catch (error) {
      console.error('Cover image process failed:', error);
      resetPreviewState(error?.message || 'This file could not be processed. Please choose a PNG, JPG, JPEG, or WEBP image under a reasonable size.');
      if (fileInput) fileInput.value = '';
    }
  }

  if (urlInput) {
    urlInput.addEventListener('input', (e) => {
      updateUrlPreview(e.target.value);
    });
    urlInput.addEventListener('change', (e) => {
      updateUrlPreview(e.target.value);
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) processSelectedFile(file);
    });
  }

  if (uploadBox) {
    uploadBox.addEventListener('click', () => fileInput?.click());
    uploadBox.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput?.click();
      }
    });

    ['dragenter', 'dragover'].forEach((eventName) => {
      uploadBox.addEventListener(eventName, (e) => {
        e.preventDefault();
        uploadBox.classList.add('dragover');
      });
    });

    ['dragleave', 'dragend', 'drop'].forEach((eventName) => {
      uploadBox.addEventListener(eventName, (e) => {
        e.preventDefault();
        uploadBox.classList.remove('dragover');
      });
    });

    uploadBox.addEventListener('drop', (e) => {
      const file = e.dataTransfer?.files?.[0];
      if (file) processSelectedFile(file);
    });
  }

  modeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const mode = button.dataset.coverMode || 'upload';
      syncMode(mode);
      if (mode === 'url') {
        if (fileInput) fileInput.value = '';
        if (currentUploadedCoverData?.previewUrl) {
          URL.revokeObjectURL(currentUploadedCoverData.previewUrl);
        }
        currentUploadedCoverData = null;
        uploadedCoverUrl = (urlInput && urlInput.value.trim()) || '';
      } else {
        if (currentUploadedCoverData?.previewUrl) {
          URL.revokeObjectURL(currentUploadedCoverData.previewUrl);
        }
        currentUploadedCoverData = null;
        uploadedCoverUrl = '';
      }
      userRequestedCoverRemoval = false;
    });
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      currentUploadedCoverData = null;
      uploadedCoverUrl = '';
      userRequestedCoverRemoval = true;
      if (urlInput) urlInput.value = '';
      if (fileInput) fileInput.value = '';
      resetPreviewState();
    });
  }

  if (replaceBtn) {
    replaceBtn.addEventListener('click', () => {
      currentCoverMode = 'upload';
      syncMode('upload');
      fileInput?.click();
    });
  }

  syncMode(currentCoverMode);
  resetPreviewState();
}

function formatBytes(bytes) {
  if (!bytes) return '0 KB';
  const units = ['B', 'KB', 'MB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function getWebpFilename(originalName) {
  const base = (originalName || 'cover-image').replace(/\.[^.]+$/, '');
  return `${base}.webp`;
}

function validateCoverFile(file) {
  if (!file) {
    return { valid: false, message: 'No file selected.' };
  }

  const mimeType = file.type || '';
  const lowerName = (file.name || '').toLowerCase();
  const allowedExt = /\.(png|jpg|jpeg|webp)$/i;

  if (!ACCEPTED_IMAGE_TYPES.includes(mimeType) && !allowedExt.test(lowerName)) {
    return { valid: false, message: 'Unsupported file type. Please upload a PNG, JPG, JPEG, or WEBP image.' };
  }

  if (file.size > 15 * 1024 * 1024) {
    return { valid: false, message: 'Image is too large. Please choose a file smaller than 15 MB.' };
  }

  return { valid: true };
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This image is corrupted or unreadable.'));
    };
    img.src = url;
  });
}

async function compressCoverImage(file) {
  const validation = validateCoverFile(file);
  if (!validation.valid) {
    throw new Error(validation.message);
  }

  const sourceImage = await loadImageElement(file);
  const sourceWidth = sourceImage.naturalWidth || sourceImage.width;
  const sourceHeight = sourceImage.naturalHeight || sourceImage.height;
  const scale = Math.min(1, COVER_MAX_DIMENSION / Math.max(sourceWidth, sourceHeight));
  const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Your browser could not process the image.');
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(sourceImage, 0, 0, targetWidth, targetHeight);

  let quality = 0.82;
  let bestCandidate = null;

  while (quality >= 0.38) {
    const blob = await canvasToBlob(canvas, 'image/webp', quality);
    if (!blob) {
      throw new Error('Compression failed. Please try a different image.');
    }

    const candidate = {
      type: 'image/webp',
      name: getWebpFilename(file.name),
      blob,
      size: blob.size,
      width: targetWidth,
      height: targetHeight,
    };

    if (blob.size <= MAX_COMPRESSED_IMAGE_BYTES) {
      return candidate;
    }

    bestCandidate = candidate;
    quality -= 0.08;
  }

  if (!bestCandidate) {
    throw new Error('Compression failed. Please try a smaller image.');
  }

  if (bestCandidate.size > MAX_COMPRESSED_IMAGE_BYTES) {
    throw new Error('Image is too large. Please choose a smaller image.');
  }

  return bestCandidate;
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function estimatePayloadSize(payload) {
  return new Blob([JSON.stringify(payload)]).size;
}

function isValidCoverValue(value) {
  if (!value) return false;
  if (value.startsWith('data:image/')) return true;
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function buildCoverSelectionFromState() {
  if (userRequestedCoverRemoval) {
    return { mode: 'remove', coverImage: '', coverImageType: null, coverImageName: null, coverImageSize: null, coverImageWidth: null, coverImageHeight: null };
  }

  if (currentUploadedCoverData) {
    return {
      mode: 'upload',
      coverImage: '',
      blob: currentUploadedCoverData.blob,
      coverImageType: 'image/webp',
      coverImageName: currentUploadedCoverData.name,
      coverImageSize: currentUploadedCoverData.size,
      coverImageWidth: currentUploadedCoverData.width,
      coverImageHeight: currentUploadedCoverData.height,
    };
  }

  const urlValue = document.getElementById('coverUrlInput')?.value.trim() || uploadedCoverUrl || '';
  if (existingCoverData?.coverImage && urlValue === existingCoverData.coverImage) {
    return {
      mode: 'existing',
      coverImage: existingCoverData.coverImage,
      coverImageType: existingCoverData.coverImageType || null,
      coverImageName: existingCoverData.coverImageName || null,
      coverImageSize: existingCoverData.coverImageSize || null,
      coverImageWidth: existingCoverData.coverImageWidth || null,
      coverImageHeight: existingCoverData.coverImageHeight || null,
    };
  }

  if (urlValue) {
    return {
      mode: 'url',
      coverImage: urlValue,
      coverImageType: 'image/url',
      coverImageName: null,
      coverImageSize: null,
      coverImageWidth: null,
      coverImageHeight: null,
    };
  }

  if (existingCoverData && existingCoverData.coverImage) {
    return {
      mode: 'existing',
      coverImage: existingCoverData.coverImage,
      coverImageType: existingCoverData.coverImageType || 'image/url',
      coverImageName: existingCoverData.coverImageName || null,
      coverImageSize: existingCoverData.coverImageSize || null,
      coverImageWidth: existingCoverData.coverImageWidth || null,
      coverImageHeight: existingCoverData.coverImageHeight || null,
    };
  }

  return { mode: 'none', coverImage: '', coverImageType: null, coverImageName: null, coverImageSize: null, coverImageWidth: null, coverImageHeight: null };
}

async function loadPostForEditing(postId) {
  if (!db) return;
  try {
    const snap = await getDoc(doc(db, 'posts', postId));
    if (!snap.exists()) {
      alert("Article not found.");
      window.location.href = 'admin.html';
      return;
    }

    const post = snap.data();
    originalPostSlug = typeof post.slug === 'string' ? post.slug : '';
    originalPostStatus = post.status || 'draft';
    originalPublishedAt = post.publishedAt || null;
    originalCreatedAt = post.createdAt || null;
    existingCoverData = {
      coverImage: post.coverImage || '',
      coverImageType: post.coverImageType || null,
      coverImageName: post.coverImageName || null,
      coverImageSize: post.coverImageSize || null,
      coverImageWidth: post.coverImageWidth || null,
      coverImageHeight: post.coverImageHeight || null,
    };

    document.getElementById('postTitle').value = post.title || '';
    document.getElementById('postSlug').value = post.slug || '';
    document.getElementById('postExcerpt').value = post.excerpt || '';
    document.getElementById('postCategory').value = post.category || 'Anime News';
    document.getElementById('postAnimeTitle').value = post.animeTitle || '';
    document.getElementById('postAnimeSlug').value = post.animeSlug || '';
    document.getElementById('postSeoTitle').value = post.seoTitle || '';
    document.getElementById('postSeoDescription').value = post.seoDescription || '';
    document.getElementById('postAuthor').value = post.authorName || '';
    document.getElementById('postStatus').value = post.status || 'draft';
    document.getElementById('postFeatured').checked = !!post.featured;
    document.getElementById('postFeaturedOrder').value = post.featuredOrder || 1;

    const editorArea = document.getElementById('richEditorArea');
    if (editorArea) editorArea.innerHTML = sanitizeArticleEditorHtml(post.content || '');

    if (post.coverImage) {
      uploadedCoverUrl = '';
      const urlInput = document.getElementById('coverUrlInput');
      const previewImg = document.getElementById('coverPreview');
      const placeholder = document.getElementById('coverPlaceholder');
      const coverSelectedMeta = document.getElementById('coverSelectedMeta');
      const coverFileName = document.getElementById('coverFileName');
      const coverFileMeta = document.getElementById('coverFileMeta');

      if (post.coverImage.startsWith('data:image/')) {
        if (previewImg) {
          previewImg.src = post.coverImage;
          previewImg.style.display = 'block';
        }
        if (coverSelectedMeta) coverSelectedMeta.style.display = 'block';
        if (coverFileName) coverFileName.textContent = post.coverImageName || 'Uploaded Cover Image';
        if (coverFileMeta) {
          const dims = post.coverImageWidth && post.coverImageHeight ? ` • ${post.coverImageWidth} × ${post.coverImageHeight}` : '';
          coverFileMeta.textContent = `${post.coverImageSize ? formatBytes(post.coverImageSize) : 'Compressed WebP'}${dims}`;
        }
      } else {
        if (urlInput) urlInput.value = post.coverImage;
        if (previewImg) {
          previewImg.src = post.coverImage;
          previewImg.style.display = 'block';
        }
        if (coverSelectedMeta) coverSelectedMeta.style.display = 'block';
        if (coverFileName) coverFileName.textContent = 'Direct URL image';
        if (coverFileMeta) coverFileMeta.textContent = 'Direct URL image';
      }
      if (placeholder) placeholder.style.display = 'none';
    }

    if (post.tags && Array.isArray(post.tags)) {
      postTags = [...post.tags];
      renderTagChips();
    }
    editorInitialSnapshot = getEditorSnapshot();
    restoreEditorAutosave();
    if (!editorIsDirty) setEditorSaveStatus('Changes are saved when you publish.');
  } catch (err) {
    handleFirestoreError(err, 'get', `posts/${postId}`);
    alert("Could not load post details: " + err.message);
  }
}

async function handlePostSubmit(e) {
  e.preventDefault();
  const autosaveKeyBeforeSave = getEditorAutosaveKey();
  const feedbackEl = document.getElementById('editorFeedback');
  const submitBtn = document.getElementById('publishSubmitBtn');

  // 1. Verify user is currently signed in via Firebase Auth
  const currentUser = auth?.currentUser;
  if (!currentUser) {
    showFeedback(feedbackEl, "Authentication required: You must be signed in with an administrator account to publish or edit articles.", "error");
    submitBtn.disabled = false;
    submitBtn.textContent = editingPostId ? "Save Changes" : "Publish Article";
    setTimeout(() => {
      window.location.href = 'admin-login.html';
    }, 2000);
    return;
  }

  // 2. Verify admin status before issuing write
  const isAuthorized = await verifyAdminStatus(currentUser);
  if (!isAuthorized) {
    showFeedback(feedbackEl, `Permission denied: Your account (${currentUser.email}) is not registered as an administrator in the Firestore 'admins' collection.`, "error");
    submitBtn.disabled = false;
    submitBtn.textContent = editingPostId ? "Save Changes" : "Publish Article";
    return;
  }

  const title = document.getElementById('postTitle').value.trim();
  const requestedSlug = document.getElementById('postSlug').value.trim() || title;
  let excerpt = document.getElementById('postExcerpt').value.trim();
  const category = document.getElementById('postCategory').value;
  const animeTitle = document.getElementById('postAnimeTitle').value.trim();
  const animeSlugInput = document.getElementById('postAnimeSlug').value.trim();
  const animeSlug = animeSlugInput ? normalizeAnimeSlug(animeSlugInput) : '';
  const seoTitle = document.getElementById('postSeoTitle').value.trim();
  const seoDescription = document.getElementById('postSeoDescription').value.trim();
  const authorName = document.getElementById('postAuthor').value.trim() || 'Animoro Editor';
  const status = document.getElementById('postStatus').value;
  const featured = document.getElementById('postFeatured').checked;
  const featuredOrder = parseInt(document.getElementById('postFeaturedOrder').value, 10) || 1;
  const editor = getRichEditor();
  const content = sanitizeArticleEditorHtml(editor.innerHTML).trim();
  editor.innerHTML = content;
  const selectedCover = buildCoverSelectionFromState();
  const coverImage = selectedCover.coverImage || '';

  if (!title) {
    showFeedback(feedbackEl, "Please enter an article title.", "error");
    return;
  }
  if (title.length > 200) {
    showFeedback(feedbackEl, "Title must be 200 characters or less.", "error");
    return;
  }
  if (!content || content === '<br>') {
    showFeedback(feedbackEl, "Please enter article body content.", "error");
    return;
  }
  if (content.length > 100000) {
    showFeedback(feedbackEl, "Article content must be 100,000 characters or less.", "error");
    return;
  }
  if (selectedCover.mode === 'url' && !isValidCoverValue(coverImage)) {
    showFeedback(feedbackEl, "Please enter a direct image URL starting with http:// or https://.", "error");
    return;
  }

  // Auto-generate excerpt if not provided (clean text from HTML, max 200 chars)
  if (!excerpt) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    const plainText = tempDiv.textContent || tempDiv.innerText || '';
    excerpt = plainText.substring(0, 200).trim();
    if (plainText.length > 200) excerpt += '...';
  } else if (excerpt.length > 1000) {
    excerpt = excerpt.substring(0, 1000);
  }

  if (!isConfigured || !db) {
    showFeedback(feedbackEl, "Firebase is not configured yet with valid credentials. Please enter credentials in the Admin Setup panel first.", "error");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Checking article URL...';

  let slug;
  try {
    const normalizedSlug = normalizeArticleSlug(requestedSlug);
    if (editingPostId && normalizedSlug === originalPostSlug && isValidArticleSlug(originalPostSlug)) {
      slug = originalPostSlug;
    } else {
      slug = await findAvailablePostSlug(normalizedSlug, editingPostId);
    }
  } catch (error) {
    handleFirestoreError(error, 'list', 'posts');
    showFeedback(feedbackEl, 'Unable to verify that this article URL is unique. Please try again.', 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = editingPostId ? 'Save Changes' : 'Publish Article';
    return;
  }

  submitBtn.textContent = editingPostId ? "Saving changes..." : "Publishing article...";

  const migrateEmbeddedCover = selectedCover.mode === 'existing' &&
    selectedCover.coverImage.startsWith('data:image/');
  if (selectedCover.mode === 'upload' || migrateEmbeddedCover) {
    try {
      const coverBlob = selectedCover.mode === 'upload'
        ? selectedCover.blob
        : await (async () => {
          if (!/^data:image\/(?:webp|jpeg|png);base64,/i.test(selectedCover.coverImage)) {
            throw new Error('This embedded cover format is not supported. Replace it with a WebP, JPEG, or PNG image before saving.');
          }
          const response = await fetch(selectedCover.coverImage);
          if (!response.ok) throw new Error('Could not read the existing embedded cover image.');
          return response.blob();
        })();
      if (migrateEmbeddedCover) {
        selectedCover.coverImageType = coverBlob.type;
        selectedCover.coverImageSize = coverBlob.size;
        selectedCover.coverImageName = selectedCover.coverImageName || `${slug}-cover.webp`;
        selectedCover.mode = 'upload';
      }
      selectedCover.coverImage = await uploadImageToR2(coverBlob, {
        kind: 'covers',
        fileName: selectedCover.coverImageName,
      });
    } catch (error) {
      showFeedback(feedbackEl, error?.message || 'Cover image upload failed. Please try again.', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = editingPostId ? "Save Changes" : "Publish Article";
      return;
    }

    if (!isValidCoverValue(selectedCover.coverImage)) {
      showFeedback(feedbackEl, "The uploaded cover image URL is invalid. Please try again.", "error");
      submitBtn.disabled = false;
      submitBtn.textContent = editingPostId ? "Save Changes" : "Publish Article";
      return;
    }
  }

  const coverImageToSave = selectedCover.coverImage || '';

  const articlePayload = {
    title,
    slug,
    excerpt,
    content,
    category,
    animeTitle,
    animeSlug,
    seoTitle,
    seoDescription,
    tags: postTags,
    authorName,
    authorId: currentUser.uid,
    authorEmail: currentUser.email || '',
    status,
    featured,
    featuredOrder,
    updatedAt: serverTimestamp()
  };

  if (selectedCover.mode === 'upload') {
    articlePayload.coverImage = coverImageToSave;
    articlePayload.coverImageType = selectedCover.coverImageType;
    articlePayload.coverImageName = selectedCover.coverImageName;
    articlePayload.coverImageSize = selectedCover.coverImageSize;
    articlePayload.coverImageWidth = selectedCover.coverImageWidth;
    articlePayload.coverImageHeight = selectedCover.coverImageHeight;
  } else if (selectedCover.mode === 'url') {
    articlePayload.coverImage = selectedCover.coverImage;
    articlePayload.coverImageType = 'image/url';
    articlePayload.coverImageName = null;
    articlePayload.coverImageSize = null;
    articlePayload.coverImageWidth = null;
    articlePayload.coverImageHeight = null;
  } else if (selectedCover.mode === 'remove') {
    articlePayload.coverImage = null;
    articlePayload.coverImageType = deleteField();
    articlePayload.coverImageName = deleteField();
    articlePayload.coverImageSize = deleteField();
    articlePayload.coverImageWidth = deleteField();
    articlePayload.coverImageHeight = deleteField();
  } else if (selectedCover.mode === 'existing') {
    articlePayload.coverImage = selectedCover.coverImage;
    articlePayload.coverImageType = selectedCover.coverImageType;
    articlePayload.coverImageName = selectedCover.coverImageName;
    articlePayload.coverImageSize = selectedCover.coverImageSize;
    articlePayload.coverImageWidth = selectedCover.coverImageWidth;
    articlePayload.coverImageHeight = selectedCover.coverImageHeight;
  }

  const finalDocumentPayload = {
    ...articlePayload,
    ...(editingPostId ? {} : { createdAt: serverTimestamp(), views: 0 }),
    ...(status === 'published'
      ? {
        publishedAt: editingPostId && originalPostStatus === 'published'
          ? originalPublishedAt || originalCreatedAt || serverTimestamp()
          : serverTimestamp()
      }
      : { publishedAt: null })
  };

  const estimatedSize = estimatePayloadSize({ ...finalDocumentPayload, coverImage: '' });
  if (estimatedSize > MAX_ARTICLE_DOCUMENT_BYTES) {
    showFeedback(feedbackEl, "Article content is too large to save. Please shorten the article.", "error");
    submitBtn.disabled = false;
    submitBtn.textContent = editingPostId ? "Save Changes" : "Publish Article";
    return;
  }

  try {
    editorSaveInProgress = true;
    if (editingPostId) {
      await updateDoc(doc(db, 'posts', editingPostId), finalDocumentPayload);
      showFeedback(feedbackEl, "Changes saved successfully.", "success");
    } else {
      const newDoc = await addDoc(collection(db, 'posts'), finalDocumentPayload);
      editingPostId = newDoc.id;
      showFeedback(feedbackEl, status === 'published' ? "Article published successfully!" : "Draft saved successfully!", "success");
    }

    editorSaveInProgress = false;
    editorIsDirty = false;
    editorInitialSnapshot = getEditorSnapshot();
    try {
      localStorage.removeItem(autosaveKeyBeforeSave);
      if (editingPostId) localStorage.removeItem(getEditorAutosaveKey());
      setEditorSaveStatus('Saved to Firestore.', 'saved');
    } catch (error) {
      console.warn('The local recovery copy could not be cleared after saving:', error);
      setEditorSaveStatus('Saved to Firestore; local recovery copy could not be cleared.', 'error');
    }
    setTimeout(() => {
      window.location.href = 'admin.html#posts';
    }, 1200);

  } catch (error) {
    editorSaveInProgress = false;
    console.error("Publishing error details:", error);
    handleFirestoreError(error, editingPostId ? 'update' : 'create', 'posts');
    const isPerm = error?.message?.includes('permission') || error?.code === 'permission-denied';
    if (isPerm) {
      feedbackEl.className = 'form-feedback error';
      feedbackEl.style.display = 'block';
      feedbackEl.innerHTML = `
        <div style="text-align: left; padding: 4px 0;">
          <strong style="font-size: 0.95rem; display: block; margin-bottom: 6px;">⚠️ Firestore Permission Error</strong>
          <span>Cloud Firestore rejected this write request because the required security rules are not yet active on your Firebase project.</span>
          <div style="margin-top: 10px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
            <button type="button" id="copyEditorRulesBtn" style="padding: 6px 14px; background: #e11d48; color: #fff; border: none; border-radius: 4px; font-weight: 600; cursor: pointer;">
              📋 Copy Firestore Rules
            </button>
            <a href="admin.html#settings" style="color: #60a5fa; text-decoration: underline; font-size: 0.85rem;">
              Open Admin Settings &rarr;
            </a>
          </div>
          <span id="editorCopyNotice" style="display: none; font-size: 0.8rem; color: #34d399; margin-top: 6px;">✓ Rules copied! Paste in Firebase Console &gt; Firestore Database &gt; Rules and click Publish.</span>
        </div>
      `;
      const copyBtn = document.getElementById('copyEditorRulesBtn');
      const copyNotice = document.getElementById('editorCopyNotice');
      if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
          const rulesText = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() { return request.auth != null; }
    function isAdmin() {
      return isSignedIn() && (
        request.auth.uid == 'X5WFM4C88cecVqry3wr4luIIVAv1' ||
        (request.auth.token.email != null && (
          request.auth.token.email == 'softcrafta@gmail.com' ||
          request.auth.token.email == 'Softcrafta@gmail.com' ||
          request.auth.token.email.lower() == 'softcrafta@gmail.com'
        ))
      );
    }
    function isSuperOrDocAdmin() {
      return isAdmin() || (isSignedIn() && exists(/databases/$(database)/documents/admins/$(request.auth.uid)));
    }
    match /posts/{postId} {
      allow get: if (resource.data.status == 'published') || isSuperOrDocAdmin() || (isSignedIn() && resource.data.authorId == request.auth.uid);
      allow list: if (resource.data.status == 'published') || isAdmin() || (isSignedIn() && resource.data.authorId == request.auth.uid);
      allow create: if isSuperOrDocAdmin() || (isSignedIn() && incoming().authorId == request.auth.uid);
      allow update: if isSuperOrDocAdmin() || (isSignedIn() && resource.data.authorId == request.auth.uid) || (resource.data.status == 'published' && incoming().diff(resource.data).affectedKeys().hasOnly(['views', 'lastViewedAt']) && incoming().views is number && incoming().views >= 0 && incoming().views == resource.data.views + 1 && incoming().lastViewedAt is timestamp);
      allow delete: if isSuperOrDocAdmin() || (isSignedIn() && resource.data.authorId == request.auth.uid);
    }
    match /posts/{postId}/viewers/{visitorId} {
      allow get: if true;
      allow create: if request.resource.data.viewedAt is timestamp && request.resource.data.keys().hasOnly(['viewedAt']);
      allow update: if resource.data.viewedAt is timestamp && request.time > resource.data.viewedAt + duration.value(1, 'd') && request.resource.data.viewedAt is timestamp && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['viewedAt']);
      allow delete: if isSuperOrDocAdmin();
    }
    match /anime/{animeId} {
      allow get, list: if resource.data.visibility == 'published' || isSuperOrDocAdmin();
      allow create, update, delete: if isSuperOrDocAdmin();
    }
    match /categories/{categoryId} { allow get, list: if true; allow create, update, delete: if isSuperOrDocAdmin(); }
    match /contacts/{contactId} { allow create: if true; allow get, list, update, delete: if isSuperOrDocAdmin(); }
    match /admins/{adminUid} {
      allow get: if isSignedIn() && (request.auth.uid == adminUid || isSuperOrDocAdmin());
      allow list: if isSuperOrDocAdmin();
      allow create, update: if isSignedIn() && (request.auth.uid == 'X5WFM4C88cecVqry3wr4luIIVAv1' || request.auth.uid == adminUid || isSuperOrDocAdmin());
      allow delete: if isSuperOrDocAdmin();
    }
  }
}`;
          try {
            await navigator.clipboard.writeText(rulesText);
            if (copyNotice) copyNotice.style.display = 'block';
            copyBtn.textContent = '✓ Copied!';
          } catch (e) {
            alert("Please copy rules from Admin Panel -> Settings tab.");
          }
        });
      }
      feedbackEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      const errorCode = error?.code ? ` [${error.code}]` : '';
      showFeedback(feedbackEl, `Publishing failed${errorCode}: ${error.message}`, "error");
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = editingPostId ? "Save Changes" : "Publish Article";
  }
}

async function findAvailablePostSlug(baseSlug, currentPostId) {
  const base = normalizeArticleSlug(baseSlug);

  for (let suffix = 1; suffix < 10000; suffix += 1) {
    const suffixText = suffix === 1 ? '' : `-${suffix}`;
    const candidate = suffix === 1
      ? base
      : `${base.slice(0, 200 - suffixText.length).replace(/-+$/g, '')}${suffixText}`;
    const slugQuery = query(
      collection(db, 'posts'),
      where('slug', '==', candidate),
      limit(2)
    );
    const matches = await getDocs(slugQuery);
    if (!matches.docs.some(post => post.id !== currentPostId)) {
      return candidate;
    }
  }

  throw new Error('No available article slug could be generated.');
}

function showFeedback(el, msg, type) {
  if (!el) return;
  el.className = `form-feedback ${type}`;
  el.textContent = msg;
  el.style.display = 'block';
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

initAdminEditor();
