import { ValidationError } from '../../../../shared/domain/domain-error.js';
import { AcademicErrorCodes } from '../../domain/errors/academic-error-codes.js';

/** `2026-09-07` -> midnight UTC, the representation DATE columns use. */
export const parseDateOnly = (value: string, field: string): Date =>
  parse(`${value}T00:00:00.000Z`, field);

/** ISO 8601 date-time with an explicit offset or Z. */
export const parseDateTime = (value: string, field: string): Date => {
  if (!/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new ValidationError(
      `${field} must be an ISO 8601 date-time with a time zone, e.g. 2026-08-17T06:00:00Z.`,
      {
        code: AcademicErrorCodes.SEMESTER_INVALID,
      },
    );
  }
  return parse(value, field);
};

function parse(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`${field} is not a real date.`, {
      code: AcademicErrorCodes.SEMESTER_INVALID,
    });
  }
  return date;
}
