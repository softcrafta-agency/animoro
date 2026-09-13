import { 
  collection, 
  doc, 
  getDoc, 
  addDoc, 
  updateDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { 
  ref, 
  uploadBytesResumable, 
  getDownloadURL 
} from 'firebase/storage';
import { db, storage, isConfigured, handleFirestoreError } from './firebase-init.js';
import { requireAdminAuth } from './auth.js';

let currentAdminUser = null;
let editingPostId = null;
let postTags = [];
let uploadedCoverUrl = '';

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

  // Cover Image File Upload (Firebase Storage)
  setupCoverImageUpload();

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
 * Real Firebase Storage Image Upload
 */
function setupCoverImageUpload() {
  const uploadBox = document.getElementById('coverUploadBox');
  const fileInput = document.getElementById('coverFileInput');
  const previewImg = document.getElementById('coverPreview');
  const urlInput = document.getElementById('coverUrlInput');
  const progressBar = document.getElementById('uploadProgressBar');
  const progressFill = document.getElementById('uploadProgressFill');

  if (!uploadBox || !fileInput) return;

  uploadBox.addEventListener('click', () => fileInput.click());

  uploadBox.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadBox.classList.add('dragover');
  });

  uploadBox.addEventListener('dragleave', () => uploadBox.classList.remove('dragover'));

  uploadBox.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadBox.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  });

  if (urlInput) {
    urlInput.addEventListener('input', (e) => {
      uploadedCoverUrl = e.target.value.trim();
      if (uploadedCoverUrl && previewImg) {
        previewImg.src = uploadedCoverUrl;
        previewImg.style.display = 'block';
      }
    });
  }

  function handleFileSelected(file) {
    // Validate file type & size (5MB max)
    if (!file.type.startsWith('image/')) {
      alert("Please select a valid image file (PNG, JPEG, WebP).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert("File size exceeds 5MB. Please choose a smaller image.");
      return;
    }

    if (!storage) {
      alert("Firebase Storage is not configured yet. You can paste an image URL directly below instead.");
      return;
    }

    // Real Firebase Storage upload
    const filename = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
    const storageRef = ref(storage, `covers/${filename}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    if (progressBar) progressBar.style.display = 'block';

    uploadTask.on('state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        if (progressFill) progressFill.style.width = `${progress}%`;
      },
      (error) => {
        console.error("Storage upload failed:", error);
        alert("Image upload failed: " + error.message);
        if (progressBar) progressBar.style.display = 'none';
      },
      async () => {
        const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
        uploadedCoverUrl = downloadUrl;
        if (urlInput) urlInput.value = downloadUrl;
        if (previewImg) {
          previewImg.src = downloadUrl;
          previewImg.style.display = 'block';
        }
        if (progressBar) progressBar.style.display = 'none';
      }
    );
  }
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
      if (urlInput) urlInput.value = post.coverImage;
      if (previewImg) {
        previewImg.src = post.coverImage;
        previewImg.style.display = 'block';
      }
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

  const title = document.getElementById('postTitle').value.trim();
  const slug = document.getElementById('postSlug').value.trim() || generateSlug(title);
  const excerpt = document.getElementById('postExcerpt').value.trim();
  const category = document.getElementById('postCategory').value;
  const authorName = document.getElementById('postAuthor').value.trim() || 'Animoro Editor';
  const status = document.getElementById('postStatus').value;
  const featured = document.getElementById('postFeatured').checked;
  const featuredOrder = parseInt(document.getElementById('postFeaturedOrder').value, 10) || 1;
  const content = document.getElementById('richEditorArea').innerHTML.trim();
  const coverImage = uploadedCoverUrl || document.getElementById('coverUrlInput').value.trim();

  if (!title) {
    showFeedback(feedbackEl, "Please enter an article title.", "error");
    return;
  }
  if (!content || content === '<br>') {
    showFeedback(feedbackEl, "Please enter article body content.", "error");
    return;
  }

  if (!isConfigured || !db) {
    showFeedback(feedbackEl, "Firebase is not configured yet with valid credentials. Please enter credentials in the Admin Setup panel first.", "error");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = editingPostId ? "Saving changes..." : "Publishing article...";

  const postPayload = {
    title,
    slug,
    excerpt,
    content,
    coverImage,
    category,
    tags: postTags,
    authorName,
    authorId: currentAdminUser?.uid || 'admin',
    status,
    featured,
    featuredOrder,
    updatedAt: serverTimestamp()
  };

  try {
    if (editingPostId) {
      // Update existing post
      await updateDoc(doc(db, 'posts', editingPostId), postPayload);
      showFeedback(feedbackEl, "Changes saved successfully.", "success");
    } else {
      // Create new post
      postPayload.createdAt = serverTimestamp();
      postPayload.publishedAt = serverTimestamp();
      postPayload.views = 0;
      const newDoc = await addDoc(collection(db, 'posts'), postPayload);
      editingPostId = newDoc.id;
      showFeedback(feedbackEl, "Article published successfully!", "success");
    }

    setTimeout(() => {
      window.location.href = 'admin.html#posts';
    }, 1500);

  } catch (error) {
    handleFirestoreError(error, editingPostId ? 'update' : 'create', 'posts');
    showFeedback(feedbackEl, "Publishing failed: " + error.message, "error");
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
