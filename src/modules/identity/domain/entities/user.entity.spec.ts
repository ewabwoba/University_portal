import { Email } from '../value-objects/email.vo.js';
import { User } from './user.entity.js';

const NOW = new Date('2026-11-10T10:00:00Z');
const newUser = () =>
  User.register({
    email: Email.create('a@b.test'),
    passwordHash: 'h',
    roles: ['STUDENT', 'STUDENT'],
    now: NOW,
  });

describe('User aggregate', () => {
  it('registers active, de-duplicates roles and raises a UserRegistered event', () => {
    const user = newUser();
    expect(user).toMatchObject({
      isActive: true,
      failedLoginAttempts: 0,
      version: 1,
    });
    expect(user.roles).toEqual(['STUDENT']);
    expect(user.pullEvents().map((e) => e.eventName)).toEqual([
      'identity.user.registered',
    ]);
    expect(user.pullEvents()).toEqual([]); // events are drained once
  });

  it('raises a status event only when the status actually changes', () => {
    const user = newUser();
    user.pullEvents();
    user.activate();
    expect(user.pullEvents()).toEqual([]);
    user.deactivate();
    user.deactivate();
    expect(user.pullEvents().map((e) => e.payload)).toEqual([
      { isActive: false },
    ]);
  });

  it('reports locked only while lockedUntil is in the future', () => {
    const restored = (lockedUntil: Date | null) =>
      User.restore('id', {
        email: Email.create('a@b.test'),
        passwordHash: 'h',
        phoneNumber: null,
        isActive: true,
        failedLoginAttempts: 3,
        lockedUntil,
        lastLoginAt: null,
        passwordChangedAt: null,
        roles: [],
        version: 1,
        createdAt: NOW,
      });
    expect(restored(new Date(NOW.getTime() + 1)).isLocked(NOW)).toBe(true);
    expect(restored(NOW).isLocked(NOW)).toBe(false);
    expect(restored(null).isLocked(NOW)).toBe(false);
  });

  it('clears the lockout and stamps the time when the password changes', () => {
    const user = newUser();
    user.changePassword('new-hash', NOW);
    expect(user).toMatchObject({
      passwordHash: 'new-hash',
      passwordChangedAt: NOW,
      lockedUntil: null,
      failedLoginAttempts: 0,
    });
  });

  it('does not expose its internal roles array for mutation', () => {
    const user = newUser();
    user.roles.push('SUPER_ADMIN');
    expect(user.roles).toEqual(['STUDENT']);
  });
});
