import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { authorizeAdminRequest } from './_lib/admin-auth.js';
import { findImageReferences } from './_lib/image-references.js';
import { getR2Client, getR2Configuration, getR2ObjectKey } from './_lib/r2.js';

export const config = { api: { bodyParser: false } };
const MAX_REQUEST_BYTES = 4096;

function respond(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.statusCode = status;
  return res.end(JSON.stringify(status >= 400
    ? { success: false, message: payload.message || 'Image deletion failed.' }
    : { success: true, ...payload }));
}

async function readJsonBody(req) {
  const length = Number(req.headers['content-length']);
  if (Number.isFinite(length) && length > MAX_REQUEST_BYTES) {
    const error = new Error('Request is too large.');
    error.statusCode = 413;
    throw error;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_REQUEST_BYTES) {
      const error = new Error('Request is too large.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.statusCode = 400;
    throw error;
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return respond(res, 405, { message: 'Method not allowed.' });
    }

    const authorization = await authorizeAdminRequest(req);
    if (!authorization.authorized) {
      return respond(res, authorization.status, { message: authorization.message });
    }

    if (String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') {
      return respond(res, 415, { message: 'Content-Type must be application/json.' });
    }
    const payload = await readJsonBody(req);
    if (typeof payload.url !== 'string' || payload.url.length > 2048) {
      return respond(res, 400, { message: 'A valid image URL is required.' });
    }

    let configuration;
    try {
      configuration = getR2Configuration();
    } catch (error) {
      console.error('[delete-image] R2 configuration unavailable', { name: error.name });
      return respond(res, 500, { message: 'Image deletion is not configured on the server.' });
    }
    const key = getR2ObjectKey(payload.url, configuration.publicBaseUrl);
    if (!key) {
      return respond(res, 400, { message: 'Image URL is not a valid Animoro R2 object URL.' });
    }

    const references = await findImageReferences(authorization.services.firestore, payload.url);
    if (references.length) {
      return respond(res, 409, { message: 'This image is still used by an article or anime entry and cannot be deleted.' });
    }

    try {
      await getR2Client().send(new DeleteObjectCommand({
        Bucket: configuration.bucketName,
        Key: key,
      }));
    } catch (error) {
      console.error('[delete-image] R2 deletion failed', {
        name: error?.name || 'Error',
        code: error?.code || error?.Code || null,
        requestId: error?.$metadata?.requestId || null,
      });
      return respond(res, 502, { message: 'Could not delete the image from R2. Please retry.' });
    }

    const metadata = await authorization.services.firestore
      .collection('imageAssets')
      .where('url', '==', payload.url)
      .get();
    await Promise.all(metadata.docs.map((document) => document.ref.delete()));

    return respond(res, 200, { message: 'Image deleted.' });
  } catch (error) {
    if (!error.statusCode) {
      console.error('[delete-image] Unexpected request failure', { name: error?.name || 'Error' });
    }
    return respond(res, error.statusCode || 500, {
      message: error.statusCode ? error.message : 'Image deletion failed. Please retry.',
    });
  }
}
