const IMAGE_TYPES = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};
const IMAGE_KINDS = new Set(['covers', 'articles', 'upcoming']);
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export function createFirebaseStorageUploader({
  storage: storageInstance,
  getCurrentUser,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  createId = () => crypto.randomUUID(),
}) {
  return function upload(blob, { kind = 'articles', fileName, onProgress } = {}) {
    if (!storageInstance) {
      return Promise.reject(new Error('Firebase Storage is not initialized. Check VITE_FIREBASE_STORAGE_BUCKET and create or verify the bucket in Firebase Console.'));
    }
    if (!getCurrentUser()) {
      return Promise.reject(new Error('You must be signed in as an admin to upload images.'));
    }
    if (!(blob instanceof Blob) || !IMAGE_TYPES[blob.type]) {
      return Promise.reject(new Error('Only WebP, JPEG, and PNG images can be uploaded.'));
    }
    if (!blob.size || blob.size > MAX_IMAGE_BYTES) {
      return Promise.reject(new Error('Image files must be 3 MB or smaller.'));
    }
    if (!IMAGE_KINDS.has(kind)) {
      return Promise.reject(new Error('Unsupported image upload category.'));
    }

    const safeFileName = String(fileName || 'image')
      .replace(/[\\/\u0000-\u001f\u007f]/g, '_')
      .slice(0, 200);
    const objectPath = `images/${kind}/${createId()}.${IMAGE_TYPES[blob.type]}`;
    const imageRef = ref(storageInstance, objectPath);
    const task = uploadBytesResumable(imageRef, blob, {
      contentType: blob.type,
      cacheControl: 'public,max-age=31536000,immutable',
      customMetadata: { originalFileName: safeFileName },
    });

    return new Promise((resolve, reject) => {
      task.on('state_changed', snapshot => {
        if (typeof onProgress === 'function' && snapshot.totalBytes > 0) {
          onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
        }
      }, error => {
        if (error?.code === 'storage/unauthorized') {
          reject(new Error('Firebase Storage denied this upload. Confirm the signed-in account has admin access and deploy storage.rules.'));
          return;
        }
        if (error?.code === 'storage/bucket-not-found' || error?.code === 'storage/no-default-bucket') {
          reject(new Error('The configured Firebase Storage bucket was not found. Create or verify it in Firebase Console and redeploy.'));
          return;
        }
        reject(new Error(error?.message || 'Firebase Storage upload failed. Please retry.'));
      }, async () => {
        try {
          resolve(await getDownloadURL(task.snapshot.ref));
        } catch (error) {
          reject(new Error(error?.message || 'The image uploaded, but Firebase could not create a download URL.'));
        }
      });
    });
  };
}
