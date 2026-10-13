import { watchAuthState } from './auth.js';
import { auth } from './auth-init.js';
import { isConfigured } from './firebase-init.js';

export function getPostAuthRedirect(defaultPath) {
  const requested = new URLSearchParams(window.location.search).get('redirect');
  if (!requested) return defaultPath;

  try {
    const target = new URL(requested, window.location.origin);
    if (
      target.origin !== window.location.origin ||
      target.pathname === '/login.html' ||
      target.pathname === '/register.html'
    ) {
      return defaultPath;
    }
    return `${target.pathname}${target.search}${target.hash}`;
  } catch (error) {
    console.warn('Ignoring invalid post-auth redirect URL:', error);
    return defaultPath;
  }
}

function showGuardError(message) {
  document.documentElement.classList.remove('auth-checking');
  const main = document.querySelector('main');
  if (!main) return;

  main.innerHTML = `
    <div class="container">
      <div class="empty-state" role="alert">
        <h1 class="section-title">Unable to verify your sign-in</h1>
        <p class="empty-state-desc">${message}</p>
        <a href="/login.html" class="btn-cta" style="margin-top:16px;">Go to login</a>
      </div>
    </div>
  `;
}

export async function requireAuthenticatedPage() {
  if (!isConfigured || !auth) {
    showGuardError('Authentication is unavailable right now. Please try again later.');
    return null;
  }

  try {
    await auth.authStateReady();
  } catch (error) {
    console.error('Could not resolve Firebase authentication state:', error);
    showGuardError('We could not verify your session. Please refresh the page or sign in again.');
    return null;
  }

  const user = auth.currentUser;
  if (user) {
    document.documentElement.classList.remove('auth-checking');
    watchAuthState((currentUser) => {
      if (!currentUser) {
        const requested = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        window.location.replace(`/login.html?redirect=${encodeURIComponent(requested)}`);
      }
    });
    return user;
  }

  const requested = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.replace(`/login.html?redirect=${encodeURIComponent(requested)}`);
  return null;
}
