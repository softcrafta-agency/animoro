import { randomUUID } from 'node:crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { authorizeAdminRequest } from './_lib/admin-auth.js';
import { getR2Client, getR2Configuration } from './_lib/r2.js';

export const config = { api: { bodyParser: false } };

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const IMAGE_TYPES = {
  'image/webp': { extension: 'webp' },
  'image/jpeg': { extension: 'jpg' },
  'image/png': { extension: 'png' },
};

function respond(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.statusCode = status;
  return res.end(JSON.stringify(status >= 400
    ? { success: false, message: payload.message || 'Image upload failed.' }
    : { success: true, ...payload }));
}

export function validateImageSignature(buffer, contentType) {
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

export async function readImageBody(req) {
  const contentLength = Number(req.headers['content-length']);
  if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
    const error = new Error('Image exceeds the 3 MB upload limit.');
    error.statusCode = 413;
    throw error;
  }

  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > MAX_IMAGE_BYTES) {
      const error = new Error('Image exceeds the 3 MB upload limit.');
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
  return Buffer.concat(chunks, totalBytes);
}

function decodeHeader(value, label, maxLength) {
  let decoded;
  try {
    decoded = decodeURIComponent(String(value || ''));
  } catch {
    const error = new Error(`${label} is invalid.`);
    error.statusCode = 400;
    throw error;
  }
  const cleaned = decoded.replace(/[\\/\u0000-\u001f\u007f]/g, '').trim();
  if (!cleaned || cleaned.length > maxLength) {
    const error = new Error(`${label} is invalid.`);
    error.statusCode = 400;
    throw error;
  }
  return cleaned;
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

    const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const imageType = IMAGE_TYPES[contentType];
    if (!imageType) {
      return respond(res, 415, { message: 'Only WebP, JPEG, and PNG images are accepted.' });
    }

    const uploadType = String(req.headers['x-upload-kind'] || 'article');
    if (!['cover', 'article', 'upcoming'].includes(uploadType)) {
      return respond(res, 400, { message: 'Image type must be cover, article, or upcoming.' });
    }
    const fileName = decodeHeader(req.headers['x-file-name'], 'File name', 255);

    let key;
    if (uploadType === 'upcoming') {
      const slug = decodeHeader(req.headers['x-upcoming-slug'], 'Upcoming anime slug', 200);
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        return respond(res, 400, { message: 'A valid upcoming anime slug is required.' });
      }
      key = `upcoming-anime/${slug}/${randomUUID()}.${imageType.extension}`;
    } else {
      const folder = uploadType === 'cover' ? 'covers' : 'articles';
      key = `${folder}/${randomUUID()}.${imageType.extension}`;
    }

    const imageBuffer = await readImageBody(req);
    if (!validateImageSignature(imageBuffer, contentType)) {
      return respond(res, 415, { message: 'Image contents do not match the declared file type.' });
    }

    let config;
    try {
      config = getR2Configuration();
    } catch (error) {
      console.error('[upload-image] R2 configuration unavailable', { name: error.name });
      return respond(res, 500, { message: 'Image uploads are not configured on the server.' });
    }

    try {
      await getR2Client().send(new PutObjectCommand({
        Bucket: config.bucketName,
        Key: key,
        Body: imageBuffer,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }));
    } catch (error) {
      console.error('[upload-image] R2 upload failed', {
        name: error?.name || 'Error',
        code: error?.code || error?.Code || null,
        requestId: error?.$metadata?.requestId || null,
      });
      return respond(res, 502, { message: 'Could not upload the image to R2. Please retry.' });
    }

    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    return respond(res, 200, {
      url: `${config.publicBaseUrl}/${encodedKey}`,
      fileName,
      mimeType: contentType,
    });
  } catch (error) {
    if (!error.statusCode) {
      console.error('[upload-image] Unexpected request failure', { name: error?.name || 'Error' });
    }
    return respond(res, error.statusCode || 500, {
      message: error.statusCode ? error.message : 'Image upload failed. Please retry.',
    });
  }
}
