const FIREBASE_STORAGE_ORIGIN = 'https://firebasestorage.googleapis.com';

export function getFirebaseStorageObjectPath(imageUrl, bucketName) {
  if (!bucketName) return null;

  let url;
  try {
    url = new URL(imageUrl);
  } catch {
    return null;
  }

  const objectPrefix = `/v0/b/${bucketName}/o/`;
  if (url.origin !== FIREBASE_STORAGE_ORIGIN || url.username || url.password ||
      url.hash || !url.pathname.startsWith(objectPrefix) ||
      url.searchParams.get('alt') !== 'media' ||
      !url.searchParams.get('token') ||
      url.searchParams.getAll('alt').length !== 1 ||
      url.searchParams.getAll('token').length !== 1 ||
      Array.from(url.searchParams.keys()).some(key => !['alt', 'token'].includes(key))) {
    return null;
  }

  let objectPath;
  try {
    objectPath = decodeURIComponent(url.pathname.slice(objectPrefix.length));
  } catch {
    return null;
  }

  return /^images\/(?:covers|articles|upcoming)\/[0-9a-f-]{36}\.(?:webp|jpg|png)$/i.test(objectPath)
    ? objectPath
    : null;
}
