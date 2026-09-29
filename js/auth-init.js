import { getAuth } from 'firebase/auth';
import { app, isConfigured, setAuthInstanceForDiagnostics } from './firebase-init.js';

let authInstance = null;
if (isConfigured && app) {
  try {
    authInstance = getAuth(app);
    setAuthInstanceForDiagnostics(authInstance);
  } catch (error) {
    console.error('Firebase Authentication initialization failed:', error);
  }
}

export const auth = authInstance;
