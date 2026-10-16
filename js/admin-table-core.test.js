import assert from 'node:assert/strict';
import test from 'node:test';
import { commitAdminDeleteBatches } from './admin-table-core.js';

test('continues deletion after a batch failure and reports each failed record', async () => {
  const progress = [];
  const result = await commitAdminDeleteBatches(
    ['a', 'b', 'c', 'd', 'e'],
    async ids => {
      if (ids.includes('c')) throw new Error('permission-denied');
    },
    2,
    (processed, total) => progress.push([processed, total]),
  );

  assert.equal(result.deletedCount, 3);
  assert.deepEqual(result.failedBatches.map(batch => batch.ids), [['c', 'd']]);
  assert.equal(result.failedBatches[0].error.message, 'permission-denied');
  assert.deepEqual(progress, [[2, 5], [4, 5], [5, 5]]);
});

test('rejects unsafe delete batch sizes before running writes', async () => {
  let called = false;
  await assert.rejects(
    commitAdminDeleteBatches(['a'], async () => { called = true; }, 501),
    RangeError,
  );
  assert.equal(called, false);
});
