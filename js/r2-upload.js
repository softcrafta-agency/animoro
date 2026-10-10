import { auth } from './auth-init.js';

export async function uploadImageToR2(blob, { kind, fileName, slug, onProgress } = {}) {
  const user = auth?.currentUser;
  if (!user) throw new Error('You must be signed in as an admin to upload images.');
  if (!(blob instanceof Blob) || !['image/webp', 'image/jpeg', 'image/png'].includes(blob.type)) {
    throw new Error('Only WebP, JPEG, and PNG images can be uploaded.');
  }

  let token;
  try {
    token = await user.getIdToken();
  } catch {
    throw new Error('Could not verify your admin session. Please sign in again.');
  }

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', '/api/upload-image');
    request.setRequestHeader('Authorization', `Bearer ${token}`);
    request.setRequestHeader('Content-Type', blob.type);
    request.setRequestHeader('X-File-Name', encodeURIComponent(fileName || 'article-image.webp'));
    request.setRequestHeader('X-Upload-Kind', kind === 'covers' ? 'cover' : kind === 'upcoming' ? 'upcoming' : 'article');
    if (kind === 'upcoming' && slug) {
      request.setRequestHeader('X-Upcoming-Slug', encodeURIComponent(slug));
    }

    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && typeof onProgress === 'function') {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });
    request.addEventListener('load', () => {
      let result;
      try {
        result = JSON.parse(request.responseText);
      } catch {
        reject(new Error('Image upload service returned an unexpected server response.'));
        return;
      }
      if (request.status < 200 || request.status >= 300 || result.success !== true || !result.url) {
        reject(new Error(result.message || 'Image upload failed. Please try again.'));
        return;
      }
      try {
        if (new URL(result.url).protocol !== 'https:') throw new Error();
      } catch {
        reject(new Error('The image upload service returned an invalid image URL.'));
        return;
      }
      resolve(result.url);
    });
    request.addEventListener('error', () => reject(new Error('Image upload failed due to a network error. Please retry.')));
    request.addEventListener('abort', () => reject(new Error('Image upload was canceled.')));

    try {
      request.send(blob);
    } catch {
      reject(new Error('Could not start the image upload. Please retry.'));
    }
  });
}
