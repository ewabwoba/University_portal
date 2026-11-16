import { randomUUID } from 'node:crypto';
import type { INestApplication, Type } from '@nestjs/common';
import request from 'supertest';
import { IdentitySeeder } from '../../src/modules/identity/infrastructure/seed/identity.seeder.js';
import { PERMISSION_CATALOG } from '../../src/seed/permission-catalog.js';
import type { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service.js';
import { resetDatabase } from './database.js';
import { ADMIN_EMAIL, ADMIN_PASSWORD, createTestApp } from './test-app.js';

export const USER_PASSWORD = 'Student-Pass-123';

export interface TestUser {
  id: string;
  email: string;
  password: string;
  token: string;
}

export interface Harness {
  app: INestApplication;
  admin: { id: string; token: string };
  http: () => ReturnType<typeof request>;
  bearer: (token: string) => { Authorization: string };
  /** Creates a user through the real API (as the admin) and signs them in. */
  createUser: (roles?: string[]) => Promise<TestUser>;
  /** Replaces a role's permissions through the real API (as the admin). */
  setRolePermissions: (
    roleName: string,
    permissions: string[],
  ) => Promise<void>;
  /** POST with a fresh Idempotency-Key. */
  post: (path: string, token: string, body?: object) => request.Test;
  close: () => Promise<void>;
}

/** Empty database -> real app -> seeded roles/permissions -> signed-in SUPER_ADMIN. */
export async function startHarness(
  prisma: PrismaService,
  options: { env?: Record<string, string>; extraModules?: Type[] } = {},
): Promise<Harness> {
  await prisma.$connect();
  await resetDatabase(prisma);
  const app = await createTestApp(prisma, options);
  await app.get(IdentitySeeder, { strict: false }).run(PERMISSION_CATALOG);

  const http = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const signIn = async (email: string, password: string) =>
    (await http().post('/auth/login').send({ email, password }).expect(200))
      .body.accessToken as string;

  const adminToken = await signIn(ADMIN_EMAIL, ADMIN_PASSWORD);
  const adminId = (
    await http().get('/auth/me').set(bearer(adminToken)).expect(200)
  ).body.id as string;

  return {
    app,
    admin: { id: adminId, token: adminToken },
    http,
    bearer,
    post: (path, token, body = {}) =>
      http()
        .post(path)
        .set(bearer(token))
        .set('Idempotency-Key', randomUUID())
        .send(body),
    async createUser(roles = ['STUDENT']) {
      const email = `u${randomUUID().slice(0, 8)}@university.test`;
      const res = await http()
        .post('/users')
        .set(bearer(adminToken))
        .set('Idempotency-Key', randomUUID())
        .send({ email, password: USER_PASSWORD, roles })
        .expect(201);
      return {
        id: res.body.id,
        email,
        password: USER_PASSWORD,
        token: await signIn(email, USER_PASSWORD),
      };
    },
    async setRolePermissions(roleName, permissions) {
      const roles = (
        await http().get('/roles').set(bearer(adminToken)).expect(200)
      ).body as { id: string; name: string }[];
      const role = roles.find((r) => r.name === roleName)!;
      await http()
        .put(`/roles/${role.id}/permissions`)
        .set(bearer(adminToken))
        .send({ permissions })
        .expect(204);
    },
    close: () => app.close(),
  };
}

export function expectProblem(
  res: request.Response,
  status: number,
  code: string,
): void {
  expect(res.status, JSON.stringify(res.body)).toBe(status);
  expect(res.headers['content-type']).toContain('application/problem+json');
  expect(res.body.code).toBe(code);
}
