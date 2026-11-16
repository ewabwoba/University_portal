import { User } from '../../domain/entities/user.entity.js';
import { LockoutPolicy } from '../../domain/services/lockout-policy.js';
import { Email } from '../../domain/value-objects/email.vo.js';
import type { UserRepository } from '../../domain/repositories/user.repository.js';
import type { RefreshTokenRepository } from '../../domain/repositories/refresh-token.repository.js';
import type { PasswordHasher } from '../ports/password-hasher.port.js';
import type { SessionService } from '../services/session.service.js';
import { LoginUseCase } from './login.use-case.js';

const NOW = new Date('2026-11-10T10:00:00Z');

function setup(
  options: {
    user?: User | null;
    passwordOk?: boolean;
    failedAttempts?: number;
  } = {},
) {
  const user =
    options.user === undefined
      ? User.register({
          email: Email.create('a@b.test'),
          passwordHash: 'hash',
          roles: ['STUDENT'],
          now: NOW,
        })
      : options.user;

  const findByEmail = vi.fn().mockResolvedValue(user);
  const incrementFailedLogins = vi
    .fn()
    .mockResolvedValue(options.failedAttempts ?? 1);
  const lockUntil = vi.fn().mockResolvedValue(undefined);
  const recordSuccessfulLogin = vi.fn().mockResolvedValue(undefined);
  const users = {
    findByEmail,
    incrementFailedLogins,
    lockUntil,
    recordSuccessfulLogin,
  } as unknown as UserRepository;

  const save = vi.fn().mockResolvedValue(undefined);
  const refreshTokens = { save } as unknown as RefreshTokenRepository;

  const verify = vi.fn().mockResolvedValue(options.passwordOk ?? false);
  const verifyDummy = vi.fn().mockResolvedValue(undefined);
  const hasher = {
    verify,
    verifyDummy,
    hash: vi.fn(),
  } as unknown as PasswordHasher;

  let committed = false;
  const transactions = {
    run: async <T>(work: () => Promise<T>) => {
      const result = await work();
      committed = true;
      return result;
    },
  };
  const record = vi.fn().mockResolvedValue(undefined);
  const session = {
    prepareRefreshToken: vi.fn(() => ({ entity: {}, raw: 'raw-refresh' })),
    buildTokens: vi.fn().mockResolvedValue({
      accessToken: 'jwt',
      tokenType: 'Bearer',
      expiresIn: 900,
      refreshToken: 'raw-refresh',
    }),
  } as unknown as SessionService;

  const useCase = new LoginUseCase(
    users,
    refreshTokens,
    hasher,
    transactions,
    { record },
    { now: () => NOW },
    new LockoutPolicy(3, 900_000),
    session,
  );
  return {
    useCase,
    verify,
    verifyDummy,
    incrementFailedLogins,
    lockUntil,
    recordSuccessfulLogin,
    record,
    save,
    wasCommitted: () => committed,
  };
}

const creds = { email: 'a@b.test', password: 'whatever-123' };

describe('LoginUseCase', () => {
  it('burns a dummy hash for unknown accounts so response time does not reveal them', async () => {
    const { useCase, verify, verifyDummy } = setup({ user: null });
    await expect(useCase.execute(creds)).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(verifyDummy).toHaveBeenCalledOnce();
    expect(verify).not.toHaveBeenCalled();
  });

  it('does the same for a malformed email address', async () => {
    const { useCase, verifyDummy } = setup({ user: null });
    await expect(
      useCase.execute({ email: 'not-an-email', password: 'x' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(verifyDummy).toHaveBeenCalledOnce();
  });

  it('commits the failure bookkeeping BEFORE throwing, so it survives the error', async () => {
    const { useCase, incrementFailedLogins, record, wasCommitted } = setup({
      passwordOk: false,
    });
    await expect(useCase.execute(creds)).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(incrementFailedLogins).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LOGIN_FAILED' }),
    );
    expect(wasCommitted()).toBe(true);
  });

  it('locks the account when the failure threshold is reached', async () => {
    const { useCase, lockUntil } = setup({
      passwordOk: false,
      failedAttempts: 3,
    });
    await expect(useCase.execute(creds)).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(lockUntil).toHaveBeenCalledWith(
      expect.any(String),
      new Date('2026-11-10T10:15:00Z'),
    );
  });

  it('does not check the password of a disabled account before verifying it (no status leak)', async () => {
    const user = User.register({
      email: Email.create('a@b.test'),
      passwordHash: 'hash',
      roles: [],
      now: NOW,
    });
    user.deactivate();
    const wrong = setup({ user, passwordOk: false });
    await expect(wrong.useCase.execute(creds)).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });

    const right = setup({ user, passwordOk: true });
    await expect(right.useCase.execute(creds)).rejects.toMatchObject({
      code: 'ACCOUNT_DISABLED',
    });
  });

  it('issues a session and resets the counters on success', async () => {
    const { useCase, recordSuccessfulLogin, save, record } = setup({
      passwordOk: true,
    });
    await expect(useCase.execute(creds)).resolves.toMatchObject({
      accessToken: 'jwt',
      refreshToken: 'raw-refresh',
    });
    expect(recordSuccessfulLogin).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LOGIN_SUCCEEDED' }),
    );
  });
});
