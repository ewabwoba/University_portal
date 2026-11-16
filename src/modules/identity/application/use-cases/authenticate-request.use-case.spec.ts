import type {
  AccessContext,
  AccessContextReader,
} from '../ports/access-context-reader.port.js';
import type { AccessTokenService } from '../ports/access-token.service.port.js';
import { AuthenticateRequestUseCase } from './authenticate-request.use-case.js';

const ISSUED = new Date('2026-11-10T10:00:00.500Z');
const context = (overrides: Partial<AccessContext> = {}): AccessContext => ({
  id: 'u1',
  email: 'a@b.test',
  isActive: true,
  passwordChangedAt: null,
  roles: ['STUDENT'],
  permissions: ['x:y:z'],
  ...overrides,
});

function build(loaded: AccessContext | null) {
  const verify = vi.fn().mockResolvedValue({ userId: 'u1', issuedAt: ISSUED });
  const load = vi.fn().mockResolvedValue(loaded);
  return new AuthenticateRequestUseCase(
    { verify } as unknown as AccessTokenService,
    { load } as unknown as AccessContextReader,
  );
}

describe('AuthenticateRequestUseCase', () => {
  it('builds the principal from CURRENT roles and permissions', async () => {
    const principal = await build(context()).execute('token');
    expect(principal).toMatchObject({ id: 'u1', roles: ['STUDENT'] });
    expect(principal.permissions.has('x:y:z')).toBe(true);
  });

  it.each([
    ['the account no longer exists', null],
    ['the account was deactivated', context({ isActive: false })],
  ])('rejects when %s', async (_label, loaded) => {
    await expect(build(loaded).execute('token')).rejects.toMatchObject({
      code: 'ACCOUNT_DISABLED',
    });
  });

  it('rejects a token issued even 1ms before the last password change', async () => {
    const changed = new Date(ISSUED.getTime() + 1);
    await expect(
      build(context({ passwordChangedAt: changed })).execute('token'),
    ).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
  });

  it('accepts a token issued at or after the password change', async () => {
    await expect(
      build(context({ passwordChangedAt: ISSUED })).execute('token'),
    ).resolves.toBeDefined();
    await expect(
      build(
        context({ passwordChangedAt: new Date(ISSUED.getTime() - 1) }),
      ).execute('token'),
    ).resolves.toBeDefined();
  });
});
