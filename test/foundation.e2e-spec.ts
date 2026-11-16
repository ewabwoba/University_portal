import { Body, Controller, Get, Module, Post } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IsString } from 'class-validator';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { IDEMPOTENCY_STORE } from '../src/shared/application/ports/idempotency-store.port.js';
import type {
  IdempotencyBeginResult,
  IdempotencyStore,
} from '../src/shared/application/ports/idempotency-store.port.js';
import { NotFoundError } from '../src/shared/domain/domain-error.js';
import { PrismaService } from '../src/shared/infrastructure/prisma/prisma.service.js';
import { Public } from '../src/shared/presentation/decorators/public.decorator.js';
import { Idempotent } from '../src/shared/presentation/decorators/idempotent.decorator.js';
import { validEnv } from './support/valid-env.js';

class EchoDto {
  @IsString() name!: string;
}

let executions = 0;

/** Test-only routes. @Public() because the real auth guards are exercised in the identity tests. */
@Public()
@Controller('probe')
class ProbeController {
  @Get('ping') ping() {
    return { pong: true };
  }
  @Get('missing') missing() {
    throw new NotFoundError('Student not found.', {
      code: 'STUDENT_NOT_FOUND',
    });
  }
  @Get('boom') boom() {
    throw new Error('secret internal detail');
  }
  @Post('validate') validate(@Body() dto: EchoDto) {
    return dto;
  }
  @Post('pay') @Idempotent() pay(@Body() body: { amount: number }) {
    executions++;
    return { receipt: `R-${executions}`, amount: body.amount };
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

/** In-memory stand-in for the Prisma-backed store, same contract. */
class MemoryIdempotencyStore implements IdempotencyStore {
  private rows = new Map<
    string,
    { hash: string; done: boolean; body?: unknown }
  >();
  async begin({
    principalId,
    key,
    requestHash,
  }: {
    principalId: string;
    key: string;
    requestHash: string;
  }): Promise<IdempotencyBeginResult> {
    const id = `${principalId}:${key}`;
    const row = this.rows.get(id);
    if (!row) {
      this.rows.set(id, { hash: requestHash, done: false });
      return { kind: 'started' };
    }
    if (row.hash !== requestHash) return { kind: 'mismatch' };
    return row.done
      ? { kind: 'replay', responseBody: row.body }
      : { kind: 'in_progress' };
  }
  async complete({
    principalId,
    key,
    responseBody,
  }: {
    principalId: string;
    key: string;
    responseBody: unknown;
  }) {
    const row = this.rows.get(`${principalId}:${key}`)!;
    row.done = true;
    row.body = responseBody;
  }
  async abandon({ principalId, key }: { principalId: string; key: string }) {
    this.rows.delete(`${principalId}:${key}`);
  }
}

async function createApp(
  env: Record<string, string> = {},
  dbHealthy = true,
): Promise<INestApplication> {
  Object.assign(process.env, validEnv, env);
  const fakePrisma = {
    $connect: vi.fn(),
    $disconnect: vi.fn(),
    $queryRaw: dbHealthy
      ? vi.fn().mockResolvedValue([])
      : vi.fn().mockRejectedValue(new Error('ECONNREFUSED 10.0.0.5:5432')),
  };

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule, ProbeModule],
  })
    .overrideProvider(PrismaService)
    .useValue(fakePrisma)
    .overrideProvider(IDEMPOTENCY_STORE)
    .useValue(new MemoryIdempotencyStore())
    .compile();

  const app = moduleRef.createNestApplication();
  app.use(helmet());
  // Stand-in for the Phase 2 JWT guard, which will populate req.user.
  app.use(
    (
      req: Request & { user?: { id: string } },
      _res: Response,
      next: NextFunction,
    ) => {
      req.user = { id: 'user-1' };
      next();
    },
  );
  await app.init();
  return app;
}

