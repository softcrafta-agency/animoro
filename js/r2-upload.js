import { auth } from './auth-init.js';

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const separator = dataUrl.indexOf(',');
      if (separator < 0) {
        reject(new Error('Could not prepare the image for upload.'));
        return;
      }
      resolve(dataUrl.slice(separator + 1));
    };
    reader.onerror = () => reject(new Error('Could not prepare the image for upload.'));
    reader.readAsDataURL(blob);
  });
}

export async function uploadImageToR2(blob, { kind, fileName, slug }) {
  const user = auth?.currentUser;
  if (!user) {
    throw new Error('You must be signed in as an admin to upload images.');
  }

  const response = await fetch('/api/upload-image', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fileName: fileName || 'article-image.webp',
      contentType: blob.type || 'image/webp',
      data: await blobToBase64(blob),
      type: kind === 'covers' ? 'cover' : kind === 'upcoming' ? 'upcoming' : 'article',
      ...(kind === 'upcoming' ? { slug } : {}),
    }),
  });

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error('Image upload service returned an unexpected server response.');
  }

  if (!response.ok || result.success !== true || !result.url) {
    throw new Error(result.message || result.error || 'Image upload failed. Please try again.');
  }

  try {
    if (new URL(result.url).protocol !== 'https:') throw new Error();
  } catch {
    throw new Error('The image upload service returned an invalid image URL.');
  }

  return result.url;
}
