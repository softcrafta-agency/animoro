import { 
  collection, 
  getDocs, 
  doc, 
  deleteDoc, 
  updateDoc, 
  limit,
  orderBy, 
  query,
  serverTimestamp,
  where
} from 'firebase/firestore';
import { db, isConfigured, handleFirestoreError } from './firebase-init.js';
import { auth } from './auth-init.js';
import { verifyAdminStatus } from './auth.js';
import { formatDate, formatViews } from './ui.js';
import { getArticlePath, normalizeArticleSlug } from './article-url.js';
import { normalizeAnimeSlug } from './anime-url.js';
import { sanitizeArticleEditorHtml } from './article-content.js';
import { setupAdminBulkEdit } from './admin-bulk-edit.js';
import { createAdminTableSelection, openBulkDeleteConfirmation } from './admin-table-selection.js';

let adminPostsList = [];
let currentFilter = 'all';
let currentSearch = '';
let postsTableSelection = null;
let postsStatsCallback = () => {};
const POST_BULK_EDIT_FIELDS = [
  { key: 'title', label: 'Article Title', required: true, maxLength: 200 },
  { key: 'slug', label: 'URL Slug', required: true, maxLength: 200 },
  { key: 'excerpt', label: 'Summary / Excerpt', type: 'textarea', maxLength: 1000 },
  { key: 'content', label: 'Article Body (HTML)', type: 'html', required: true, rows: 12, hint: 'Article HTML is sanitized before it is saved.' },
  { key: 'coverImage', label: 'Cover Image URL', type: 'url', hint: 'Use a direct HTTP(S) image URL. Existing uploaded images are not deleted.' },
  { key: 'category', label: 'Category', type: 'select', options: [
    'Anime News', 'Reviews', 'Rankings', 'Guides', 'Recommendations', 'Manga', 'Seasonal Anime',
  ].map(value => ({ value, label: value })) },
  { key: 'animeTitle', label: 'Related Anime' },
  { key: 'animeSlug', label: 'Anime Page Slug' },
  { key: 'seoTitle', label: 'SEO Title', maxLength: 200 },
  { key: 'seoDescription', label: 'SEO Description', type: 'textarea', maxLength: 1000 },
  { key: 'authorName', label: 'Author Name' },
  { key: 'status', label: 'Status', type: 'select', options: [
    { value: 'published', label: 'Published' },
    { value: 'draft', label: 'Draft' },
  ] },
  { key: 'featured', label: 'Featured in Hero Slider', type: 'checkbox' },
  { key: 'featuredOrder', label: 'Slider Display Order', type: 'number', min: 1, max: 10, defaultValue: '1' },
  { key: 'tags', label: 'Tags (comma separated)' },
];

export async function loadAdminPosts(onStatsLoaded = () => {}) {
  postsStatsCallback = onStatsLoaded;
  const tbody = document.getElementById('adminPostsTableBody');
  if (!tbody) return;

  if (!isConfigured || !db) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 36px; color: var(--text-secondary);">
          Firebase has not been configured with VITE_FIREBASE_* environment variables. Add the values and redeploy.
        </td>
      </tr>
    `;
    onStatsLoaded({ total: 0, published: 0, draft: 0, featured: 0, totalViews: 0 });
    return;
  }

  tbody.innerHTML = `
    <tr>
      <td colspan="8" style="text-align: center; padding: 28px; color: var(--text-muted);">
        Fetching articles from Cloud Firestore...
      </td>
    </tr>
  `;

  try {
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);

    adminPostsList = snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));

    // Client-side sort by createdAt or publishedAt descending
    adminPostsList.sort((a, b) => {
      const getTime = (p) => {
        const ts = p.createdAt || p.publishedAt;
        if (!ts) return 0;
        return ts.toDate ? ts.toDate().getTime() : new Date(ts).getTime();
      };
      return getTime(b) - getTime(a);
    });

    // Calculate real stats
    const stats = {
      total: adminPostsList.length,
      published: adminPostsList.filter(p => p.status === 'published').length,
      draft: adminPostsList.filter(p => p.status === 'draft').length,
      featured: adminPostsList.filter(p => p.featured === true).length,
      totalViews: adminPostsList.reduce((sum, p) => sum + (p.views || 0), 0)
    };

    onStatsLoaded(stats, adminPostsList);
    renderPostsTable();
    renderFeaturedSliderManager();

  } catch (error) {
    handleFirestoreError(error, 'list', 'posts');
    try {
      onStatsLoaded({ total: 0, published: 0, draft: 0, featured: 0, totalViews: 0 }, []);
    } catch (e) {
      console.warn("Could not fire stats callback on error:", e);
    }
    const isPermError = error?.message?.includes('permission') || error?.code === 'permission-denied';
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 36px 20px; color: var(--text-primary);">
          <div style="max-width: 620px; margin: 0 auto;">
            <div style="font-size: 1.1rem; font-weight: 700; color: #f87171; margin-bottom: 8px;">
              ${isPermError ? "Firestore Permission Denied (firestore.rules)" : "Unable to load articles"}
            </div>
            <p style="color: var(--text-secondary); font-size: 0.9rem; line-height: 1.6; margin-bottom: 16px;">
              ${isPermError 
                ? "Your Firebase Firestore database rejected the read request for the 'posts' collection. To resolve this, ensure the project's <strong>firestore.rules</strong> are deployed in your Firebase Console (Rules tab)."
                : (error?.message || "An error occurred while fetching posts from Cloud Firestore.")}
            </p>
            <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
              <a href="#settings" class="btn-cta" style="padding: 8px 16px; font-size: 0.85rem;" onclick="document.querySelector('[data-tab=settings]')?.click()">
                Copy Firestore Rules in Settings &rarr;
              </a>
              <button class="action-btn-sm" style="padding: 8px 16px; font-size: 0.85rem;" onclick="window.location.reload()">
                Retry Connection
              </button>
            </div>
          </div>
        </td>
      </tr>
    `;
  }
}

