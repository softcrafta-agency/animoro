export async function commitAdminDeleteBatches(ids, commitBatch, batchSize = 400, onProgress = () => {}) {
  if (!Array.isArray(ids)) throw new TypeError('Delete IDs must be an array.');
  if (typeof commitBatch !== 'function') throw new TypeError('A delete batch callback is required.');
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    throw new RangeError('Delete batch size must be between 1 and 500.');
  }

  const result = { deletedCount: 0, failedBatches: [] };
  for (let offset = 0; offset < ids.length; offset += batchSize) {
    const batchIds = ids.slice(offset, offset + batchSize);
    try {
      await commitBatch(batchIds);
      result.deletedCount += batchIds.length;
    } catch (error) {
      result.failedBatches.push({ ids: batchIds, error });
    } finally {
      onProgress(Math.min(offset + batchIds.length, ids.length), ids.length);
    }
  }
  return result;
}
