import { S3Client } from '@aws-sdk/client-s3';

let s3Client;

export function getR2Configuration() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env;
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL || process.env.R2_PUBLIC_URL;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME || !publicBaseUrl) {
    throw new Error('R2 is not configured.');
  }

  let publicUrl;
  try {
    publicUrl = new URL(publicBaseUrl);
  } catch {
    throw new Error('R2 public base URL is invalid.');
  }
  if (publicUrl.protocol !== 'https:' || publicUrl.username || publicUrl.password || publicUrl.search || publicUrl.hash) {
    throw new Error('R2 public base URL is invalid.');
  }

  return {
    bucketName: R2_BUCKET_NAME,
    publicBaseUrl: publicUrl.toString().replace(/\/+$/, ''),
    publicUrl,
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  };
}

export function getR2Client() {
  if (!s3Client) {
    const config = getR2Configuration();
    s3Client = new S3Client({
      region: 'auto',
      endpoint: config.endpoint,
      credentials: config.credentials,
    });
  }
  return s3Client;
}

export function getR2ObjectKey(imageUrl, publicBaseUrl) {
  let target;
  let base;
  try {
    target = new URL(imageUrl);
    base = new URL(publicBaseUrl);
  } catch {
    return null;
  }

  const basePath = base.pathname.replace(/\/+$/, '');
  if (target.protocol !== 'https:' || target.origin !== base.origin ||
      target.search || target.hash || target.username || target.password ||
      !target.pathname.startsWith(`${basePath}/`)) {
    return null;
  }

  let key;
  try {
    key = target.pathname.slice(basePath.length + 1).split('/').map(decodeURIComponent).join('/');
  } catch {
    return null;
  }
  if (!/^(?:covers|articles|upcoming-anime)\/[A-Za-z0-9._/-]+\.(?:webp|jpg|png)$/i.test(key) ||
      key.split('/').some(part => !part || part === '.' || part === '..' || part.includes('\\'))) {
    return null;
  }
  return key;
}
