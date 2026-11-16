import { ValidationError } from '../../../../shared/domain/domain-error.js';
import { IdentityErrorCodes } from '../errors/identity-error-codes.js';

const EMAIL_MAX_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class Email {
  private constructor(readonly value: string) {}

  /** Normalises (trim + lowercase) so uniqueness checks are case-insensitive. */
  static create(raw: string): Email {
    const value = raw.trim().toLowerCase();
    if (
      value.length === 0 ||
      value.length > EMAIL_MAX_LENGTH ||
      !EMAIL_PATTERN.test(value)
    ) {
      throw new ValidationError('Email address is invalid.', {
        code: IdentityErrorCodes.EMAIL_INVALID,
      });
    }
    return new Email(value);
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
