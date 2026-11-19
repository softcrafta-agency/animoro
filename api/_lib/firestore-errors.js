export function isMissingFirestoreIndexError(error) {
  const code = error?.code;
  const isFailedPrecondition = code === 9 ||
    code === '9' ||
    code === 'FAILED_PRECONDITION' ||
    code === 'failed-precondition';
  return isFailedPrecondition &&
    /index|composite/i.test(`${error?.message || ''} ${error?.details || ''}`);
}
