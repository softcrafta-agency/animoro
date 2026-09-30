import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

export const config = { api: { bodyParser: false } };

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_JSON_BODY_BYTES = 4.25 * 1024 * 1024;
const IMAGE_TYPES = {
  'image/webp': { extension: 'webp' },
  'image/jpeg': { extension: 'jpg' },
  'image/png': { extension: 'png' },
};
let adminApp;
let s3Client;

function respond(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const responseBody = status >= 400
    ? { success: false, message: payload.message || 'Image upload failed.' }
    : { success: true, ...payload };
  res.statusCode = status;
  return res.end(JSON.stringify(responseBody));
}

function getAdminServices() {
  if (!adminApp) {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson) {
      throw new Error('Firebase Admin is not configured.');
    }

    const serviceAccount = JSON.parse(serviceAccountJson);
    if (typeof serviceAccount.private_key === 'string') {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    adminApp = getApps()[0] || initializeApp({ credential: cert(serviceAccount) });
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

function validateImageSignature(buffer, contentType) {
  if (contentType === 'image/webp') {
    return buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP';
  }
  if (contentType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
}

async function readJsonBody(req) {
  const contentLength = Number(req.headers['content-length']);
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BODY_BYTES) {
    const error = new Error('Image request exceeds the upload limit.');
    error.statusCode = 413;
    throw error;
  }

  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > MAX_JSON_BODY_BYTES) {
      const error = new Error('Image request exceeds the upload limit.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(buffer);
  }

  if (!totalBytes) {
    const error = new Error('Image request body is required.');
    error.statusCode = 400;
    throw error;
  }

  try {
    return JSON.parse(Buffer.concat(chunks, totalBytes).toString('utf8'));
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.statusCode = 400;
    throw error;
  }
}

function decodeImageData(data) {
  if (typeof data !== 'string' || !data) {
    const error = new Error('Image data is required.');
    error.statusCode = 400;
    throw error;
  }

  const maxBase64Length = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;
  const isValidBase64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data);
  if (data.length > maxBase64Length || data.length % 4 !== 0 || !isValidBase64) {
    const error = new Error('Image data is not valid Base64 or exceeds the 3 MB limit.');
    error.statusCode = data.length > maxBase64Length ? 413 : 400;
    throw error;
  }

  const buffer = Buffer.from(data, 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
    const error = new Error('Image data is empty or exceeds the 3 MB limit.');
    error.statusCode = buffer.length ? 413 : 400;
    throw error;
  }
  return buffer;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return respond(res, 405, { message: 'Method not allowed.' });
    }

    const tokenMatch = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
    if (!tokenMatch) {
      return respond(res, 401, { message: 'Authentication required.' });
    }

    let services;
    try {
      services = getAdminServices();
    } catch {
      return respond(res, 500, { message: 'Image upload authentication is not configured on the server.' });
    }

    let decodedToken;
    try {
      decodedToken = await services.auth.verifyIdToken(tokenMatch[1], true);
    } catch {
      return respond(res, 401, { message: 'Authentication required.' });
    }

    let adminDocument;
    try {
      adminDocument = await services.firestore.collection('admins').doc(decodedToken.uid).get();
    } catch {
      return respond(res, 500, { message: 'Could not verify admin authorization.' });
    }
    if (!adminDocument.exists || adminDocument.data()?.role !== 'admin') {
      return respond(res, 403, { message: 'Admin access required.' });
    }

    const requestContentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (requestContentType !== 'application/json') {
      return respond(res, 415, { message: 'Content-Type must be application/json.' });
    }

    const payload = await readJsonBody(req);
    if (typeof payload.fileName !== 'string' || !payload.fileName.trim() || payload.fileName.length > 255) {
      return respond(res, 400, { message: 'A valid fileName is required.' });
    }

    const contentType = String(payload.contentType || '').toLowerCase();
    const imageType = IMAGE_TYPES[contentType];
    if (!imageType) {
      return respond(res, 415, { message: 'Only WebP, JPEG, and PNG images are accepted.' });
    }

    const imageBuffer = decodeImageData(payload.data);
    if (!validateImageSignature(imageBuffer, contentType)) {
      return respond(res, 415, { message: 'Image contents do not match the declared file type.' });
    }

    const uploadType = payload.type || 'article';
    if (!['cover', 'article'].includes(uploadType)) {
      return respond(res, 400, { message: 'Image type must be cover or article.' });
    }

    const bucketName = process.env.R2_BUCKET_NAME;
    const publicUrl = process.env.R2_PUBLIC_URL?.replace(/\/+$/, '');
    if (!bucketName || !publicUrl) {
      return respond(res, 500, { message: 'Image uploads are not configured on the server.' });
    }

    const folder = uploadType === 'cover' ? 'covers' : 'articles';
    const key = `${folder}/${randomUUID()}.${imageType.extension}`;

    try {
      await getR2Client().send(new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: imageBuffer,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }));
    } catch {
      return respond(res, 502, { message: 'Could not upload the image to R2. Please retry.' });
    }

    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    return respond(res, 200, { url: `${publicUrl}/${encodedKey}` });
  } catch (error) {
    return respond(res, error.statusCode || 500, {
      message: error.statusCode ? error.message : 'Image upload failed. Please retry.',
    });
  }
}
