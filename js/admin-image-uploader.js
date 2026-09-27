import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, isConfigured } from './firebase-init.js';
import { requireAdminAuth } from './auth.js';

const MAX_FIRESTORE_DOC_BYTES = 900 * 1024;
const MAX_WIDTH = 1600;
const MAX_HEIGHT = 1200;

let selectedImages = [];
let articleId = '';

function setStatus(message, type = 'info') {
  const statusEl = document.getElementById('statusMessage');
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = `status-message visible ${type}`;
}

function clearStatus() {
  const statusEl = document.getElementById('statusMessage');
  if (!statusEl) return;
  statusEl.textContent = '';
  statusEl.className = 'status-message';
}

function buildAltFromFileName(fileName) {
  if (!fileName) return 'Article image';
  const sanitized = fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return sanitized || 'Article image';
}

function generateImagePreview(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the selected image.'));
    reader.readAsDataURL(file);
  });
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

function estimatePayloadSize(payload) {
  return new Blob([JSON.stringify(payload)]).size;
}

function validateImageFile(file) {
  if (!file) {
    return { valid: false, message: 'No file selected.' };
  }

  const mimeType = file.type || '';
  const fileName = (file.name || '').toLowerCase();
  const allowedMime = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  const allowedExt = /\.(png|jpg|jpeg|webp|gif)$/i;

  if (!allowedMime.includes(mimeType) && !allowedExt.test(fileName)) {
    return { valid: false, message: 'Unsupported file type. Please choose JPG, JPEG, PNG, WEBP, or GIF.' };
  }

  if (file.size > 20 * 1024 * 1024) {
    return { valid: false, message: 'File is too large. Please choose an image under 20 MB.' };
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
      reject(new Error('This image file is corrupted or unreadable.'));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not convert the processed image to a data URL.'));
    reader.readAsDataURL(blob);
  });
}

