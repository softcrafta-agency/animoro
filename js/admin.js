import { 
  collection, 
  getDocs, 
  addDoc, 
  query, 
  orderBy, 
  serverTimestamp 
} from 'firebase/firestore';
import { db, isConfigured, testConnection, handleFirestoreError } from './firebase-init.js';
import { getActiveFirebaseConfig } from './firebase-config.js';
import { requireAdminAuth, logoutAdmin } from './auth.js';
import { loadAdminPosts, setupPostsTableControls } from './admin-posts.js';
import { renderPerformanceChart } from './analytics.js';
import { formatDate, formatViews } from './home.js';

let currentAdmin = null;

async function initAdminDashboard() {
  requireAdminAuth(async (user) => {
    currentAdmin = user;
    updateAdminUserDisplay(user);
    setupTabs();
    setupPostsTableControls();
    setupCategoryManager();
    setupFirebaseSettings();

    const logoutBtn = document.getElementById('adminLogoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', logoutAdmin);
    }

    // Load real data from Firestore
    await refreshDashboardData();
  });
}

function updateAdminUserDisplay(user) {
  const emailEl = document.getElementById('adminUserEmail');
  if (emailEl) {
    emailEl.textContent = user ? user.email : 'Setup Mode';
  }
}

function setupTabs() {
  const navItems = document.querySelectorAll('.admin-nav-item');
  const tabPanes = document.querySelectorAll('.admin-tab-pane');
  const pageTitle = document.getElementById('adminViewTitle');

  function activateTab(tabId) {
    navItems.forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-tab') === tabId);
    });

    tabPanes.forEach(pane => {
      pane.style.display = pane.id === `tab-${tabId}` ? 'block' : 'none';
    });

    if (pageTitle) {
      const titles = {
        overview: 'Dashboard Overview',
        posts: 'Articles Management',
        categories: 'Categories Manager',
        slider: 'Featured Slider Manager',
        contacts: 'Contact Inquiries',
        settings: 'Firebase & System Settings'
      };
      pageTitle.textContent = titles[tabId] || 'Dashboard';
    }

    window.location.hash = tabId;
  }

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.getAttribute('data-tab');
      activateTab(tab);
    });
  });

  // Check initial hash
  const initialHash = window.location.hash.replace('#', '') || 'overview';
  activateTab(initialHash);
}

async function refreshDashboardData() {
  await loadAdminPosts((stats, posts) => {
    // Update KPI Cards with real Firestore data
    setKpiValue('kpiTotalPosts', stats.total);
    setKpiValue('kpiTotalViews', formatViews(stats.totalViews));
    setKpiValue('kpiPublished', stats.published);
    setKpiValue('kpiDrafts', stats.draft);
    setKpiValue('kpiFeatured', stats.featured);

    // Render Analytics Chart
    renderPerformanceChart('analyticsChartContainer', posts.filter(p => p.status === 'published'));

    // Render Top Performing Articles Table
    renderTopPerformingTable(posts);
  });

  loadCategories();
  loadContactMessages();
}

function setKpiValue(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val !== undefined ? val : '0';
}

function renderTopPerformingTable(posts) {
  const tbody = document.getElementById('topPerformingTableBody');
  if (!tbody) return;

  const published = posts
    .filter(p => p.status === 'published')
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 5);

  if (published.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 28px; color: var(--text-muted);">
          No published articles to display. Published articles will be ranked here by real reader views.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = published.map((post, idx) => `
    <tr>
      <td style="font-weight: 800; color: var(--accent-crimson);">#${idx + 1}</td>
      <td>
        <div style="font-weight: 600; color: var(--text-primary);">${post.title}</div>
      </td>
      <td>${post.category || 'Anime'}</td>
      <td style="font-family: var(--font-mono); font-weight: 700; color: #fff;">${formatViews(post.views)} views</td>
      <td>${formatDate(post.publishedAt || post.createdAt)}</td>
      <td><span class="status-pill published">Published</span></td>
    </tr>
  `).join('');
}

/**
 * Categories Manager
 */
