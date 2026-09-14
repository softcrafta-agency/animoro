const env = typeof import.meta !== 'undefined' ? import.meta.env : {};

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: env.VITE_FIREBASE_APP_ID || '',
};

export function getActiveFirebaseConfig() {
  return firebaseConfig;
}

export function isConfigPlaceholder(cfg = getActiveFirebaseConfig()) {
  return !cfg.apiKey || !cfg.projectId || !cfg.authDomain || !cfg.appId;
}