describe('Foundation (AppModule wired end to end, database faked)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('serves liveness and readiness', async () => {
    await request(app.getHttpServer())
      .get('/health/live')
      .expect(200, { status: 'ok' });
    await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200, { status: 'ok', checks: { database: 'up' } });
  });

  it('sets security headers and echoes a request id', async () => {
    const res = await request(app.getHttpServer())
      .get('/probe/ping')
      .expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('returns RFC 9457 problems for domain errors, with the correlation id', async () => {
    const res = await request(app.getHttpServer())
      .get('/probe/missing')
      .set('x-request-id', 'trace-42')
      .expect(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({
      status: 404,
      code: 'STUDENT_NOT_FOUND',
      correlationId: 'trace-42',
      instance: '/probe/missing',
    });
  });

  it('rejects a malformed inbound request id instead of trusting it', async () => {
    const res = await request(app.getHttpServer())
      .get('/probe/ping')
      .set('x-request-id', 'bad id\twith spaces')
      .expect(200);
    expect(res.headers['x-request-id']).not.toContain('bad id');
  });

  it('validates input and strips nothing silently', async () => {
    const res = await request(app.getHttpServer())
      .post('/probe/validate')
      .send({ name: 5, extra: 'x' })
      .expect(422);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    const fields = res.body.errors.map((e: { field: string }) => e.field);
    expect(fields).toEqual(expect.arrayContaining(['name', 'extra']));
  });

  it('never leaks the cause of unexpected errors', async () => {
    const res = await request(app.getHttpServer())
      .get('/probe/boom')
      .expect(500);
    expect(res.body.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('secret internal detail');
  });

  describe('@Idempotent()', () => {
    it('executes once and replays the same response for a retried key', async () => {
      executions = 0;
      const first = await request(app.getHttpServer())
        .post('/probe/pay')
        .set('Idempotency-Key', 'k-1')
        .send({ amount: 500 })
        .expect(201);
      const retry = await request(app.getHttpServer())
        .post('/probe/pay')
        .set('Idempotency-Key', 'k-1')
        .send({ amount: 500 })
        .expect(201);

      expect(executions).toBe(1);
      expect(retry.body).toEqual(first.body);
      expect(retry.headers['idempotent-replayed']).toBe('true');
      expect(first.headers['idempotent-replayed']).toBeUndefined();
    });

    it('rejects a reused key with a different payload', async () => {
      await request(app.getHttpServer())
        .post('/probe/pay')
        .set('Idempotency-Key', 'k-2')
        .send({ amount: 1 })
        .expect(201);
      const res = await request(app.getHttpServer())
        .post('/probe/pay')
        .set('Idempotency-Key', 'k-2')
        .send({ amount: 2 })
        .expect(422);
      expect(res.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    });

    it('requires the header', async () => {
      const res = await request(app.getHttpServer())
        .post('/probe/pay')
        .send({ amount: 1 })
        .expect(422);
      expect(res.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    });
  });
});

describe('Readiness when the database is down', () => {
  it('returns 503 and does not expose the connection error', async () => {
    const app = await createApp({}, false);
    const res = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(503);
    expect(res.body).toMatchObject({
      code: 'NOT_READY',
      details: { failed: ['database'] },
    });
    expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED');
    await app.close();
  });
});

describe('Rate limiting', () => {
  it('returns 429 problem+json past the configured limit, but never throttles health probes', async () => {
    const app = await createApp({ THROTTLE_LIMIT: '3' });
    for (let i = 0; i < 3; i++)
      await request(app.getHttpServer()).get('/probe/ping').expect(200);

    const limited = await request(app.getHttpServer())
      .get('/probe/ping')
      .expect(429);
    expect(limited.headers['content-type']).toContain(
      'application/problem+json',
    );
    expect(limited.body.status).toBe(429);

    for (let i = 0; i < 6; i++)
      await request(app.getHttpServer()).get('/health/live').expect(200);
    await app.close();
  });
});