export function setupPostsTableControls() {
  const openPostsBulkEdit = setupAdminBulkEdit({
    title: 'Bulk Edit Articles',
    fields: POST_BULK_EDIT_FIELDS,
    saveRecord: savePostBulkRecord,
    onComplete: async updatedIds => {
      await loadAdminPosts(postsStatsCallback);
      postsTableSelection?.removeSelectedIds(updatedIds);
    },
  });
  postsTableSelection = createAdminTableSelection({
    collectionName: 'posts',
    tbodyId: 'adminPostsTableBody',
    selectAllId: 'postsSelectAll',
    selectedCountId: 'postsSelectedCount',
    bulkEditButtonId: 'postsBulkEditButton',
    bulkDeleteButtonId: 'postsBulkDeleteButton',
    paginationId: 'postsPagination',
    onBulkDelete: ids => openBulkDeleteConfirmation({
      collectionName: 'posts',
      ids,
      label: 'articles',
      onComplete: async ({ deletedCount, missingCount, failed }) => {
        const failedIds = new Set(failed.map(item => item.id));
        const removedIds = new Set(ids.filter(id => !failedIds.has(id)));
        adminPostsList = adminPostsList.filter(post => !removedIds.has(post.id));
        renderPostsTable();
        renderFeaturedSliderManager();
        postsTableSelection?.clearSelection();
        return { deletedCount, missingCount };
      },
    }),
    onBulkEdit: ids => openPostsBulkEdit(adminPostsList.filter(post => ids.includes(post.id))),
  });
  const filterBtns = document.querySelectorAll('.post-filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.getAttribute('data-filter');
      postsTableSelection?.resetPage();
      renderPostsTable();
    });
  });

  const searchInput = document.getElementById('postsSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearch = e.target.value.toLowerCase().trim();
      postsTableSelection?.resetPage();
      renderPostsTable();
    });
  }
}

