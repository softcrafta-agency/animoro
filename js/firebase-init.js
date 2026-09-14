import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getActiveFirebaseConfig, isConfigPlaceholder } from './firebase-config.js';

const config = getActiveFirebaseConfig();
export const isConfigured = !isConfigPlaceholder(config);

let appInstance = null;
let authInstance = null;
let dbInstance = null;

if (isConfigured) {
  try {
    appInstance = getApps().length === 0 ? initializeApp(config) : getApp();
    authInstance = getAuth(appInstance);
    dbInstance = getFirestore(appInstance);
  } catch (err) {
    console.error("Firebase initialization failed:", err);
  }
} else {
  console.info("Animoro: Firebase is running with placeholder credentials. Please set your credentials in js/firebase-config.js or in the Admin Setup panel.");
}

export const app = appInstance;
export const auth = authInstance;
export const db = dbInstance;

/**
 * Skill-compliant Firestore Error Handler
 */
export function handleFirestoreError(error, operationType, path) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid || null,
      email: auth?.currentUser?.email || null,
      emailVerified: auth?.currentUser?.emailVerified || null,
      isAnonymous: auth?.currentUser?.isAnonymous || null,
    },
    operationType,
    path
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  return errInfo;
}

/**
 * Validate Firestore connection
 */
export async function testConnection() {
  if (!db) {
    return { success: false, message: "Firebase is not configured yet with valid credentials." };
  }
  try {
    await getDocFromServer(doc(db, 'posts', 'connection-check'));
    return { success: true, message: "Connected to Cloud Firestore successfully." };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('the client is offline')) {
      return { success: false, message: "Firebase client is offline. Check your internet connection or Firebase setup." };
    }
    // "permission-denied" or "not-found" still means the network reached Firestore!
    if (msg.includes('permission-denied') || msg.includes('not-found')) {
      return { success: true, message: "Connected to Firebase project (Rules active)." };
    }
    return { success: false, message: msg };
  }
}

/**
 * Render configuration notice if Firebase is unconfigured
 */
export function renderConfigBanner() {
  const banner = document.getElementById('configBanner');
  if (!banner) return;
  if (!isConfigured) {
    banner.classList.remove('hidden');
    banner.innerHTML = `
      <span>⚡ <strong>Firebase Not Connected:</strong> Real publishing, views, and admin features require your Firebase credentials.</span>
      <a href="admin.html#settings" id="openSetupGuideBtn">Configure Firebase Credentials &rarr;</a>
    `;
  } else {
    banner.classList.add('hidden');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  renderConfigBanner();
});
