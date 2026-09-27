import { 
  collection, 
  doc, 
  getDoc, 
  addDoc, 
  updateDoc, 
  serverTimestamp,
  deleteField 
} from 'firebase/firestore';
import { db, isConfigured, handleFirestoreError } from './firebase-init.js';
import { requireAdminAuth, verifyAdminStatus } from './auth.js';
import { auth } from './firebase-init.js';

let currentAdminUser = null;
let editingPostId = null;
let postTags = [];
let uploadedCoverUrl = '';
let currentUploadedCoverData = null;
let currentCoverMode = 'upload';
let existingCoverData = null;
let userRequestedCoverRemoval = false;
const FIRESTORE_SAFE_DOCUMENT_LIMIT_BYTES = 900 * 1024;
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const COVER_MAX_DIMENSION = 1600;

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
    }
  });
}

function setupFormControls() {
  // Title -> Slug auto-generate
  const titleInput = document.getElementById('postTitle');
  const slugInput = document.getElementById('postSlug');

  if (titleInput && slugInput) {
    titleInput.addEventListener('input', () => {
      if (!editingPostId) {
        slugInput.value = generateSlug(titleInput.value);
      }
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

  // Rich Text Editor Toolbar Buttons
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const cmd = btn.getAttribute('data-cmd');
      const val = btn.getAttribute('data-val') || null;

      if (cmd === 'createLink') {
        const url = prompt('Enter link URL:');
        if (url) document.execCommand(cmd, false, url);
      } else if (cmd === 'insertImage') {
        const url = prompt('Enter image URL:');
        if (url) document.execCommand(cmd, false, url);
      } else if (cmd === 'formatBlock') {
        document.execCommand(cmd, false, val);
      } else {
        document.execCommand(cmd, false, null);
      }
    });
  });

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
      if (statusSelect) statusSelect.value = 'draft';
      handlePostSubmit(e);
    });
  }
}

