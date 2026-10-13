import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { auth } from './auth-init.js';
import { storage } from './firebase-init.js';
import { createFirebaseStorageUploader } from './firebase-storage-upload-core.js';

export { createFirebaseStorageUploader };

export const uploadImageToStorage = createFirebaseStorageUploader({
  storage,
  getCurrentUser: () => auth?.currentUser,
  ref,
  uploadBytesResumable,
  getDownloadURL,
});
