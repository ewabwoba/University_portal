import { ValidationError } from '../../../../shared/domain/domain-error.js';
import { AcademicErrorCodes } from '../errors/academic-error-codes.js';

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{1,19}$/;

/** Short, stable identifier (programme BSC-CS, unit CSC101). Stored upper-case; never contains spaces. */
export class Code {
  private constructor(readonly value: string) {}

  static create(raw: string, field = 'code'): Code {
    const value = raw.trim().toUpperCase();
    if (!CODE_PATTERN.test(value)) {
      throw new ValidationError(
        `${field} must be 2-20 characters: letters, digits and hyphens, starting with a letter or digit.`,
        {
          code: AcademicErrorCodes.CODE_INVALID,
        },
      );
    }
    return new Code(value);
  }

  toString(): string {
    return this.value;
  }
}