function setupCategoryManager() {
  const addForm = document.getElementById('addCategoryForm');
  if (!addForm) return;

  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('newCategoryName');
    const descInput = document.getElementById('newCategoryDesc');
    const name = nameInput.value.trim();
    const desc = descInput.value.trim();

    if (!name) return;
    if (!db) {
      alert("Firebase is not connected yet.");
      return;
    }

    try {
      await addDoc(collection(db, 'categories'), {
        name,
        slug: name.toLowerCase().replace(/\s+/g, '-'),
        description: desc,
        createdAt: serverTimestamp()
      });
      nameInput.value = '';
      descInput.value = '';
      loadCategories();
      alert(`Category "${name}" added successfully.`);
    } catch (err) {
      handleFirestoreError(err, 'create', 'categories');
      alert("Could not add category: " + err.message);
    }
  });
}

async function loadCategories() {
  const tbody = document.getElementById('categoriesTableBody');
  if (!tbody || !db) return;

  try {
    const snap = await getDocs(collection(db, 'categories'));
    setKpiValue('kpiCategories', snap.size);

    if (snap.empty) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; padding: 24px; color: var(--text-muted);">
            No custom categories registered in Firestore yet.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = snap.docs.map(d => {
      const cat = d.data();
      return `
        <tr>
          <td style="font-weight: 600; color: var(--text-primary);">${cat.name}</td>
          <td style="font-family: var(--font-mono); font-size: 0.82rem; color: var(--text-muted);">${cat.slug}</td>
          <td>${cat.description || '—'}</td>
          <td>${formatDate(cat.createdAt)}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.warn("Could not load categories collection:", err);
  }
}

/**
 * Contact Inquiries Inbox
 */
async function loadContactMessages() {
  const tbody = document.getElementById('contactsTableBody');
  if (!tbody || !db) return;

  try {
    const q = query(collection(db, 'contacts'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);

    if (snap.empty) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 32px; color: var(--text-muted);">
            No inquiries received yet. Messages sent via contact.html will appear here.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = snap.docs.map(d => {
      const msg = d.data();
      return `
        <tr>
          <td><span style="font-size: 0.8rem;">${formatDate(msg.createdAt)}</span></td>
          <td style="font-weight: 600; color: var(--text-primary);">${msg.name}</td>
          <td><a href="mailto:${msg.email}" style="color: var(--accent-crimson);">${msg.email}</a></td>
          <td style="font-weight: 600;">${msg.subject || '—'}</td>
          <td style="max-width: 320px; font-size: 0.84rem; color: var(--text-secondary);">${msg.message}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.warn("Could not load contact messages:", err);
  }
}

/**
 * Firebase Settings & Live Tester
 */
function setupFirebaseSettings() {
  const activeCfg = getActiveFirebaseConfig();
  const testBtn = document.getElementById('testFirebaseBtn');
  const testResult = document.getElementById('testConnectionResult');
  const saveBtn = document.getElementById('saveCustomConfigBtn');

  // Populate config fields
  const fields = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
  fields.forEach(f => {
    const input = document.getElementById(`cfg_${f}`);
    if (input && activeCfg[f]) {
      input.value = activeCfg[f];
    }
  });

  if (testBtn) {
    testBtn.addEventListener('click', async () => {
      testResult.textContent = 'Testing connection to Cloud Firestore...';
      testResult.style.color = 'var(--text-muted)';
      const res = await testConnection();
      testResult.textContent = res.message;
      testResult.style.color = res.success ? '#34d399' : '#f87171';
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const newConfig = {};
      fields.forEach(f => {
        const input = document.getElementById(`cfg_${f}`);
        if (input) newConfig[f] = input.value.trim();
      });

      if (!newConfig.apiKey || !newConfig.projectId) {
        alert("Please provide at least apiKey and projectId.");
        return;
      }

      localStorage.setItem('animoro_firebase_config', JSON.stringify(newConfig));
      alert("Firebase credentials saved! Reloading application...");
      window.location.reload();
    });
  }
}

document.addEventListener('DOMContentLoaded', initAdminDashboard);
