import { ValidationError } from '../../../../shared/domain/domain-error.js';
import { IdentityErrorCodes } from '../errors/identity-error-codes.js';
import type { Email } from '../value-objects/email.vo.js';

/** Upper bound protects the hasher from oversized inputs. */
export const PASSWORD_MAX_LENGTH = 128;

export class PasswordPolicy {
  constructor(private readonly minLength: number) {}

  violations(plain: string, email?: Email): string[] {
    const problems: string[] = [];
    if (plain.length < this.minLength)
      problems.push(`must be at least ${this.minLength} characters`);
    if (plain.length > PASSWORD_MAX_LENGTH)
      problems.push(`must be at most ${PASSWORD_MAX_LENGTH} characters`);
    if (!/[A-Za-z]/.test(plain)) problems.push('must contain a letter');
    if (!/[0-9]/.test(plain)) problems.push('must contain a digit');
    if (email && plain.toLowerCase() === email.value)
      problems.push('must not be the email address');
    return problems;
  }

  assertValid(plain: string, email?: Email): void {
    const violations = this.violations(plain, email);
    if (violations.length > 0) {
      throw new ValidationError('Password does not meet the password policy.', {
        code: IdentityErrorCodes.WEAK_PASSWORD,
        details: { violations },
      });
    }
  }
}
