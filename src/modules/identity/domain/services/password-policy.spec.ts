import { ValidationError } from '../../../../shared/domain/domain-error.js';
import { Email } from '../value-objects/email.vo.js';
import { LockoutPolicy } from './lockout-policy.js';
import { PASSWORD_MAX_LENGTH, PasswordPolicy } from './password-policy.js';

describe('PasswordPolicy', () => {
  const policy = new PasswordPolicy(12);

  it('accepts a long password with a letter and a digit', () => {
    expect(policy.violations('Correct-Horse-9')).toEqual([]);
  });

  it('reports every violation at once', () => {
    expect(policy.violations('short')).toEqual([
      'must be at least 12 characters',
      'must contain a digit',
    ]);
    expect(policy.violations('1234567890123')).toContain(
      'must contain a letter',
    );
    expect(policy.violations('a1'.repeat(PASSWORD_MAX_LENGTH))).toContain(
      `must be at most ${PASSWORD_MAX_LENGTH} characters`,
    );
  });

  it('rejects the email address as a password', () => {
    const email = Email.create('someone-long@university.test');
    expect(policy.violations('someone-long@university.test', email)).toContain(
      'must not be the email address',
    );
  });

  it('throws a coded ValidationError carrying the violations', () => {
    const error = (() => {
      try {
        policy.assertValid('weak');
      } catch (e) {
        return e as ValidationError;
      }
    })();
    expect(error).toBeInstanceOf(ValidationError);
    expect(error?.code).toBe('WEAK_PASSWORD');
    expect(error?.details?.violations).toBeInstanceOf(Array);
  });
});

describe('LockoutPolicy', () => {
  const policy = new LockoutPolicy(3, 15 * 60_000);

  it('locks at the threshold and not before', () => {
    expect([1, 2].map((n) => policy.shouldLock(n))).toEqual([false, false]);
    expect([3, 4].map((n) => policy.shouldLock(n))).toEqual([true, true]);
  });

  it('computes the unlock time from the supplied clock', () => {
    expect(
      policy.lockedUntil(new Date('2026-01-01T10:00:00Z')).toISOString(),
    ).toBe('2026-01-01T10:15:00.000Z');
  });
});
