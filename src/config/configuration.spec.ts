import { validEnv } from '../../test/support/valid-env.js';
import { buildConfiguration } from './configuration.js';

describe('buildConfiguration', () => {
  it('maps a valid environment to the typed config tree', () => {
    const config = buildConfiguration(validEnv);

    expect(config.app.port).toBe(3000);
    expect(config.app.isProduction).toBe(false);
    expect(config.app.swaggerEnabled).toBe(false);
    expect(config.outbox.enabled).toBe(false);
    expect(config.logging.pretty).toBe(false);
  });

  it('parses comma-separated CORS origins and drops blanks', () => {
    const config = buildConfiguration({
      ...validEnv,
      CORS_ORIGINS: ' http://a.test ,, http://b.test ',
    });
    expect(config.app.corsOrigins).toEqual(['http://a.test', 'http://b.test']);

    expect(
      buildConfiguration({ ...validEnv, CORS_ORIGINS: '' }).app.corsOrigins,
    ).toEqual([]);
  });

  it('converts human units to milliseconds', () => {
    const config = buildConfiguration(validEnv);
    expect(config.idempotency.ttlMs).toBe(24 * 60 * 60 * 1000);
    expect(config.idempotency.lockTimeoutMs).toBe(60 * 1000);
  });

  it('fails fast and names every missing variable', () => {
    const {
      DATABASE_URL: _db,
      THROTTLE_LIMIT: _limit,
      ...incomplete
    } = validEnv;
    expect(() => buildConfiguration(incomplete)).toThrowError(
      /DATABASE_URL[\s\S]*THROTTLE_LIMIT|THROTTLE_LIMIT[\s\S]*DATABASE_URL/,
    );
  });

  it('rejects invalid values without echoing them', () => {
    const attempt = () =>
      buildConfiguration({
        ...validEnv,
        PORT: 'not-a-port',
        NODE_ENV: 'staging-secret',
      });
    expect(attempt).toThrowError(/PORT/);
    expect(attempt).toThrowError(/NODE_ENV/);
    expect(attempt).not.toThrowError(/not-a-port|staging-secret/);
  });
});
