import { 
  collection, 
  doc, 
  getDoc, 
  addDoc, 
  updateDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { db, isConfigured, handleFirestoreError } from './firebase-init.js';
import { requireAdminAuth, verifyAdminStatus } from './auth.js';
import { auth } from './firebase-init.js';

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
 * Direct Image URL Setup (No Firebase Storage)
 * Supports entering any valid web image URL and saves it directly to Firestore.
 * Allows publishing with or without an image URL.
 */
function setupCoverImageUrl() {
  const urlInput = document.getElementById('coverUrlInput');
  const previewImg = document.getElementById('coverPreview');
  const placeholder = document.getElementById('coverPlaceholder');
  const actions = document.getElementById('coverActions');
  const clearBtn = document.getElementById('clearCoverBtn');

  if (!urlInput) return;

  function updatePreview(url) {
    const trimmed = (url || '').trim();
    uploadedCoverUrl = trimmed;

    if (trimmed) {
      let parsedUrl;
      try {
        parsedUrl = new URL(trimmed);
      } catch {
        if (placeholder) {
          placeholder.style.display = 'block';
          placeholder.innerHTML = '<span style="color: #f59e0b;">Enter a complete image URL starting with https://.</span>';
        }
        if (previewImg) previewImg.style.display = 'none';
        if (actions) actions.style.display = 'flex';
        return;
      }

      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        if (placeholder) {
          placeholder.style.display = 'block';
          placeholder.innerHTML = '<span style="color: #f59e0b;">The image URL must start with http:// or https://.</span>';
        }
        if (previewImg) previewImg.style.display = 'none';
        if (actions) actions.style.display = 'flex';
        return;
      }

      if (previewImg) {
        previewImg.src = trimmed;
        previewImg.style.display = 'block';
        previewImg.onload = () => {
          if (placeholder) placeholder.style.display = 'none';
          if (actions) actions.style.display = 'flex';
        };
        previewImg.onerror = () => {
          // If image fails to load, still display the link, show subtle warning
          console.warn("Could not preview image from:", trimmed);
          if (placeholder) {
            placeholder.style.display = 'block';
            placeholder.innerHTML = `<span style="color: #f59e0b;">This URL did not return an image. Use the direct image address, not a page or search-result URL.</span>`;
          }
          if (actions) actions.style.display = 'flex';
        };
      }
      if (actions) actions.style.display = 'flex';
      if (placeholder) placeholder.style.display = 'none';
    } else {
      if (previewImg) {
        previewImg.src = '';
        previewImg.style.display = 'none';
      }
      if (placeholder) {
        placeholder.style.display = 'block';
        placeholder.innerHTML = `
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin: 0 auto 6px auto; opacity: 0.6; display: block;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
          <span>No cover image selected. Image preview appears here when URL is entered.</span>
        `;
      }
      if (actions) actions.style.display = 'none';
    }
  }

  urlInput.addEventListener('input', (e) => {
    updatePreview(e.target.value);
  });

  urlInput.addEventListener('change', (e) => {
    updatePreview(e.target.value);
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      urlInput.value = '';
      updatePreview('');
    });
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
      const placeholder = document.getElementById('coverPlaceholder');
      const actions = document.getElementById('coverActions');

      if (urlInput) urlInput.value = post.coverImage;
      if (previewImg) {
        previewImg.src = post.coverImage;
        previewImg.style.display = 'block';
      }
      if (placeholder) placeholder.style.display = 'none';
      if (actions) actions.style.display = 'flex';
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
  const coverUrlInput = document.getElementById('coverUrlInput');
  const coverImage = (coverUrlInput ? coverUrlInput.value.trim() : '') || uploadedCoverUrl || '';

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
  if (coverImage) {
    try {
      const coverUrl = new URL(coverImage);
      if (!['http:', 'https:'].includes(coverUrl.protocol)) throw new Error();
    } catch {
      showFeedback(feedbackEl, "Please enter a direct image URL starting with http:// or https://.", "error");
      return;
    }
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

  const postPayload = {
    title,
    slug,
    excerpt,
    content,
    coverImage,
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

  try {
    if (editingPostId) {
      // If changing to published and wasn't published yet
      if (status === 'published') {
        postPayload.publishedAt = serverTimestamp();
      }
      // Update existing post
      await updateDoc(doc(db, 'posts', editingPostId), postPayload);
      showFeedback(feedbackEl, "Changes saved successfully.", "success");
    } else {
      // Create new post
      postPayload.createdAt = serverTimestamp();
      postPayload.publishedAt = status === 'published' ? serverTimestamp() : null;
      postPayload.views = 0;
      const newDoc = await addDoc(collection(db, 'posts'), postPayload);
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
