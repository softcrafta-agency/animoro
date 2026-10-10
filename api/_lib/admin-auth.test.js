import assert from 'node:assert/strict';
import test from 'node:test';
import { authorizeAdminRequest } from './admin-auth.js';

function request(authorization = 'Bearer valid-token') {
  return { headers: { authorization } };
}

function servicesWithRole(role) {
  return {
    auth: {
      async verifyIdToken(token, checkRevoked) {
        assert.equal(token, 'valid-token');
        assert.equal(checkRevoked, true);
        return { uid: 'admin-1' };
      },
    },
    firestore: {
      collection(name) {
        assert.equal(name, 'admins');
        return {
          doc(uid) {
            assert.equal(uid, 'admin-1');
            return {
              async get() {
                return { exists: Boolean(role), data: () => ({ role }) };
              },
            };
          },
        };
      },
    },
  };
}

test('admin authorization requires an ID token and an admin role document', async () => {
  const missing = await authorizeAdminRequest(request(''), () => servicesWithRole('admin'));
  assert.deepEqual([missing.authorized, missing.status], [false, 401]);

  const denied = await authorizeAdminRequest(request(), () => servicesWithRole('editor'));
  assert.deepEqual([denied.authorized, denied.status], [false, 403]);

  const allowed = await authorizeAdminRequest(request(), () => servicesWithRole('admin'));
  assert.equal(allowed.authorized, true);
  assert.equal(allowed.uid, 'admin-1');
});

test('admin authorization does not reveal verification failures', async () => {
  const result = await authorizeAdminRequest(request(), () => ({
    auth: { async verifyIdToken() { throw new Error('private verification detail'); } },
    firestore: {},
  }));
  assert.equal(result.status, 401);
  assert.equal(result.message, 'Authentication required.');
});
