import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  createUserWithEmailAndPassword
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, isConfigured } from './firebase-init.js';

export const BOOTSTRAP_ADMIN_EMAIL = 'softcrafta@gmail.com';

/**
 * Check if the given authenticated user is authorized as an administrator.
 */
export async function verifyAdminStatus(user) {
  if (!user) return false;

  // 1. Known admin UID check
  if (user.uid === 'X5WFM4C88cecVqry3wr4luIIVAv1') {
    return true;
  }

  // 2. Bootstrapped admin email check
  if (user.email && user.email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase()) {
    return true;
  }

  // 3. Firestore admins collection check
  if (db) {
    try {
      const adminDoc = await getDoc(doc(db, 'admins', user.uid));
      if (adminDoc.exists()) {
        const data = adminDoc.data();
        if (!data.role || data.role === 'admin') {
          return true;
        }
      }
    } catch (e) {
      console.warn("Error checking admin doc:", e);
    }
  }

  return false;
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
    throw new Error("Firebase is not configured yet with valid credentials. Please enter your Firebase configuration first.");
  }
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  const isAdmin = await verifyAdminStatus(cred.user);
  if (!isAdmin) {
    await signOut(auth);
    throw new Error(`This account (${cred.user.email}) is not authorized as an administrator. To grant admin access, add a document in Firestore under collection 'admins' with Document ID '${cred.user.uid}' and field { role: 'admin' }, or sign in using ${BOOTSTRAP_ADMIN_EMAIL}.`);
  }

  // Ensure the admin document is synced in Firestore
  await ensureAdminRecord(cred.user);
  return cred.user;
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
