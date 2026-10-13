import { uploadImageToStorage } from './firebase-storage-upload.js';

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const DEFAULT_MAX_BYTES = 3 * 1024 * 1024;

export class ImageUploadField {
  constructor(input, {
    kind = 'articles',
    fileName = file => file.name,
    slug = '',
    maxBytes = DEFAULT_MAX_BYTES,
    dropzone = null,
    fileInput = null,
    previewElement = null,
    containerParent = null,
    progressElement = null,
    replaceButton = null,
    removeButton = null,
    showActions = true,
    prepareFile = null,
    upload = uploadImageToStorage,
    onUploaded = null,
    onCleared = null,
  } = {}) {
    if (!input) throw new Error('An image URL input is required.');
    this.input = input;
    this.kind = kind;
    this.fileName = fileName;
    this.slug = slug;
    this.maxBytes = maxBytes;
    this.prepareFile = prepareFile;
    this.uploadImage = upload;
    this.onUploaded = onUploaded;
    this.onCleared = onCleared;
    this.busy = false;
    this.externalPreview = Boolean(previewElement);
    this.externalProgress = Boolean(progressElement);

    this.container = document.createElement('div');
    this.container.className = 'image-upload-field';
    this.container.dataset.imageUploadField = input.id || '';
    if (containerParent) containerParent.appendChild(this.container);
    else input.insertAdjacentElement('afterend', this.container);

    this.fileInput = fileInput || document.createElement('input');
    if (!fileInput) {
      this.fileInput.type = 'file';
      this.fileInput.accept = ACCEPTED_IMAGE_TYPES.join(',');
      this.fileInput.hidden = true;
      this.container.appendChild(this.fileInput);
    }
    this.dropzone = dropzone || this.createDropzone();
    this.preview = previewElement || document.createElement('img');
    if (!previewElement) {
      this.preview.className = 'image-upload-preview';
      this.preview.alt = 'Selected image preview';
      this.preview.hidden = true;
      this.container.appendChild(this.preview);
    }

    this.progress = progressElement || this.createProgress();
    this.status = document.createElement('div');
    this.status.className = 'image-upload-status';
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    this.container.appendChild(this.status);

    if (showActions || replaceButton || removeButton) this.createActions(replaceButton, removeButton, showActions);
    this.bindEvents();
    this.refresh();
  }

  createDropzone() {
    const dropzone = document.createElement('div');
    dropzone.className = 'image-upload-dropzone';
    dropzone.tabIndex = 0;
    dropzone.setAttribute('role', 'button');
    dropzone.setAttribute('aria-label', 'Upload image');

    const text = document.createElement('span');
    text.textContent = 'Drag & drop an image here, or ';
    const browse = document.createElement('button');
    browse.type = 'button';
    browse.className = 'image-upload-browse';
    browse.textContent = 'browse files';
    browse.addEventListener('click', event => {
      event.stopPropagation();
      this.fileInput.click();
    });
    text.appendChild(browse);
    dropzone.appendChild(text);
    this.container.appendChild(dropzone);
    return dropzone;
  }

  createProgress() {
    const progress = document.createElement('progress');
    progress.className = 'image-upload-progress';
    progress.max = 100;
    progress.value = 0;
    progress.hidden = true;
    progress.setAttribute('aria-label', 'Image upload progress');
    this.container.appendChild(progress);
    return progress;
  }

  createActions(replaceButton, removeButton, showActions) {
    const actions = document.createElement('div');
    actions.className = 'image-upload-actions';

    const replace = replaceButton || document.createElement('button');
    if (!replaceButton) {
      replace.type = 'button';
      replace.className = 'action-btn-sm';
      replace.textContent = 'Replace image';
    }
    replace.addEventListener('click', () => this.fileInput.click());

    const remove = removeButton || document.createElement('button');
    if (!removeButton) {
      remove.type = 'button';
      remove.className = 'action-btn-sm';
      remove.textContent = 'Remove image';
    }
    remove.addEventListener('click', () => {
      this.input.value = '';
      this.dispatchInputEvents();
      this.refresh();
      this.setStatus('Image URL cleared. Stored image files are not deleted.', 'success');
      this.onCleared?.();
    });

    if (showActions || replaceButton) actions.appendChild(replace);
    if (showActions || removeButton) actions.appendChild(remove);
    this.container.appendChild(actions);
  }

