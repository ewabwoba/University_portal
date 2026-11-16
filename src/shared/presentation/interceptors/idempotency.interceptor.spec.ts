import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of, throwError } from 'rxjs';
import type {
  IdempotencyBeginResult,
  IdempotencyStore,
} from '../../application/ports/idempotency-store.port.js';
import {
  ConflictError,
  UnauthenticatedError,
  ValidationError,
} from '../../domain/domain-error.js';
import { IdempotencyInterceptor } from './idempotency.interceptor.js';

const KEY = 'pay-2026-0001';

function setup(
  options: {
    begin?: IdempotencyBeginResult;
    header?: string | undefined;
    user?: { id: string } | undefined;
  } = {},
) {
  const setHeader = vi.fn();
  const req = {
    method: 'POST',
    originalUrl: '/api/v1/payments',
    body: { amount: 100 },
    headers:
      'header' in options
        ? { 'idempotency-key': options.header }
        : { 'idempotency-key': KEY },
    user: 'user' in options ? options.user : { id: 'user-1' },
  };
  const context = {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({ setHeader }),
    }),
  } as unknown as ExecutionContext;

  // Keep the mocks as standalone functions so assertions do not reference unbound methods.
  const store = {
    begin: vi.fn().mockResolvedValue(options.begin ?? { kind: 'started' }),
    complete: vi.fn().mockResolvedValue(undefined),
    abandon: vi.fn().mockResolvedValue(undefined),
  };
  const config = { get: () => ({ keyMaxLength: 64 }) };
  const interceptor = new IdempotencyInterceptor(
    store as IdempotencyStore,
    config as never,
  );

  return { interceptor, store, context, setHeader };
}

describe('IdempotencyInterceptor', () => {
  it('runs the handler on first use and records the response', async () => {
    const { interceptor, store, context } = setup();
    const handle = vi.fn(() => of({ id: 'p1' }));
    const handler: CallHandler = { handle };

    const result = await firstValueFrom(
      await interceptor.intercept(context, handler),
    );

    expect(result).toEqual({ id: 'p1' });
    expect(handle).toHaveBeenCalledOnce();
    expect(store.complete).toHaveBeenCalledWith({
      principalId: 'user-1',
      key: KEY,
      responseBody: { id: 'p1' },
    });
  });

  it('replays the stored body without running the handler', async () => {
    const { interceptor, context, setHeader } = setup({
      begin: { kind: 'replay', responseBody: { id: 'p1' } },
    });
    const handle = vi.fn();
    const handler: CallHandler = { handle };

    const result = await firstValueFrom(
      await interceptor.intercept(context, handler),
    );

    expect(result).toEqual({ id: 'p1' });
    expect(handle).not.toHaveBeenCalled();
    expect(setHeader).toHaveBeenCalledWith('idempotent-replayed', 'true');
  });

  it('rejects a concurrent duplicate with 409-class error', async () => {
    const { interceptor, context } = setup({ begin: { kind: 'in_progress' } });
    await expect(
      interceptor.intercept(context, { handle: vi.fn() }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects key reuse with a different request', async () => {
    const { interceptor, context } = setup({ begin: { kind: 'mismatch' } });
    await expect(
      interceptor.intercept(context, { handle: vi.fn() }),
    ).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
    });
  });

  it('releases the key when the handler fails so the client can retry', async () => {
    const { interceptor, store, context } = setup();
    const failing: CallHandler = {
      handle: () => throwError(() => new Error('boom')),
    };

    await expect(
      firstValueFrom(await interceptor.intercept(context, failing)),
    ).rejects.toThrow('boom');
    expect(store.abandon).toHaveBeenCalledWith({
      principalId: 'user-1',
      key: KEY,
    });
    expect(store.complete).not.toHaveBeenCalled();
  });

  it('still returns the response if recording it fails', async () => {
    const { interceptor, store, context } = setup();
    store.complete.mockRejectedValue(new Error('db down'));

    const result = await firstValueFrom(
      await interceptor.intercept(context, { handle: () => of('ok') }),
    );
    expect(result).toBe('ok');
  });

  it.each([
    ['missing', { header: undefined }, 'IDEMPOTENCY_KEY_REQUIRED'],
    ['malformed', { header: 'has spaces!' }, 'IDEMPOTENCY_KEY_INVALID'],
    ['too long', { header: 'a'.repeat(65) }, 'IDEMPOTENCY_KEY_INVALID'],
  ])('rejects a %s key', async (_label, options, code) => {
    const { interceptor, context, store } = setup(options);
    await expect(
      interceptor.intercept(context, { handle: vi.fn() }),
    ).rejects.toMatchObject({ code });
    await expect(
      interceptor.intercept(context, { handle: vi.fn() }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(store.begin).not.toHaveBeenCalled();
  });

  it('requires an authenticated principal', async () => {
    const { interceptor, context } = setup({ user: undefined });
    await expect(
      interceptor.intercept(context, { handle: vi.fn() }),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});
