import { logoutUser, watchAuthState } from './auth.js';

function createAuthControls(container) {
  container.classList.add('header-user-menu');
  container.id = 'headerUserMenu';
  container.innerHTML = `
    <a href="/login.html" class="header-signin-btn" id="headerSignInBtn">
      <span>Sign in</span>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
        <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </a>
    <div class="header-account-actions" id="headerAccountActions" hidden>
      <span class="header-notification-bell" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-8 12h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
      <button type="button" class="header-avatar-button" id="headerAvatarButton" aria-label="Open profile menu" aria-haspopup="menu" aria-expanded="false">
        <img class="header-avatar-image" id="headerAvatarImage" alt="" hidden />
        <span class="header-avatar-fallback" id="headerAvatarFallback" aria-hidden="true">A</span>
      </button>
      <div class="header-user-dropdown" id="headerUserDropdown" role="menu" aria-label="Profile menu" hidden>
        <a href="/account.html" class="header-user-link" role="menuitem">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M20 21a8 8 0 0 0-16 0m8-10a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          <span>Profile</span>
        </a>
        <a href="/my-list.html" class="header-user-link" role="menuitem">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
          <span>Watch List</span>
        </a>
        <a href="/account.html#settings" class="header-user-link" role="menuitem">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8 4.7v-2.4l-2-.6a6.5 6.5 0 0 0-.6-1.4l1-1.8-1.7-1.7-1.8 1a6.5 6.5 0 0 0-1.4-.6l-.6-2h-2.4l-.6 2a6.5 6.5 0 0 0-1.4.6l-1.8-1L5 7l1 1.8a6.5 6.5 0 0 0-.6 1.4l-2 .6v2.4l2 .6a6.5 6.5 0 0 0 .6 1.4L5 17l1.7 1.7 1.8-1a6.5 6.5 0 0 0 1.4.6l.6 2h2.4l.6-2a6.5 6.5 0 0 0 1.4-.6l1.8 1 1.7-1.7-1-1.8a6.5 6.5 0 0 0 .6-1.4l2-.6Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
          <span>Settings</span>
        </a>
        <a href="/contact.html" class="header-user-link" role="menuitem">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M10 14 21 3m-6 0h6v6M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span>Report / Request</span>
        </a>
        <button type="button" id="headerLogoutBtn" class="header-user-link header-user-logout" role="menuitem">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M10 17l5-5-5-5m5 5H3m8-9h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span>Logout</span>
        </button>
        <p class="header-auth-feedback" id="headerAuthFeedback" role="status" hidden></p>
      </div>
    </div>
  `;
}

export function initializeAuthNavigation() {
  const actions = document.querySelector('.site-header .header-actions');
  if (!actions) return;

  let container = document.getElementById('headerUserMenu');
  if (!container) {
    container = document.createElement('div');
    actions.insertBefore(container, actions.firstChild);
    createAuthControls(container);
  } else if (!container.dataset.authNavInitialized) {
    createAuthControls(container);
  }

  if (container.dataset.authNavInitialized === 'true') return;
  container.dataset.authNavInitialized = 'true';

  const signInLink = container.querySelector('#headerSignInBtn');
  const accountActions = container.querySelector('#headerAccountActions');
  const avatarButton = container.querySelector('#headerAvatarButton');
  const avatarImage = container.querySelector('#headerAvatarImage');
  const avatarFallback = container.querySelector('#headerAvatarFallback');
  const dropdown = container.querySelector('#headerUserDropdown');
  const logoutButton = container.querySelector('#headerLogoutBtn');
  const feedback = container.querySelector('#headerAuthFeedback');

  const setMenuOpen = (open) => {
    dropdown.hidden = !open;
    avatarButton.setAttribute('aria-expanded', String(open));
  };

  const setAuthenticatedUser = (user) => {
    signInLink.hidden = Boolean(user);
    accountActions.hidden = !user;
    setMenuOpen(false);
    if (!user) return;

    const displayName = user.displayName || user.email || 'Animoro user';
    avatarFallback.textContent = displayName.trim().charAt(0).toUpperCase() || 'A';
    avatarImage.onerror = () => {
      avatarImage.hidden = true;
      avatarFallback.hidden = false;
    };
    if (user.photoURL) {
      avatarImage.src = user.photoURL;
      avatarImage.alt = `${displayName} profile photo`;
      avatarImage.hidden = false;
      avatarFallback.hidden = true;
    } else {
      avatarImage.removeAttribute('src');
      avatarImage.hidden = true;
      avatarFallback.hidden = false;
    }
    avatarButton.title = `Signed in as ${displayName}`;
  };

  avatarButton.addEventListener('click', () => {
    setMenuOpen(dropdown.hidden);
  });

  document.addEventListener('click', (event) => {
    if (!container.contains(event.target)) setMenuOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !dropdown.hidden) {
      setMenuOpen(false);
      avatarButton.focus();
    }
  });

  dropdown.querySelectorAll('a[role="menuitem"]').forEach((link) => {
    link.addEventListener('click', () => setMenuOpen(false));
  });

  logoutButton.addEventListener('click', async () => {
    logoutButton.disabled = true;
    feedback.hidden = true;
    try {
      await logoutUser();
      setMenuOpen(false);
    } catch (error) {
      console.error('Logout failed:', error);
      feedback.textContent = 'Could not log out. Please try again.';
      feedback.hidden = false;
    } finally {
      logoutButton.disabled = false;
    }
  });

  watchAuthState((user) => setAuthenticatedUser(user));
}

