import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import handler, { readImageBody, validateImageSignature } from './upload-image.js';

function createResponse() {
  return {
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(body) {
      this.body = JSON.parse(body);
    },
  };
}

test('reads raw image bytes and enforces the upload size limit', async () => {
  const body = Buffer.from('image bytes');
  const request = Readable.from([body]);
  request.headers = { 'content-length': String(body.length) };
  assert.deepEqual(await readImageBody(request), body);

  const oversized = Readable.from([Buffer.alloc(3 * 1024 * 1024 + 1)]);
  oversized.headers = {};
  await assert.rejects(readImageBody(oversized), error => error.statusCode === 413);
});

test('checks file signatures against declared image MIME types', () => {
  assert.equal(validateImageSignature(Buffer.from('RIFFxxxxWEBPdata'), 'image/webp'), true);
  assert.equal(validateImageSignature(Buffer.from([0xff, 0xd8, 0xff, 0x00]), 'image/jpeg'), true);
  assert.equal(validateImageSignature(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), 'image/png'), true);
  assert.equal(validateImageSignature(Buffer.from('<svg></svg>'), 'image/png'), false);
  assert.equal(validateImageSignature(Buffer.from('RIFFxxxxWEBPdata'), 'image/jpeg'), false);
});

test('upload endpoint requires an admin bearer token before reading image bytes', async () => {
  const response = createResponse();
  const request = Readable.from([]);
  request.method = 'POST';
  request.headers = {};
  await handler(request, response);
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.success, false);
  assert.equal(response.headers['Cache-Control'], 'no-store');
});
