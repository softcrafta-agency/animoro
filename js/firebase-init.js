import { initializeApp, getApps, getApp } from 'firebase/app';
import { getStorage } from 'firebase/storage';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  getDocFromServer
} from 'firebase/firestore';
import { firebaseConfig, getActiveFirebaseConfig, isConfigPlaceholder } from './firebase-config.js';

const config = getActiveFirebaseConfig();
export const isConfigured = !isConfigPlaceholder(config);

let appInstance = null;
let dbInstance = null;
let authInstance = null;
let storageInstance = null;

if (isConfigured) {
  try {
    appInstance = getApps().length === 0 ? initializeApp(config) : getApp();
    try {
      dbInstance = initializeFirestore(appInstance, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager()
        })
      });
    } catch (cacheError) {
      console.warn('Persistent Firestore cache unavailable; using the default cache.', cacheError);
      dbInstance = getFirestore(appInstance);
    }
    if (firebaseConfig.storageBucket) {
      storageInstance = getStorage(appInstance, firebaseConfig.storageBucket);
    } else {
      console.error('Firebase Storage is not configured: set VITE_FIREBASE_STORAGE_BUCKET to the existing Firebase Storage bucket name.');
    }
  } catch (err) {
    console.error('Firebase initialization failed:', err);
  }
} else {
  console.info('Animoro: Firebase has not been configured with VITE_FIREBASE_* environment variables.');
}

export const app = appInstance;
export const db = dbInstance;
export const storage = storageInstance;

export function setAuthInstanceForDiagnostics(instance) {
  authInstance = instance;
}

export function handleFirestoreError(error, operationType, path) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: authInstance?.currentUser?.uid || null,
      email: authInstance?.currentUser?.email || null,
      emailVerified: authInstance?.currentUser?.emailVerified || null,
      isAnonymous: authInstance?.currentUser?.isAnonymous || null,
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  return errInfo;
}

export async function testConnection() {
  if (!db) {
    return { success: false, message: 'Firebase is not configured yet with valid environment variables.' };
  }

  try {
    await getDocFromServer(doc(db, 'posts', 'connection-check'));
    return { success: true, message: 'Connected to Cloud Firestore successfully.' };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('the client is offline')) {
      return { success: false, message: 'Firebase client is offline. Check your internet connection or Firebase setup.' };
    }
    if (msg.includes('permission-denied') || msg.includes('not-found')) {
      return { success: true, message: 'Connected to Firebase project (Rules active).' };
    }
    return { success: false, message: msg };
  }
}