  bindEvents() {
    this.fileInput.addEventListener('change', event => {
      const file = event.currentTarget.files?.[0];
      if (file) this.upload(file);
      event.currentTarget.value = '';
    });

    this.dropzone.addEventListener('click', event => {
      if (event.target.closest('button')) return;
      if (!this.fileInput.disabled) this.fileInput.click();
    });
    this.dropzone.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.fileInput.click();
      }
    });
    this.dropzone.addEventListener('dragover', event => {
      event.preventDefault();
      this.dropzone.classList.add('dragover');
    });
    this.dropzone.addEventListener('dragleave', event => {
      if (!this.dropzone.contains(event.relatedTarget)) this.dropzone.classList.remove('dragover');
    });
    this.dropzone.addEventListener('drop', event => {
      event.preventDefault();
      this.dropzone.classList.remove('dragover');
      const file = event.dataTransfer?.files?.[0];
      if (file) this.upload(file);
    });

    this.input.addEventListener('input', () => this.refresh());
    this.preview.addEventListener('load', () => {
      if (this.status.dataset.state === 'error') this.setStatus('', '');
    });
    this.preview.addEventListener('error', () => {
      if (this.input.value.trim()) this.setStatus('Could not load a preview for this image URL.', 'error');
    });
  }

  async upload(file) {
    if (this.busy) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      this.setStatus('Choose a JPG, PNG, or WebP image.', 'error');
      return;
    }
    if (file.size > this.maxBytes) {
      this.setStatus(`Image files must be ${this.maxBytes === DEFAULT_MAX_BYTES ? '3 MB' : `${Math.round(this.maxBytes / 1024 / 1024)} MB`} or smaller.`, 'error');
      return;
    }

    this.busy = true;
    this.fileInput.disabled = true;
    this.progress.value = 0;
    this.progress.hidden = false;
    this.setStatus('Preparing image…', 'info');

    try {
      const prepared = this.prepareFile ? await this.prepareFile(file) : { blob: file, fileName: this.fileName(file) };
      if (!prepared?.blob || !ACCEPTED_IMAGE_TYPES.includes(prepared.blob.type)) {
        throw new Error('The prepared image must be a PNG, JPEG, or WebP file.');
      }
      if (prepared.blob.size > DEFAULT_MAX_BYTES) {
        throw new Error('The prepared image exceeds the 3 MB upload limit.');
      }

      this.setStatus('Uploading image…', 'info');
      if (this.externalProgress) this.progress.hidden = false;
      const url = await this.uploadImage(prepared.blob, {
        kind: this.kind,
        fileName: prepared.fileName || this.fileName(file),
        slug: typeof this.slug === 'function' ? this.slug() : this.slug,
        onProgress: percent => {
          this.progress.value = percent;
          this.setStatus(`Uploading image… ${percent}%`, 'info');
        },
      });
      this.input.value = url;
      this.dispatchInputEvents();
      this.refresh();
      this.setStatus('Image uploaded successfully.', 'success');
      this.onUploaded?.(url, file);
    } catch (error) {
      this.setStatus(error?.message || 'Image upload failed. Please retry.', 'error');
    } finally {
      this.busy = false;
      this.fileInput.disabled = false;
      this.progress.hidden = true;
    }
  }

  dispatchInputEvents() {
    this.input.dispatchEvent(new Event('input', { bubbles: true }));
    this.input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  setStatus(message, state) {
    this.status.textContent = message;
    this.status.dataset.state = state;
  }

  refresh() {
    const url = this.input.value.trim();
    if (!url) {
      this.preview.removeAttribute('src');
      if (!this.externalPreview) this.preview.hidden = true;
      if (this.status.dataset.state === 'error') this.setStatus('', '');
      return;
    }
    this.preview.src = url;
    if (!this.externalPreview) this.preview.hidden = false;
  }
}
