import { getAdminServices } from './firebase-admin.js';

export async function authorizeAdminRequest(req, getServices = getAdminServices) {
  const tokenMatch = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  if (!tokenMatch) {
    return { authorized: false, status: 401, message: 'Authentication required.' };
  }

  let services;
  try {
    services = getServices();
  } catch {
    return { authorized: false, status: 500, message: 'Admin authentication is not configured on the server.' };
  }

  let decodedToken;
  try {
    decodedToken = await services.auth.verifyIdToken(tokenMatch[1], true);
  } catch {
    return { authorized: false, status: 401, message: 'Authentication required.' };
  }

  let adminDocument;
  try {
    adminDocument = await services.firestore.collection('admins').doc(decodedToken.uid).get();
  } catch {
    return { authorized: false, status: 500, message: 'Could not verify admin authorization.' };
  }

  if (!adminDocument.exists || adminDocument.data()?.role !== 'admin') {
    return { authorized: false, status: 403, message: 'Admin access required.' };
  }

  return { authorized: true, services, uid: decodedToken.uid };
}
