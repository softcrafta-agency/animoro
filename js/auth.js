import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  fetchSignInMethodsForEmail,
  linkWithCredential,
  EmailAuthProvider,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db, isConfigured } from './firebase-init.js';
import { auth } from './auth-init.js';

export function getCurrentUser() {
  return auth?.currentUser || null;
}

export function watchAuthState(callback) {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

export async function ensureUserRecord(user, overrides = {}) {
  if (!user || !db || !isConfigured) return null;
  const uid = user.uid;
  const userRef = doc(db, 'users', uid);
  const profile = {
    uid,
    email: user.email || '',
    displayName: user.displayName || overrides.displayName || user.email || 'Animoro User',
    photoURL: user.photoURL || overrides.photoURL || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
  await setDoc(userRef, profile, { merge: true });
  return profile;
}

export async function registerWithEmail({ displayName, email, password }) {
  if (!isConfigured || !auth) {
    throw new Error('Firebase is not configured yet. Add the VITE_FIREBASE_* values in your environment and redeploy.');
  }

  const trimmedEmail = String(email || '').trim();
  const trimmedName = String(displayName || '').trim();
  if (!trimmedEmail || !password) {
    throw new Error('Email and password are required.');
  }
  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }

  const credential = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
  if (trimmedName) {
    await updateProfile(credential.user, { displayName: trimmedName });
  }
  await ensureUserRecord(credential.user, {
    displayName: trimmedName || credential.user.displayName || 'Animoro User',
    email: trimmedEmail,
    emailVerified: credential.user.emailVerified,
    authProvider: 'email-password',
  });

  if (!credential.user.emailVerified) {
    await sendEmailVerification(credential.user);
  }
  return credential.user;
}

export async function loginWithEmail(email, password) {
  if (!isConfigured || !auth) {
    throw new Error('Firebase is not configured yet. Add the VITE_FIREBASE_* values in your environment and redeploy.');
  }

  const user = await signInWithEmailAndPassword(auth, String(email || '').trim(), password);
  return user.user;
}

export async function loginWithGoogle({ syncProfile = true } = {}) {
  if (!isConfigured || !auth) {
    throw new Error('Firebase is not configured yet. Add the VITE_FIREBASE_* values in your environment and redeploy.');
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, provider);
  if (syncProfile) {
    await ensureUserRecord(result.user, {
      displayName: result.user.displayName || 'Animoro User',
      photoURL: result.user.photoURL || '',
      authProvider: 'google',
    });
  }
  return result.user;
}

export async function requestPasswordReset(email) {
  if (!isConfigured || !auth) {
    throw new Error('Firebase is not configured yet. Add the VITE_FIREBASE_* values in your environment and redeploy.');
  }
  await sendPasswordResetEmail(auth, String(email || '').trim());
}

export async function sendVerificationEmail(user = getCurrentUser()) {
  if (!user) return null;
  if (user.emailVerified) return user;
  await sendEmailVerification(user);
  return user;
}

export async function updateUserProfile({ displayName, photoURL }) {
  const user = getCurrentUser();
  if (!user || !auth) return null;
  const profile = {};
  if (displayName !== undefined) profile.displayName = displayName;
  if (photoURL !== undefined) profile.photoURL = photoURL;
  if (Object.keys(profile).length) {
    await updateProfile(user, profile);
  }
  await ensureUserRecord(user, profile);
  return user;
}

export async function linkEmailPasswordAccount({ email, password, currentPassword }) {
  const user = getCurrentUser();
  if (!user || !auth) {
    throw new Error('You must be signed in before linking an email/password account.');
  }

  const credential = EmailAuthProvider.credential(email, currentPassword || password);
  try {
    await linkWithCredential(user, credential);
    return user;
  } catch (error) {
    if (error?.code === 'auth/provider-already-linked' || error?.code === 'auth/email-already-in-use') {
      throw new Error('This email is already associated with another sign-in method.');
    }
    throw error;
  }
}

export async function getSignInMethods(email) {
  if (!auth) return [];
  return fetchSignInMethodsForEmail(auth, String(email || '').trim());
}

export async function syncUserProfile(user = getCurrentUser()) {
  if (!user) return null;
  return ensureUserRecord(user, {
    displayName: user.displayName || 'Animoro User',
    photoURL: user.photoURL || '',
    email: user.email || '',
    authProvider: user.providerData?.[0]?.providerId || 'unknown',
  });
}

/**
 * Check if the given authenticated user is authorized as an administrator.
 * Access is granted only when the Firestore admins/{uid} document exists
 * and contains role: 'admin'.
 */
export async function verifyAdminStatus(user) {
  if (!user || !db) return false;

  try {
    const adminDoc = await getDoc(doc(db, 'admins', user.uid));
    return adminDoc.exists() && adminDoc.data()?.role === 'admin';
  } catch (e) {
    console.warn('Error checking admin doc:', e);
    return false;
  }
}

/**
 * Ensures the admin document exists in Firestore for the authorized admin.
 */
export async function ensureAdminRecord(user) {
  if (!db || !user) return;
  try {
    await setDoc(doc(db, 'admins', user.uid), {
      email: user.email,
      role: 'admin',
      lastLoginAt: serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.warn("Could not sync admin document in Firestore:", err);
  }
}

/**
 * Protect admin pages by checking Firebase auth state.
 */
export function requireAdminAuth(onAuthorized = () => {}) {
  const isLoginPage = window.location.pathname.includes('admin-login.html');

  if (!isConfigured) {
    console.warn("Firebase not configured. Admin panel will operate in setup/guidance mode.");
    onAuthorized(null);
    return;
  }

  if (!auth) {
    if (!isLoginPage) {
      window.location.href = 'admin-login.html';
    }
    return;
  }

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      const isAdmin = await verifyAdminStatus(user);
      if (isAdmin) {
        // Ensure Firestore admin record exists before proceeding with queries
        await ensureAdminRecord(user);

        if (isLoginPage) {
          window.location.href = 'admin.html';
        } else {
          onAuthorized(user);
        }
      } else {
        console.warn("User signed in but not authorized as admin:", user.email);
        if (!isLoginPage) {
          alert("Unauthorized: Your account (" + user.email + ") is not registered as an administrator in the Firestore 'admins' collection.");
          await signOut(auth);
          window.location.href = 'admin-login.html';
        }
      }
    } else {
      if (!isLoginPage) {
        window.location.href = 'admin-login.html';
      }
    }
  });
}

/**
 * Handle admin login form
 */
export async function loginAdmin(email, password) {
  if (!isConfigured || !auth) {
    throw new Error('Firebase is not configured yet. Add the VITE_FIREBASE_* values in your environment and redeploy.');
  }
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  const isAdmin = await verifyAdminStatus(cred.user);
  if (!isAdmin) {
    await signOut(auth);
    throw new Error(`This account (${cred.user.email}) is not authorized as an administrator. Add an 'admins/${cred.user.uid}' document with { role: 'admin' } in Firestore.`);
  }

  // Ensure the admin document is synced in Firestore
  await ensureAdminRecord(cred.user);
  return cred.user;
}

export async function logoutUser() {
  if (auth) {
    await signOut(auth);
  }
}

/**
 * Handle admin logout
 */
export async function logoutAdmin() {
  if (auth) {
    await signOut(auth);
  }
  window.location.href = 'admin-login.html';
}
