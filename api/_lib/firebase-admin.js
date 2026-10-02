import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

let adminApp;

export function getAdminServices() {
  if (!adminApp) {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson) {
      throw new Error('Firebase Admin is not configured.');
    }

    const serviceAccount = JSON.parse(serviceAccountJson);
    if (typeof serviceAccount.private_key === 'string') {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    adminApp = getApps()[0] || initializeApp({ credential: cert(serviceAccount) });
  }

  return {
    auth: getAuth(adminApp),
    firestore: getFirestore(adminApp),
  };
}
