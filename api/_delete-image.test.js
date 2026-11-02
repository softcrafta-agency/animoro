import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import handler from './delete-image.js';

test('image deletion endpoint requires an admin bearer token', async () => {
  const response = {
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(body) {
      this.body = JSON.parse(body);
    },
  };
  const request = Readable.from([]);
  request.method = 'POST';
  request.headers = {};

  await handler(request, response);
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.success, false);
  assert.equal(response.headers['Cache-Control'], 'no-store');
});
