import { resolvePage, toPaginated } from './pagination.js';

const settings = { defaultLimit: 20, maxLimit: 100 };

describe('pagination', () => {
  it('applies defaults', () => {
    expect(resolvePage({}, settings)).toEqual({ page: 1, limit: 20, skip: 0 });
  });

  it('clamps the limit to the configured maximum and the page to at least 1', () => {
    expect(resolvePage({ limit: 5_000 }, settings).limit).toBe(100);
    expect(resolvePage({ page: -3, limit: 0 }, settings)).toEqual({
      page: 1,
      limit: 1,
      skip: 0,
    });
  });

  it('computes skip and total pages', () => {
    const request = resolvePage({ page: 3, limit: 10 }, settings);
    expect(request.skip).toBe(20);
    expect(toPaginated(['x'], 25, request)).toMatchObject({
      page: 3,
      limit: 10,
      total: 25,
      totalPages: 3,
    });
  });
});
