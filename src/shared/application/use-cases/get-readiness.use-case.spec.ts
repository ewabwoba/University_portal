import { ServiceUnavailableError } from '../../domain/domain-error.js';
import { GetReadinessUseCase } from './get-readiness.use-case.js';

describe('GetReadinessUseCase', () => {
  it('reports every check as up when healthy', async () => {
    const useCase = new GetReadinessUseCase([
      { name: 'database', check: async () => {} },
    ]);
    await expect(useCase.execute()).resolves.toEqual({
      status: 'ok',
      checks: { database: 'up' },
    });
  });

  it('names the failing checks without leaking the cause', async () => {
    const useCase = new GetReadinessUseCase([
      {
        name: 'database',
        check: async () => {
          throw new Error('password authentication failed');
        },
      },
      { name: 'cache', check: async () => {} },
    ]);

    const error = await useCase.execute().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ServiceUnavailableError);
    expect((error as ServiceUnavailableError).details).toEqual({
      failed: ['database'],
    });
    expect((error as Error).message).not.toContain('password');
  });
});
