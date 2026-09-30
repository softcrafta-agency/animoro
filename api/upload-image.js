import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

export const config = { api: { bodyParser: false } };

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
let adminApp;
let s3Client;

function respond(res, status, payload) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(status).json(payload);
}

function getAdminServices() {
  if (!adminApp) {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson) {
      throw new Error('Firebase Admin is not configured.');
    }

    adminApp = getApps()[0] || initializeApp({
      credential: cert(JSON.parse(serviceAccountJson)),
    });
  }

  return {
    auth: getAuth(adminApp),
    firestore: getFirestore(adminApp),
  };
}

function getR2Client() {
  if (!s3Client) {
    const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
      throw new Error('R2 is not configured.');
    }

    s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
  }

  return s3Client;
}

function getSafeSlug(value) {
  const slug = String(value || 'article')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'article';
}

function isWebp(buffer) {
  return buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP';
}

async function readImageBody(req) {
  const contentLength = Number(req.headers['content-length']);
  if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
    const error = new Error('Image exceeds the 4 MB upload limit.');
    error.statusCode = 413;
    throw error;
  }

  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > MAX_IMAGE_BYTES) {
      const error = new Error('Image exceeds the 4 MB upload limit.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks, totalBytes);
}

export default async function uploadImage(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return respond(res, 405, { error: 'Method not allowed.' });
  }

  const tokenMatch = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  if (!tokenMatch) {
    return respond(res, 401, { error: 'Sign in as an admin before uploading images.' });
  }

  let services;
  try {
    services = getAdminServices();
  } catch {
    return respond(res, 500, { error: 'Image upload authentication is not configured on the server.' });
  }

  let decodedToken;
  try {
    decodedToken = await services.auth.verifyIdToken(tokenMatch[1], true);
  } catch {
    return respond(res, 401, { error: 'The authentication token is invalid or expired.' });
  }

  try {
    const adminDocument = await services.firestore.collection('admins').doc(decodedToken.uid).get();
    if (!adminDocument.exists || adminDocument.data()?.role !== 'admin') {
      return respond(res, 403, { error: 'This account is not authorized to upload images.' });
    }
  } catch {
    return respond(res, 500, { error: 'Could not verify admin authorization.' });
  }

  const kind = req.headers['x-image-kind'];
  if (!['covers', 'articles'].includes(kind)) {
    return respond(res, 400, { error: 'Invalid image category.' });
  }

  const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (contentType !== 'image/webp') {
    return respond(res, 415, { error: 'Only compressed WebP images are accepted.' });
  }

  let imageBuffer;
  try {
    imageBuffer = await readImageBody(req);
  } catch (error) {
    return respond(res, error.statusCode || 400, { error: error.message || 'Could not read the image.' });
  }

  if (!imageBuffer.length) {
    return respond(res, 400, { error: 'The uploaded image is empty.' });
  }
  if (!isWebp(imageBuffer)) {
    return respond(res, 415, { error: 'The uploaded file is not a valid WebP image.' });
  }

  const bucketName = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL?.replace(/\/+$/, '');
  if (!bucketName || !publicUrl) {
    return respond(res, 500, { error: 'Image uploads are not configured on the server.' });
  }

  const slug = getSafeSlug(req.headers['x-article-slug']);
  const key = `${kind}/${slug}-${randomUUID()}.webp`;

  try {
    await getR2Client().send(new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: imageBuffer,
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000, immutable',
    }));
  } catch {
    return respond(res, 502, { error: 'Could not upload the image to R2. Please retry.' });
  }

  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  return respond(res, 200, { url: `${publicUrl}/${encodedKey}` });
}
