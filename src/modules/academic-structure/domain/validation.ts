import { ValidationError } from '../../../shared/domain/domain-error.js';
import { AcademicErrorCodes } from './errors/academic-error-codes.js';

const NAME_MIN = 2;
const NAME_MAX = 150;
const DELETE_CHAR_CODE = 127;
const FIRST_PRINTABLE_CHAR_CODE = 32;

const hasControlCharacters = (value: string): boolean => {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < FIRST_PRINTABLE_CHAR_CODE || code === DELETE_CHAR_CODE)
      return true;
  }
  return false;
};

export function requireName(raw: string, field = 'name'): string {
  const value = raw.trim().replace(/\s+/g, ' ');
  if (
    value.length < NAME_MIN ||
    value.length > NAME_MAX ||
    hasControlCharacters(value)
  ) {
    throw new ValidationError(
      `${field} must be ${NAME_MIN}-${NAME_MAX} printable characters.`,
      { code: AcademicErrorCodes.NAME_INVALID },
    );
  }
  return value;
}

export function requireInt(
  value: number,
  field: string,
  min: number,
  max: number,
): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ValidationError(
      `${field} must be a whole number from ${min} to ${max}.`,
      {
        code: AcademicErrorCodes.VALUE_OUT_OF_RANGE,
        details: { field, min, max },
      },
    );
  }
  return value;
}