function generateSlug(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function addTag(tag) {
  const clean = tag.replace(/^#/, '').trim();
  if (clean && !postTags.includes(clean)) {
    postTags.push(clean);
    renderTagChips();
  }
}

function removeTag(tag) {
  postTags = postTags.filter(t => t !== tag);
  renderTagChips();
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

/**
 * Direct URL + Drag-and-drop upload support for cover images.
 * Uploaded images are compressed to WebP in-browser and stored in Firestore data.
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

      currentUploadedCoverData = await compressCoverImage(file);
      uploadedCoverUrl = currentUploadedCoverData.dataUrl;
      userRequestedCoverRemoval = false;
      currentCoverMode = 'upload';
      syncMode('upload');

      if (previewImg) {
        previewImg.src = currentUploadedCoverData.dataUrl;
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
        currentUploadedCoverData = null;
        uploadedCoverUrl = (urlInput && urlInput.value.trim()) || '';
      } else {
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

    const dataUrl = await blobToDataURL(blob);
    const candidate = {
      dataUrl,
      type: 'image/webp',
      name: getWebpFilename(file.name),
      size: blob.size,
      width: targetWidth,
      height: targetHeight,
    };

    const estimatedDocBytes = estimatePayloadSize({
      coverImage: dataUrl,
      coverImageType: 'image/webp',
      coverImageName: candidate.name,
      coverImageSize: blob.size,
      coverImageWidth: targetWidth,
      coverImageHeight: targetHeight,
      coverImageSource: 'upload',
      title: 'temp',
      slug: 'temp',
      excerpt: 'temp',
      content: 'temp',
      authorName: 'temp',
      status: 'draft',
    });

    if (blob.size <= 260 * 1024 && estimatedDocBytes <= FIRESTORE_SAFE_DOCUMENT_LIMIT_BYTES) {
      return candidate;
    }

    bestCandidate = candidate;
    quality -= 0.08;
  }

  if (!bestCandidate) {
    throw new Error('Compression failed. Please try a smaller image.');
  }

  const estimatedDocBytes = estimatePayloadSize({
    coverImage: bestCandidate.dataUrl,
    coverImageType: 'image/webp',
    coverImageName: bestCandidate.name,
    coverImageSize: bestCandidate.size,
    coverImageWidth: bestCandidate.width,
    coverImageHeight: bestCandidate.height,
    coverImageSource: 'upload',
    title: 'temp',
    slug: 'temp',
    excerpt: 'temp',
    content: 'temp',
    authorName: 'temp',
    status: 'draft',
  });

  if (estimatedDocBytes > FIRESTORE_SAFE_DOCUMENT_LIMIT_BYTES) {
    throw new Error('Image is too large to store with this article. Please choose a smaller image.');
  }

  return bestCandidate;
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
    reader.onerror = () => reject(new Error('Could not prepare the image for saving.'));
    reader.readAsDataURL(blob);
  });
}

function estimatePayloadSize(payload) {
  return new Blob([JSON.stringify(payload)]).size;
}

function isFirestoreDocumentSafe(payload) {
  return estimatePayloadSize(payload) <= FIRESTORE_SAFE_DOCUMENT_LIMIT_BYTES;
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
      coverImage: currentUploadedCoverData.dataUrl,
      coverImageType: 'image/webp',
      coverImageName: currentUploadedCoverData.name,
      coverImageSize: currentUploadedCoverData.size,
      coverImageWidth: currentUploadedCoverData.width,
      coverImageHeight: currentUploadedCoverData.height,
    };
  }

  const urlValue = document.getElementById('coverUrlInput')?.value.trim() || uploadedCoverUrl || '';
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
    document.getElementById('postAuthor').value = post.authorName || '';
    document.getElementById('postStatus').value = post.status || 'draft';
    document.getElementById('postFeatured').checked = !!post.featured;
    document.getElementById('postFeaturedOrder').value = post.featuredOrder || 1;

    const editorArea = document.getElementById('richEditorArea');
    if (editorArea) editorArea.innerHTML = post.content || '';

    if (post.coverImage) {
      uploadedCoverUrl = post.coverImage;
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
  } catch (err) {
    handleFirestoreError(err, 'get', `posts/${postId}`);
    alert("Could not load post details: " + err.message);
  }
}

async function handlePostSubmit(e) {
  e.preventDefault();
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
  const slug = document.getElementById('postSlug').value.trim() || generateSlug(title);
  let excerpt = document.getElementById('postExcerpt').value.trim();
  const category = document.getElementById('postCategory').value;
  const authorName = document.getElementById('postAuthor').value.trim() || 'Animoro Editor';
  const status = document.getElementById('postStatus').value;
  const featured = document.getElementById('postFeatured').checked;
  const featuredOrder = parseInt(document.getElementById('postFeaturedOrder').value, 10) || 1;
  const content = document.getElementById('richEditorArea').innerHTML.trim();
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
  if (selectedCover.mode === 'url' && !isValidCoverValue(coverImage)) {
    showFeedback(feedbackEl, "Please enter a direct image URL starting with http:// or https://.", "error");
    return;
  }

  if (selectedCover.mode === 'upload' && !coverImage.startsWith('data:image/')) {
    showFeedback(feedbackEl, "Please choose a valid PNG, JPG, JPEG, or WEBP image to upload.", "error");
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
  submitBtn.textContent = editingPostId ? "Saving changes..." : "Publishing article...";

  const articlePayload = {
    title,
    slug,
    excerpt,
    content,
    category,
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
    articlePayload.coverImage = selectedCover.coverImage;
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
    ...(status === 'published' ? { publishedAt: serverTimestamp() } : { publishedAt: null })
  };

  const estimatedSize = estimatePayloadSize(finalDocumentPayload);
  if (estimatedSize > FIRESTORE_SAFE_DOCUMENT_LIMIT_BYTES) {
    showFeedback(feedbackEl, "Image is too large to store with this article. Please choose a smaller image.", "error");
    return;
  }

  try {
    if (editingPostId) {
      if (status === 'published') {
        finalDocumentPayload.publishedAt = serverTimestamp();
      }
      await updateDoc(doc(db, 'posts', editingPostId), finalDocumentPayload);
      showFeedback(feedbackEl, "Changes saved successfully.", "success");
    } else {
      const newDoc = await addDoc(collection(db, 'posts'), finalDocumentPayload);
      editingPostId = newDoc.id;
      showFeedback(feedbackEl, status === 'published' ? "Article published successfully!" : "Draft saved successfully!", "success");
    }

    setTimeout(() => {
      window.location.href = 'admin.html#posts';
    }, 1200);

  } catch (error) {
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
      allow update: if isSuperOrDocAdmin() || (isSignedIn() && resource.data.authorId == request.auth.uid) || (resource.data.status == 'published' && incoming().diff(resource.data).affectedKeys().hasOnly(['views']) && incoming().views == resource.data.views + 1);
      allow delete: if isSuperOrDocAdmin() || (isSignedIn() && resource.data.authorId == request.auth.uid);
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

function showFeedback(el, msg, type) {
  if (!el) return;
  el.className = `form-feedback ${type}`;
  el.textContent = msg;
  el.style.display = 'block';
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

document.addEventListener('DOMContentLoaded', initAdminEditor);