async function savePostBulkRecord(post, draft) {
  const user = auth?.currentUser;
  if (!db || !isConfigured || !user || !await verifyAdminStatus(user)) {
    throw new Error('Admin permission and a configured Firebase connection are required.');
  }
  const title = draft.title.trim();
  const slug = normalizeArticleSlug(draft.slug.trim() || title);
  if (!title || title.length > 200 || !slug || slug.length > 200) {
    throw new Error('Enter an article title and a valid URL slug (maximum 200 characters).');
  }
  let slugMatches;
  try {
    slugMatches = await getDocs(query(collection(db, 'posts'), where('slug', '==', slug), limit(2)));
  } catch (error) {
    handleFirestoreError(error, 'check-slug', 'posts');
    throw error;
  }
  if (slugMatches.docs.some(document => document.id !== post.id)) {
    throw new Error(`The slug "${slug}" is already used by another article.`);
  }

  const content = draft.content === (post.content || '')
    ? post.content
    : sanitizeArticleEditorHtml(draft.content).trim();
  if (!content || /data:image\//i.test(content)) {
    throw new Error('Article body must contain sanitized content without embedded data images.');
  }
  let coverImage = draft.coverImage.trim();
  if (coverImage) {
    let coverUrl;
    try {
      coverUrl = new URL(coverImage);
    } catch {
      throw new Error('Enter a complete cover image URL.');
    }
    if (!['http:', 'https:'].includes(coverUrl.protocol) || coverUrl.username || coverUrl.password) {
      throw new Error('Cover image URLs must use HTTP or HTTPS and cannot contain credentials.');
    }
    coverImage = coverUrl.toString();
  }
  const category = draft.category;
  if (
    category !== post.category &&
    !POST_BULK_EDIT_FIELDS.find(field => field.key === 'category').options.some(option => option.value === category)
  ) {
    throw new Error('Choose a valid article category.');
  }
  if (!['published', 'draft'].includes(draft.status)) throw new Error('Choose Published or Draft status.');
  const featuredOrder = Number(draft.featuredOrder);
  if (!Number.isInteger(featuredOrder) || featuredOrder < 1 || featuredOrder > 10) {
    throw new Error('Slider display order must be a whole number from 1 to 10.');
  }

  const plainText = new DOMParser().parseFromString(content, 'text/html').body.textContent || '';
  let excerpt = draft.excerpt.trim();
  if (!excerpt) {
    excerpt = plainText.substring(0, 200).trim();
    if (plainText.length > 200) excerpt += '...';
  }
  const payload = {
    title,
    slug,
    excerpt: excerpt.substring(0, 1000),
    content,
    coverImage,
    category,
    animeTitle: draft.animeTitle.trim(),
    animeSlug: draft.animeSlug.trim() ? normalizeAnimeSlug(draft.animeSlug.trim()) : '',
    seoTitle: draft.seoTitle.trim(),
    seoDescription: draft.seoDescription.trim(),
    authorName: draft.authorName.trim() || 'Animoro Editor',
    status: draft.status,
    featured: Boolean(draft.featured),
    featuredOrder,
    tags: draft.tags.split(',').map(tag => tag.trim().replace(/^#/, '')).filter(Boolean),
    updatedAt: serverTimestamp(),
    publishedAt: draft.status === 'published'
      ? (post.status === 'published' ? post.publishedAt || post.createdAt || serverTimestamp() : serverTimestamp())
      : null,
  };
  if (coverImage !== (post.coverImage || '')) {
    payload.coverImageType = coverImage ? 'image/url' : null;
    payload.coverImageName = null;
    payload.coverImageSize = null;
    payload.coverImageWidth = null;
    payload.coverImageHeight = null;
  }

  try {
    await updateDoc(doc(db, 'posts', post.id), payload);
  } catch (error) {
    handleFirestoreError(error, 'update', `posts/${post.id}`);
    throw error;
  }
  return payload;
}

export function renderPostsTable() {
  const tbody = document.getElementById('adminPostsTableBody');
  if (!tbody) return;

  let filtered = adminPostsList;

  if (currentFilter === 'published') {
    filtered = filtered.filter(p => p.status === 'published');
  } else if (currentFilter === 'draft') {
    filtered = filtered.filter(p => p.status === 'draft');
  } else if (currentFilter === 'featured') {
    filtered = filtered.filter(p => p.featured === true);
  }

  if (currentSearch) {
    filtered = filtered.filter(p => 
      (p.title || '').toLowerCase().includes(currentSearch) ||
      (p.category || '').toLowerCase().includes(currentSearch)
    );
  }

  if (filtered.length === 0) {
    postsTableSelection?.render([], () => document.createElement('tr'), 8, 'No articles match the current filter or search criteria.');
    if (!postsTableSelection) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text-muted);">No articles match the current filter or search criteria.</td></tr>';
    return;
  }

  const renderPostRow = post => {
    const isPublished = post.status === 'published';
    const articlePath = getArticlePath(post);
    const row = document.createElement('tr');
    row.dataset.id = post.id;
    row.innerHTML = `
        <td>
          <img class="table-thumb" src="${post.coverImage || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=120&q=80'}" alt="${post.title}" width="120" height="90" loading="lazy" decoding="async" />
        </td>
        <td>
          <div style="font-weight: 600; color: var(--text-primary); max-width: 280px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${post.title}
          </div>
          <div style="font-size: 0.75rem; color: var(--text-muted); font-family: var(--font-mono);">
            ${articlePath}
          </div>
        </td>
        <td>
          <span style="font-size: 0.8rem; font-weight: 600; color: var(--text-secondary);">${post.category || 'Anime'}</span>
        </td>
        <td>
          <span class="status-pill ${isPublished ? 'published' : 'draft'}">
            ${post.status || 'draft'}
          </span>
        </td>
        <td>
          <button class="action-btn-sm toggle-featured-btn" data-id="${post.id}" data-featured="${post.featured ? 'true' : 'false'}" title="Toggle Featured in Hero Slider">
            ${post.featured ? '⭐ Yes (# ' + (post.featuredOrder || 1) + ')' : '☆ No'}
          </button>
        </td>
        <td>
          <span style="font-family: var(--font-mono); font-weight: 600;">${formatViews(post.views)}</span>
        </td>
        <td>
          <span style="font-size: 0.8rem;">${formatDate(post.publishedAt || post.createdAt)}</span>
        </td>
        <td>
          <div class="table-actions">
            <a href="admin-post-editor.html?id=${post.id}" class="action-btn-sm" title="Edit Article">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
              Edit
            </a>
            ${isPublished ? `
              <a href="${articlePath}" target="_blank" class="action-btn-sm" title="View Published Article">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              </a>
            ` : ''}
            <button class="action-btn-sm delete delete-post-btn" data-id="${post.id}" data-title="${post.title}" title="Delete Article">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
    return row;
  };

  postsTableSelection?.render(filtered, renderPostRow, 8, 'No articles match the current filter or search criteria.');
  if (!postsTableSelection) tbody.replaceChildren(...filtered.map(renderPostRow));
  attachTableEventHandlers();
}

function attachTableEventHandlers() {
  // Delete buttons
  document.querySelectorAll('.delete-post-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      const title = e.currentTarget.getAttribute('data-title');
      openDeleteConfirmationModal(id, title);
    });
  });

  // Featured toggle
  document.querySelectorAll('.toggle-featured-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      const current = e.currentTarget.getAttribute('data-featured') === 'true';
      await toggleFeaturedStatus(id, !current);
    });
  });
}

async function toggleFeaturedStatus(id, newStatus) {
  if (!db) return;
  try {
    await updateDoc(doc(db, 'posts', id), {
      featured: newStatus,
      featuredOrder: newStatus ? 1 : 99
    });
    // Update local state
    const post = adminPostsList.find(p => p.id === id);
    if (post) {
      post.featured = newStatus;
      post.featuredOrder = newStatus ? 1 : 99;
    }
    renderPostsTable();
    renderFeaturedSliderManager();
  } catch (err) {
    handleFirestoreError(err, 'update', `posts/${id}`);
    alert("Could not update featured status. Check permissions.");
  }
}

export function renderFeaturedSliderManager() {
  const container = document.getElementById('featuredSliderManagerList');
  if (!container) return;

  const featured = adminPostsList
    .filter(p => p.featured === true)
    .sort((a, b) => (a.featuredOrder || 1) - (b.featuredOrder || 1));

  if (featured.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 32px 16px;">
        <h4 class="empty-state-title">No Articles in Hero Slider</h4>
        <p class="empty-state-desc">Click the ⭐ icon in the Posts table to add stories to the homepage slider.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = featured.map((post, idx) => `
    <div style="display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); margin-bottom: 10px;">
      <div style="display: flex; align-items: center; gap: 14px;">
        <span style="font-weight: 800; color: var(--accent-crimson); font-family: var(--font-display);">Slide ${idx + 1}</span>
        <img src="${post.coverImage || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=100&q=80'}" alt="${post.title}" width="50" height="36" loading="lazy" decoding="async" style="width: 50px; height: 36px; object-fit: cover; border-radius: var(--radius-sm);" />
        <div>
          <div style="font-weight: 600; color: var(--text-primary); font-size: 0.9rem;">${post.title}</div>
          <div style="font-size: 0.78rem; color: var(--text-muted);">${post.category || 'Anime'}</div>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 10px;">
        <button class="action-btn-sm toggle-featured-btn" data-id="${post.id}" data-featured="true" style="color: #ef4444; border-color: rgba(239,68,68,0.3);">
          Remove from Slider
        </button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.toggle-featured-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      await toggleFeaturedStatus(id, false);
    });
  });
}

