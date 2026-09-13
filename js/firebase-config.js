/**
 * ANIMORO — Firebase Project Configuration
 * 
 * Replace the placeholder strings below with your real project credentials from the
 * Firebase Console (https://console.firebase.google.com):
 * 1. Open your Firebase Project.
 * 2. Click Project Settings (gear icon) > General.
 * 3. Scroll down to "Your apps" > Web apps (</>).
 * 4. Copy the values from firebaseConfig into this file.
 * 
 * NOTE: You can also dynamically enter your config in the Admin panel's
 * Firebase Setup tab, which stores it securely in your local browser session.
 */

export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

/**
 * Returns either the credentials from this file or any credentials
 * saved locally by the user through the Admin Setup tab.
 */
export function getActiveFirebaseConfig() {
  try {
    const saved = localStorage.getItem('animoro_firebase_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.apiKey && parsed.apiKey !== "YOUR_API_KEY" && parsed.projectId && parsed.projectId !== "YOUR_PROJECT_ID") {
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Could not read local config override:", e);
  }
  return firebaseConfig;
}

/**
 * Check if the active configuration is currently using placeholder values.
 */
export function isConfigPlaceholder(cfg = getActiveFirebaseConfig()) {
  return !cfg.apiKey || 
         cfg.apiKey === "YOUR_API_KEY" || 
         !cfg.projectId || 
         cfg.projectId === "YOUR_PROJECT_ID";
}
