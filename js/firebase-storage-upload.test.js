import assert from 'node:assert/strict';
import test from 'node:test';
import { createFirebaseStorageUploader } from './firebase-storage-upload-core.js';

const image = new Blob(['valid image bytes'], { type: 'image/png' });
const storage = { bucket: 'animoro-b9268.firebasestorage.app' };
const user = { uid: 'admin-uid' };

function createUploader({ currentUser = user, uploadError = null, downloadUrl = 'https://firebasestorage.googleapis.com/v0/b/animoro-b9268.firebasestorage.app/o/images%2Farticles%2F00000000-0000-4000-8000-000000000000.png?alt=media&token=test', downloadError = null } = {}) {
  let uploaded;
  const uploader = createFirebaseStorageUploader({
    storage,
    getCurrentUser: () => currentUser,
    createId: () => '00000000-0000-4000-8000-000000000000',
    ref: (service, path) => {
      assert.equal(service, storage);
      return { fullPath: path };
    },
    uploadBytesResumable: (imageRef, blob, metadata) => {
      uploaded = { imageRef, blob, metadata };
      return {
        snapshot: { ref: imageRef },
        on(eventName, progress, failure, complete) {
          assert.equal(eventName, 'state_changed');
          if (uploadError) {
            failure(uploadError);
            return;
          }
          progress({ bytesTransferred: 1, totalBytes: 2 });
          complete();
        },
      };
    },
    getDownloadURL: async imageRef => {
      if (downloadError) throw downloadError;
      assert.equal(imageRef, uploaded.imageRef);
      return downloadUrl;
    },
  });
  return { uploader, getUploaded: () => uploaded };
}

test('uploads admin image bytes with a unique Storage path and returns its download URL', async () => {
  const { uploader, getUploaded } = createUploader();
  const progress = [];
  const url = await uploader(image, {
    kind: 'articles',
    fileName: '../article.png',
    onProgress: percent => progress.push(percent),
  });

  assert.match(url, /firebasestorage\.googleapis\.com/);
  assert.equal(getUploaded().imageRef.fullPath, 'images/articles/00000000-0000-4000-8000-000000000000.png');
  assert.equal(getUploaded().metadata.contentType, 'image/png');
  assert.equal(getUploaded().metadata.customMetadata.originalFileName, '.._article.png');
  assert.deepEqual(progress, [50]);
});

test('rejects unauthenticated, unsupported, oversized, and invalid-kind uploads', async () => {
  assert.match(await createUploader({ currentUser: null }).uploader(image).catch(error => error.message), /signed in/);
  assert.match(await createUploader().uploader(new Blob(['x'], { type: 'image/svg+xml' })).catch(error => error.message), /Only WebP/);
  assert.match(await createUploader().uploader(new Blob([new Uint8Array(3 * 1024 * 1024 + 1)], { type: 'image/png' })).catch(error => error.message), /3 MB/);
  assert.match(await createUploader().uploader(image, { kind: 'other' }).catch(error => error.message), /category/);
});

test('reports Storage authorization and missing-bucket failures', async () => {
  const denied = createUploader({ uploadError: { code: 'storage/unauthorized' } });
  await assert.rejects(denied.uploader(image), /deploy storage\.rules/);

  const missingBucket = createUploader({ uploadError: { code: 'storage/bucket-not-found' } });
  await assert.rejects(missingBucket.uploader(image), /bucket was not found/);
});

test('surfaces download URL failures after a successful byte upload', async () => {
  const { uploader } = createUploader({ downloadError: new Error('URL unavailable') });
  await assert.rejects(uploader(image), /URL unavailable/);
});
