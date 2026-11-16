/** HTTP-level constants shared by the logging, error-handling and idempotency pieces. */
export const REQUEST_ID_HEADER = 'x-request-id';
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
export const IDEMPOTENT_REPLAYED_HEADER = 'idempotent-replayed';
export const RETRY_AFTER_HEADER = 'retry-after';
export const PROBLEM_JSON_CONTENT_TYPE = 'application/problem+json';

/** Accepted shape of a client-supplied request id / idempotency key (prevents log injection). */
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9_\-:.]{1,128}$/;
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_\-:.]+$/;

export const CORS_ALLOWED_METHODS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
];
export const CORS_ALLOWED_HEADERS = [
  'Authorization',
  'Content-Type',
  IDEMPOTENCY_KEY_HEADER,
  REQUEST_ID_HEADER,
];
export const CORS_MAX_AGE_SECONDS = 600;

export const HEALTH_LIVE_PATH = 'health/live';
export const HEALTH_READY_PATH = 'health/ready';

export const API_DOCS_PATH = 'docs';
export const API_TITLE = 'University Portal API';
export const API_VERSION = '1.0';

export const WWW_AUTHENTICATE_HEADER = 'www-authenticate';
export const BEARER_SCHEME = 'Bearer';