async function compressImageForFirestore(file) {
  const validation = validateImageFile(file);
  if (!validation.valid) {
    throw new Error(validation.message);
  }

  const sourceImage = await loadImageElement(file);
  const sourceWidth = sourceImage.naturalWidth || sourceImage.width;
  const sourceHeight = sourceImage.naturalHeight || sourceImage.height;
  const scale = Math.min(1, MAX_WIDTH / Math.max(sourceWidth, 1), MAX_HEIGHT / Math.max(sourceHeight, 1));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Your browser could not process this image.');
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(sourceImage, 0, 0, width, height);

  const targetMime = 'image/webp';
  let bestCandidate = null;

  for (let quality = 0.85; quality >= 0.42; quality -= 0.05) {
    const blob = await canvasToBlob(canvas, targetMime, quality);
    if (!blob) {
      continue;
    }

    const dataUrl = await blobToDataURL(blob);
    const candidate = {
      id: crypto.randomUUID ? crypto.randomUUID() : `img-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      fileName: file.name.replace(/\.[^.]+$/, '') + '.webp',
      mimeType: targetMime,
      data: dataUrl,
      width,
      height,
      blobSize: blob.size,
      docSize: estimatePayloadSize({
        articleId,
        fileName: file.name.replace(/\.[^.]+$/, '') + '.webp',
        mimeType: targetMime,
        data: dataUrl,
        width,
        height,
        createdAt: 'timestamp'
      })
    };

    if (candidate.docSize <= MAX_FIRESTORE_DOC_BYTES) {
      return candidate;
    }

    if (!bestCandidate || candidate.blobSize < bestCandidate.blobSize) {
      bestCandidate = candidate;
    }
  }

  if (bestCandidate && bestCandidate.docSize <= MAX_FIRESTORE_DOC_BYTES) {
    return bestCandidate;
  }

  if (bestCandidate) {
    throw new Error('Image is too large for Firestore. Please choose a smaller image.');
  }

  throw new Error('Compression failed. Please try a different image.');
}

function renderSelectedImages() {
  const container = document.getElementById('selectedImageList');
  const section = document.getElementById('selectedImageSection');
  const countBadge = document.getElementById('imageCountBadge');
  const uploadBtn = document.getElementById('uploadImagesBtn');

  if (!container || !section || !countBadge || !uploadBtn) return;

  container.innerHTML = '';
  countBadge.textContent = String(selectedImages.length);

  if (selectedImages.length === 0) {
    section.style.display = 'none';
    uploadBtn.disabled = true;
    return;
  }

  section.style.display = 'block';
  uploadBtn.disabled = false;

  selectedImages.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'selected-image-item';

    const previewWrap = document.createElement('div');
    previewWrap.className = 'selected-image-preview';

    const img = document.createElement('img');
    img.src = item.preview;
    img.alt = item.alt;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'selected-image-remove';
    removeBtn.title = 'Remove image';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => {
      selectedImages.splice(index, 1);
      renderSelectedImages();
    });

    previewWrap.appendChild(img);
    previewWrap.appendChild(removeBtn);

    const meta = document.createElement('div');
    meta.className = 'selected-image-meta';
    meta.innerHTML = `<div class="selected-image-name">${item.fileName}</div>`;

    const altInput = document.createElement('input');
    altInput.className = 'selected-image-alt';
    altInput.type = 'text';
    altInput.value = item.alt;
    altInput.placeholder = 'Alt text';
    altInput.addEventListener('input', (event) => {
      item.alt = event.target.value.trim() || buildAltFromFileName(item.fileName);
    });

    meta.appendChild(altInput);
    card.appendChild(previewWrap);
    card.appendChild(meta);
    container.appendChild(card);
  });
}

async function addFiles(fileList) {
  if (!fileList || fileList.length === 0) return;

  const files = Array.from(fileList);
  const queue = [];

  for (const file of files) {
    const validation = validateImageFile(file);
    if (!validation.valid) {
      setStatus(validation.message, 'error');
      continue;
    }

    try {
      const preview = await generateImagePreview(file);
      queue.push({
        file,
        fileName: file.name,
        preview,
        alt: buildAltFromFileName(file.name),
      });
    } catch (error) {
      setStatus(error.message || 'Could not preview the selected image.', 'error');
    }
  }

  if (queue.length === 0) return;
  selectedImages = [...selectedImages, ...queue];
  renderSelectedImages();
}

async function handleUpload() {
  if (!articleId) {
    setStatus('Article ID is missing. Please open this uploader from the article editor.', 'error');
    return;
  }

  if (!db || !isConfigured) {
    setStatus('Firebase is not configured yet. Add the project credentials and try again.', 'error');
    return;
  }

  if (!selectedImages.length) {
    setStatus('Please choose at least one image to insert.', 'error');
    return;
  }

  const uploadBtn = document.getElementById('uploadImagesBtn');
  if (uploadBtn) {
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Uploading...';
  }

  try {
    const savedImages = [];
    for (const item of selectedImages) {
      const compressed = await compressImageForFirestore(item.file);
      const createdImageRef = await addDoc(collection(db, 'imageAssets'), {
        articleId,
        fileName: compressed.fileName,
        mimeType: compressed.mimeType,
        data: compressed.data,
        width: compressed.width,
        height: compressed.height,
        createdAt: serverTimestamp(),
      });

      savedImages.push({
        id: createdImageRef.id,
        src: compressed.data,
        alt: item.alt || buildAltFromFileName(compressed.fileName),
      });
    }

    const payload = {
      type: 'INSERT_IMAGES',
      articleId,
      images: savedImages,
    };

    if ('BroadcastChannel' in window) {
      try {
        const channel = new BroadcastChannel('animoro-image-insert');
        channel.postMessage(payload);
        channel.close();
      } catch (error) {
        console.warn('BroadcastChannel image insert failed:', error);
      }
    }

    localStorage.setItem('animoro-image-insert-data', JSON.stringify(payload));
    setStatus('Images inserted successfully. You can close this tab.', 'success');

    if (window.opener) {
      try {
        window.opener.postMessage(payload, window.location.origin || '*');
      } catch (error) {
        console.warn('Window.postMessage fallback failed:', error);
      }
    }

    setTimeout(() => {
      const inputEl = document.getElementById('imageFileInput');
      if (inputEl) inputEl.value = '';
      selectedImages = [];
      renderSelectedImages();
    }, 1200);
  } catch (error) {
    console.error('Image upload failed:', error);
    setStatus(error?.message || 'Image upload failed. Please try again.', 'error');
  } finally {
    if (uploadBtn) {
      uploadBtn.disabled = false;
      uploadBtn.textContent = 'Insert Images';
    }
  }
}

function parseArticleIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('articleId') || '';
}

function setupEvents() {
  const closeBtn = document.getElementById('closeUploaderBtn');
  const chooseBtn = document.getElementById('chooseImagesBtn');
  const fileInput = document.getElementById('imageFileInput');
  const dropzone = document.getElementById('imageDropzone');
  const uploadBtn = document.getElementById('uploadImagesBtn');

  closeBtn?.addEventListener('click', () => window.close());
  chooseBtn?.addEventListener('click', () => fileInput?.click());
  uploadBtn?.addEventListener('click', handleUpload);

  fileInput?.addEventListener('change', (event) => {
    addFiles(event.target.files);
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
    });
  });

  ['dragleave', 'dragend', 'drop'].forEach((eventName) => {
    dropzone?.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone?.addEventListener('drop', (event) => {
    event.preventDefault();
    const files = event.dataTransfer?.files;
    addFiles(files);
  });
}

async function initUploader() {
  articleId = parseArticleIdFromUrl();

  requireAdminAuth(async (user) => {
    if (!user) {
      setStatus('Authentication required. Sign in again to upload article images.', 'error');
      return;
    }

    if (!articleId) {
      setStatus('Article ID is missing. Please open this page from the article editor.', 'error');
      return;
    }

    setStatus(`Uploading images for article ${articleId.slice(0, 8)}...`, 'info');
    setTimeout(() => clearStatus(), 1800);
  });

  setupEvents();
  renderSelectedImages();
}

document.addEventListener('DOMContentLoaded', initUploader);