/**
 * Delete confirmation modal
 */
function openDeleteConfirmationModal(postId, title) {
  const modal = document.getElementById('deletePostModal');
  const titleSpan = document.getElementById('deletePostModalTitle');
  const confirmBtn = document.getElementById('confirmDeletePostBtn');
  const cancelBtn = document.getElementById('cancelDeletePostBtn');

  if (!modal) {
    if (confirm(`Are you sure you want to delete "${title}"? This cannot be undone.`)) {
      executeDelete(postId);
    }
    return;
  }

  if (titleSpan) titleSpan.textContent = `"${title}"`;
  modal.classList.add('show');

  const onConfirm = async () => {
    confirmBtn.removeEventListener('click', onConfirm);
    cancelBtn.removeEventListener('click', onCancel);
    modal.classList.remove('show');
    await executeDelete(postId);
  };

  const onCancel = () => {
    confirmBtn.removeEventListener('click', onConfirm);
    cancelBtn.removeEventListener('click', onCancel);
    modal.classList.remove('show');
  };

  confirmBtn.addEventListener('click', onConfirm);
  cancelBtn.addEventListener('click', onCancel);
}

async function executeDelete(postId) {
  if (!db) return;
  try {
    await deleteDoc(doc(db, 'posts', postId));
    adminPostsList = adminPostsList.filter(p => p.id !== postId);
    postsTableSelection?.removeSelectedIds([postId]);
    renderPostsTable();
    renderFeaturedSliderManager();
  } catch (err) {
    handleFirestoreError(err, 'delete', `posts/${postId}`);
    alert("Delete failed. Make sure you have administrator permissions.");
  }
}
