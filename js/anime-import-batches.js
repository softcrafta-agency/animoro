export async function commitAnimeImportBatches(records, commitBatch, batchSize = 400) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    throw new RangeError('Anime import batch size must be between 1 and 500.');
  }

  const failures = [];
  let imported = 0;
  for (let offset = 0; offset < records.length; offset += batchSize) {
    const batchRecords = records.slice(offset, offset + batchSize);
    try {
      await commitBatch(batchRecords);
      imported += batchRecords.length;
    } catch (error) {
      failures.push({ records: batchRecords, error });
    }
  }
  return { imported, failures };
}
