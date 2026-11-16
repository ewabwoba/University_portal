/** Fields that must never appear in logs. Extend as new sensitive fields are introduced. */
export const LOG_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.refreshToken',
  '*.nationalId',
  '*.passportNumber',
];
export const LOG_REDACT_CENSOR = '[REDACTED]';
