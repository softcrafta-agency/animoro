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

  // Bootstrapped admin email check
  if (user.email && user.email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase()) {
    return true;
  }

  // Local admin override check if user marked themself in session during local testing
  const localAdmin = localStorage.getItem('animoro_admin_user');
  if (localAdmin === user.uid || localAdmin === user.email) {
    return true;
  }

  // Firestore admins collection check
  if (db) {
    try {
      const adminDoc = await getDoc(doc(db, 'admins', user.uid));
      if (adminDoc.exists() && adminDoc.data().role === 'admin') {
        return true;
      }
    } catch (e) {
      console.warn("Error checking admin doc:", e);
    }
  }

  return false;
}

/**
 * Protect admin pages by checking Firebase auth state.
 */
export function requireAdminAuth(onAuthorized = () => {}) {
  const isLoginPage = window.location.pathname.includes('admin-login.html');

  if (!isConfigured) {
    // If Firebase is not configured yet, show notification and allow previewing admin interface with guide
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
        if (isLoginPage) {
          window.location.href = 'admin.html';
        } else {
          onAuthorized(user);
        }
      } else {
        console.warn("User signed in but not authorized as admin:", user.email);
        if (!isLoginPage) {
          alert("Unauthorized: Your account (" + user.email + ") is not registered as an administrator.");
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
    // If it's the first time signing in with this email, allow bootstrapping if no admins exist
    if (db) {
      try {
        await setDoc(doc(db, 'admins', cred.user.uid), {
          email: cred.user.email,
          role: 'admin',
          createdAt: serverTimestamp()
        }, { merge: true });
        return cred.user;
      } catch (err) {
        console.warn("Could not bootstrap admin doc:", err);
      }
    }
    await signOut(auth);
    throw new Error("This account is not authorized as an Animoro administrator.");
  }
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
