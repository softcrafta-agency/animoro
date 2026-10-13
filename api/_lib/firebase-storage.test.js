import assert from 'node:assert/strict';
import test from 'node:test';
import { getFirebaseStorageObjectPath } from './firebase-storage.js';

const bucket = 'animoro-b9268.firebasestorage.app';
const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/images%2Farticles%2F00000000-0000-4000-8000-000000000000.webp?alt=media&token=sample`;

test('accepts download URLs for expected Animoro Storage image paths', () => {
  assert.equal(
    getFirebaseStorageObjectPath(imageUrl, bucket),
    'images/articles/00000000-0000-4000-8000-000000000000.webp'
  );
  assert.equal(
    getFirebaseStorageObjectPath(imageUrl.replace('articles', 'covers'), bucket),
    'images/covers/00000000-0000-4000-8000-000000000000.webp'
  );
});

test('rejects URLs for another bucket, path, protocol, or invalid download token', () => {
  assert.equal(getFirebaseStorageObjectPath(imageUrl, 'other.firebasestorage.app'), null);
  assert.equal(getFirebaseStorageObjectPath(imageUrl.replace('images%2Farticles', 'private%2Farticles'), bucket), null);
  assert.equal(getFirebaseStorageObjectPath(imageUrl.replace('https:', 'http:'), bucket), null);
  assert.equal(getFirebaseStorageObjectPath(imageUrl.replace('&token=sample', ''), bucket), null);
  assert.equal(getFirebaseStorageObjectPath(imageUrl.replace('alt=media', 'alt=media&alt=media'), bucket), null);
  assert.equal(getFirebaseStorageObjectPath(imageUrl.replace('token=sample', 'token=sample&token=other'), bucket), null);
  assert.equal(getFirebaseStorageObjectPath(`${imageUrl}&admin=true`, bucket), null);
  assert.equal(getFirebaseStorageObjectPath('https://evil.example/file.webp', bucket), null);
});
