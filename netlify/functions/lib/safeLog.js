const ALLOWED_ERROR_NAMES = new Set([
  'Error',
  'TypeError',
  'SyntaxError',
  'ApiError',
  'GaxiosError',
  'FetchError',
]);

const safeStatus = (value) => {
  const status = Number(value);
  return Number.isInteger(status) && status >= 100 && status <= 599
    ? status
    : undefined;
};

const safeCode = (value) => (
  typeof value === 'string' && /^[A-Z0-9_]{1,48}$/.test(value)
    ? value
    : undefined
);

const summarizeError = (error) => {
  const name = ALLOWED_ERROR_NAMES.has(error?.name)
    ? error.name
    : 'Error';

  const statusCode = safeStatus(
    error?.statusCode ?? error?.response?.status
  );

  const code = safeCode(error?.code);

  const apiErrors = Array.isArray(error?.errors)
    ? error.errors
        .slice(0, 5)
        .map((item) => ({
          category: safeCode(item?.category),
          code: safeCode(item?.code),
        }))
        .filter((item) => item.category || item.code)
    : [];

  return {
    name,
    ...(statusCode ? { statusCode } : {}),
    ...(code ? { code } : {}),
    ...(apiErrors.length ? { apiErrors } : {}),
  };
};

const logError = (label, error) => {
  console.error(label, JSON.stringify(summarizeError(error)));
};

module.exports = { logError };
