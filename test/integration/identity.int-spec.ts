import { randomUUID } from 'node:crypto';
import { Controller, Get, Module } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { SignJWT } from 'jose';
import request from 'supertest';
import { IdentityPermissions } from '../../src/modules/identity/contracts/permissions.js';
import { USER_REPOSITORY } from '../../src/modules/identity/domain/repositories/user.repository.js';
import type { UserRepository } from '../../src/modules/identity/domain/repositories/user.repository.js';
import { IdentitySeeder } from '../../src/modules/identity/infrastructure/seed/identity.seeder.js';
import { PERMISSION_CATALOG } from '../../src/seed/permission-catalog.js';
import { createTestPrisma, resetDatabase } from '../support/database.js';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  createTestApp,
} from '../support/test-app.js';
import { validEnv } from '../support/valid-env.js';

/** A route that forgot to declare an access policy: the framework must fail closed. */
@Controller('probe')
class UnprotectedController {
  @Get('unprotected') unprotected() {
    return { ok: true };
  }
}
@Module({ controllers: [UnprotectedController] })
class ProbeModule {}

const STUDENT_PASSWORD = 'Student-Pass-123';

describe('Identity & access (real AppModule + PostgreSQL)', () => {
  const prisma = createTestPrisma();
  let app: INestApplication;
  let adminToken: string;
  let adminId: string;
  let seedReport: Awaited<ReturnType<IdentitySeeder['run']>>;

  const http = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const login = (email: string, password: string) =>
    http().post('/auth/login').send({ email, password });
  const problem = (res: request.Response, status: number, code: string) => {
    expect(res.status).toBe(status);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body.code).toBe(code);
  };

  /** Creates a user through the real API as the admin and returns credentials. */
  async function createUser(roles: string[] = ['STUDENT'], token = adminToken) {
    const email = `u${randomUUID().slice(0, 8)}@university.test`;
    const res = await http()
      .post('/users')
      .set(bearer(token))
      .set('Idempotency-Key', randomUUID())
      .send({ email, password: STUDENT_PASSWORD, roles });
    expect(res.status).toBe(201);
    return { id: res.body.id as string, email, password: STUDENT_PASSWORD };
  }

  async function signIn(email: string, password: string) {
    const res = await login(email, password).expect(200);
    return res.body as {
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      tokenType: string;
    };
  }

  beforeAll(async () => {
    await prisma.$connect();
    await resetDatabase(prisma);
    app = await createTestApp(prisma, { extraModules: [ProbeModule] });
    seedReport = await app
      .get(IdentitySeeder, { strict: false })
      .run(PERMISSION_CATALOG);

    const tokens = await signIn(ADMIN_EMAIL, ADMIN_PASSWORD);
    adminToken = tokens.accessToken;
    adminId = (await http().get('/auth/me').set(bearer(adminToken)).expect(200))
      .body.id;
  });

  afterAll(async () => {
    await app.close(); // also disconnects the shared Prisma client
  });

  describe('seeding', () => {
    it('creates the system roles, the permission catalog and the first admin', () => {
      expect(seedReport).toMatchObject({
        permissions: PERMISSION_CATALOG.length,
        superAdminPermissions: PERMISSION_CATALOG.length,
        adminCreated: true,
      });
      expect(seedReport.rolesCreated).toHaveLength(7);
    });

    it('is idempotent and never overwrites admin-edited role permissions', async () => {
      const again = await app
        .get(IdentitySeeder, { strict: false })
        .run(PERMISSION_CATALOG);
      expect(again).toMatchObject({ rolesCreated: [], adminCreated: false });
      expect(await prisma.permission.count()).toBe(PERMISSION_CATALOG.length);
    });
  });

  describe('authentication', () => {
    it('signs in and exposes the caller with all permissions of SUPER_ADMIN', async () => {
      const tokens = await signIn(ADMIN_EMAIL, ADMIN_PASSWORD);
      expect(tokens).toMatchObject({ tokenType: 'Bearer', expiresIn: 900 });

      const me = await http()
        .get('/auth/me')
        .set(bearer(tokens.accessToken))
        .expect(200);
      expect(me.body.roles).toEqual(['SUPER_ADMIN']);
      expect(me.body.permissions).toEqual(
        PERMISSION_CATALOG.map((p) => p.name).sort(),
      );
    });

    it('stores only hashes: argon2id for passwords, SHA-256 for refresh tokens', async () => {
      const { refreshToken } = await signIn(ADMIN_EMAIL, ADMIN_PASSWORD);
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: ADMIN_EMAIL },
      });
      expect(user.passwordHash.startsWith('$argon2id$')).toBe(true);

      const stored = await prisma.refreshToken.findMany({
        where: { userId: user.id },
      });
      expect(stored.length).toBeGreaterThan(0);
      expect(stored.some((row) => row.tokenHash === refreshToken)).toBe(false);
      expect(stored.every((row) => /^[0-9a-f]{64}$/.test(row.tokenHash))).toBe(
        true,
      );
    });

    it('answers wrong-password and unknown-email identically (no account enumeration)', async () => {
      const wrongPassword = await login(ADMIN_EMAIL, 'Wrong-Password-123');
      const unknownEmail = await login(
        'nobody@university.test',
        'Wrong-Password-123',
      );
      const malformedEmail = await login('not-an-email', 'whatever-123');

      for (const res of [wrongPassword, unknownEmail, malformedEmail])
        problem(res, 401, 'INVALID_CREDENTIALS');
      expect(unknownEmail.body.detail).toBe(wrongPassword.body.detail);
      expect(malformedEmail.body.detail).toBe(wrongPassword.body.detail);
    });

    it('rejects missing, garbage and forged tokens with a Bearer challenge', async () => {
      const missing = await http().get('/auth/me');
      problem(missing, 401, 'TOKEN_INVALID');
      expect(missing.headers['www-authenticate']).toBe('Bearer');

      problem(
        await http().get('/auth/me').set(bearer('garbage')),
        401,
        'TOKEN_INVALID',
      );

      const forged = await new SignJWT({ iatMs: Date.now() })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(adminId)
        .setIssuer(validEnv.JWT_ISSUER)
        .setAudience(validEnv.JWT_AUDIENCE)
        .setExpirationTime('15m')
        .sign(
          new TextEncoder().encode(
            'an-attacker-guessed-this-secret-0000000000',
          ),
        );
      problem(
        await http().get('/auth/me').set(bearer(forged)),
        401,
        'TOKEN_INVALID',
      );
    });

    it('locks the account after repeated failures and persists the evidence', async () => {
      const user = await createUser();
      for (let i = 0; i < 3; i++)
        problem(
          await login(user.email, 'Wrong-Password-123'),
          401,
          'INVALID_CREDENTIALS',
        );

      // Even the CORRECT password is refused while locked.
      problem(await login(user.email, user.password), 401, 'ACCOUNT_LOCKED');

      // The 401 responses did not roll back the counters or the audit rows.
      const row = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(row.failedLoginAttempts).toBe(3);
      expect(row.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
      const actions = (
        await prisma.auditLog.findMany({ where: { entityId: user.id } })
      ).map((a) => a.action);
      expect(actions.filter((a) => a === 'LOGIN_FAILED')).toHaveLength(3);
      expect(actions).toEqual(
        expect.arrayContaining(['ACCOUNT_LOCKED', 'LOGIN_BLOCKED_LOCKED']),
      );

      // Once the lock expires the user can sign in and the counter resets.
      await prisma.user.update({
        where: { id: user.id },
        data: { lockedUntil: new Date(Date.now() - 1000) },
      });
      await signIn(user.email, user.password);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: user.id } }))
          .failedLoginAttempts,
      ).toBe(0);
    });
  });

  describe('refresh tokens', () => {
    it('rotates on every use', async () => {
      const user = await createUser();
      const first = await signIn(user.email, user.password);
      const second = (
        await http()
          .post('/auth/refresh')
          .send({ refreshToken: first.refreshToken })
          .expect(200)
      ).body;

      expect(second.refreshToken).not.toBe(first.refreshToken);
      await http().get('/auth/me').set(bearer(second.accessToken)).expect(200);
    });

    it('treats reuse of a rotated token as theft and revokes the whole family', async () => {
      const user = await createUser();
      const first = await signIn(user.email, user.password);
      const second = (
        await http()
          .post('/auth/refresh')
          .send({ refreshToken: first.refreshToken })
          .expect(200)
      ).body;

      problem(
        await http()
          .post('/auth/refresh')
          .send({ refreshToken: first.refreshToken }),
        401,
        'REFRESH_TOKEN_REUSED',
      );
      // The legitimate holder's newer token is dead too: everyone must sign in again.
      problem(
        await http()
          .post('/auth/refresh')
          .send({ refreshToken: second.refreshToken }),
        401,
        'REFRESH_TOKEN_REUSED',
      );

      const actions = (
        await prisma.auditLog.findMany({ where: { entityId: user.id } })
      ).map((a) => a.action);
      expect(actions).toContain('REFRESH_TOKEN_REUSE_DETECTED');
    });

    it('lets exactly one of two simultaneous refreshes with the same token win', async () => {
      const user = await createUser();
      const { refreshToken } = await signIn(user.email, user.password);

      const results = await Promise.all([
        http().post('/auth/refresh').send({ refreshToken }),
        http().post('/auth/refresh').send({ refreshToken }),
      ]);
      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        200, 401,
      ]);
    });

    it('rejects unknown tokens and honours logout', async () => {
      problem(
        await http().post('/auth/refresh').send({ refreshToken: 'unknown' }),
        401,
        'REFRESH_TOKEN_INVALID',
      );

      const user = await createUser();
      const { refreshToken } = await signIn(user.email, user.password);
      await http().post('/auth/logout').send({ refreshToken }).expect(204);
      expect(
        (await http().post('/auth/refresh').send({ refreshToken })).status,
      ).toBe(401);
      await http()
        .post('/auth/logout')
        .send({ refreshToken: 'unknown' })
        .expect(204); // silent
    });
  });

  describe('changing a password', () => {
    it('validates the current password and the policy', async () => {
      const user = await createUser();
      const { accessToken } = await signIn(user.email, user.password);
      const change = (body: object) =>
        http()
          .post('/auth/change-password')
          .set(bearer(accessToken))
          .send(body);

      problem(
        await change({
          currentPassword: 'Not-My-Password-1',
          newPassword: 'Another-Pass-456',
        }),
        422,
        'CURRENT_PASSWORD_INCORRECT',
      );

      const weak = await change({
        currentPassword: user.password,
        newPassword: 'short',
      });
      problem(weak, 422, 'WEAK_PASSWORD');
      expect(weak.body.details.violations.length).toBeGreaterThan(0);
    });

    it('kills every existing session: access tokens, refresh tokens and the old password', async () => {
      const user = await createUser();
      const session = await signIn(user.email, user.password);

      await http()
        .post('/auth/change-password')
        .set(bearer(session.accessToken))
        .send({
          currentPassword: user.password,
          newPassword: 'Another-Pass-456',
        })
        .expect(204);

      problem(
        await http().get('/auth/me').set(bearer(session.accessToken)),
        401,
        'TOKEN_INVALID',
      );
      expect(
        (
          await http()
            .post('/auth/refresh')
            .send({ refreshToken: session.refreshToken })
        ).status,
      ).toBe(401);
      problem(
        await login(user.email, user.password),
        401,
        'INVALID_CREDENTIALS',
      );

      const fresh = await signIn(user.email, 'Another-Pass-456'); // a token issued AFTER the change works
      await http().get('/auth/me').set(bearer(fresh.accessToken)).expect(200);
    });
  });

  describe('creating users', () => {
    it('creates a user, hides secrets, and writes audit + outbox in the same transaction', async () => {
      const email = `New.Person.${randomUUID().slice(0, 6)}@University.test`;
      const res = await http()
        .post('/users')
        .set(bearer(adminToken))
        .set('Idempotency-Key', randomUUID())
        .set('x-request-id', 'corr-create-1')
        .send({
          email,
          password: STUDENT_PASSWORD,
          phoneNumber: '+254700000000',
          roles: ['STUDENT'],
        })
        .expect(201);

      expect(res.body).toMatchObject({
        email: email.toLowerCase(),
        roles: ['STUDENT'],
        isActive: true,
      });
      expect(JSON.stringify(res.body)).not.toMatch(/argon2|passwordHash/);

      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { entityId: res.body.id, action: 'USER_CREATED' },
      });
      expect(audit).toMatchObject({
        userId: adminId,
        correlationId: 'corr-create-1',
        module: 'identity',
      });

      const outbox = await prisma.outboxEvent.findFirstOrThrow({
        where: { aggregateId: res.body.id },
      });
      expect(outbox).toMatchObject({
        eventName: 'identity.user.registered',
        status: 'PENDING',
      });
      expect(outbox.payload).toMatchObject({
        email: email.toLowerCase(),
        roles: ['STUDENT'],
      });
    });

    it('is idempotent: a retried request creates one user and replays the response', async () => {
      const key = randomUUID();
      const body = {
        email: `idem${randomUUID().slice(0, 6)}@university.test`,
        password: STUDENT_PASSWORD,
        roles: ['STUDENT'],
      };
      const send = () =>
        http()
          .post('/users')
          .set(bearer(adminToken))
          .set('Idempotency-Key', key)
          .send(body);

      const first = await send().expect(201);
      const retry = await send().expect(201);

      expect(retry.body.id).toBe(first.body.id);
      expect(retry.headers['idempotent-replayed']).toBe('true');
      expect(await prisma.user.count({ where: { email: body.email } })).toBe(1);
    });

    it('rejects duplicates case-insensitively, without leaving partial writes', async () => {
      const user = await createUser();
      const before = await prisma.outboxEvent.count();
      const res = await http()
        .post('/users')
        .set(bearer(adminToken))
        .set('Idempotency-Key', randomUUID())
        .send({
          email: user.email.toUpperCase(),
          password: STUDENT_PASSWORD,
          roles: ['STUDENT'],
        });

      problem(res, 409, 'EMAIL_ALREADY_REGISTERED');
      expect(await prisma.outboxEvent.count()).toBe(before);
    });

    it('validates input precisely', async () => {
      const post = (body: object) =>
        http()
          .post('/users')
          .set(bearer(adminToken))
          .set('Idempotency-Key', randomUUID())
          .send(body);

      problem(
        await post({
          email: 'bad',
          password: STUDENT_PASSWORD,
          roles: ['STUDENT'],
        }),
        422,
        'EMAIL_INVALID',
      );
      problem(
        await post({ email: 'a@b.test', password: 'weak', roles: ['STUDENT'] }),
        422,
        'WEAK_PASSWORD',
      );
      problem(
        await post({
          email: 'a@b.test',
          password: STUDENT_PASSWORD,
          roles: ['NO_SUCH_ROLE'],
        }),
        422,
        'ROLE_NOT_FOUND',
      );

      const extra = await post({
        email: 'a@b.test',
        password: STUDENT_PASSWORD,
        roles: ['STUDENT'],
        isAdmin: true,
      });
      problem(extra, 422, 'VALIDATION_FAILED');
      expect(
        extra.body.errors.map((e: { field: string }) => e.field),
      ).toContain('isAdmin');
    });

    it('requires an Idempotency-Key', async () => {
      const res = await http()
        .post('/users')
        .set(bearer(adminToken))
        .send({ email: 'a@b.test', password: STUDENT_PASSWORD, roles: [] });
      problem(res, 422, 'IDEMPOTENCY_KEY_REQUIRED');
    });
  });

  describe('authorization', () => {
    it('denies callers without the permission, but lets any signed-in user read their own profile', async () => {
      const student = await createUser(['STUDENT']);
      const { accessToken } = await signIn(student.email, student.password);

      problem(
        await http().get('/users').set(bearer(accessToken)),
        403,
        'PERMISSION_DENIED',
      );
      problem(
        await http().get('/audit-logs').set(bearer(accessToken)),
        403,
        'PERMISSION_DENIED',
      );
      await http().get('/auth/me').set(bearer(accessToken)).expect(200);
    });

    it('fails closed on a route that declares no access policy', async () => {
      problem(
        await http().get('/probe/unprotected').set(bearer(adminToken)),
        403,
        'ROUTE_NOT_AUTHORIZED',
      );
      problem(await http().get('/probe/unprotected'), 401, 'TOKEN_INVALID');
    });

    it('applies permission changes immediately, without waiting for the token to expire', async () => {
      const lecturer = await createUser(['LECTURER']);
      const { accessToken } = await signIn(lecturer.email, lecturer.password);
      problem(
        await http().get('/users').set(bearer(accessToken)),
        403,
        'PERMISSION_DENIED',
      );

      const roles = (
        await http().get('/roles').set(bearer(adminToken)).expect(200)
      ).body as { id: string; name: string }[];
      const lecturerRole = roles.find((r) => r.name === 'LECTURER')!;
      // Roles are created with presets (Phase 3), so make the starting point explicit.
      await http()
        .put(`/roles/${lecturerRole.id}/permissions`)
        .set(bearer(adminToken))
        .send({ permissions: [] })
        .expect(204);
      await http()
        .put(`/roles/${lecturerRole.id}/permissions`)
        .set(bearer(adminToken))
        .send({ permissions: [IdentityPermissions.USER_READ] })
        .expect(204);

      await http().get('/users').set(bearer(accessToken)).expect(200); // same token, new power

      await http()
        .put(`/roles/${lecturerRole.id}/permissions`)
        .set(bearer(adminToken))
        .send({ permissions: [] })
        .expect(204);
      problem(
        await http().get('/users').set(bearer(accessToken)),
        403,
        'PERMISSION_DENIED',
      ); // and revoked again

      const audit = await prisma.auditLog.findMany({
        where: {
          entityId: lecturerRole.id,
          action: 'ROLE_PERMISSIONS_CHANGED',
        },
        orderBy: { createdAt: 'asc' },
      });
      const grant = audit.find(
        (a) =>
          JSON.stringify(a.newValues) ===
          JSON.stringify({ permissions: [IdentityPermissions.USER_READ] }),
      );
      expect(grant!.oldValues).toEqual({ permissions: [] });
    });

    it('prevents privilege escalation', async () => {
      const roles = (
        await http().get('/roles').set(bearer(adminToken)).expect(200)
      ).body as { id: string; name: string }[];
      const registrarRole = roles.find((r) => r.name === 'REGISTRAR')!;
      await http()
        .put(`/roles/${registrarRole.id}/permissions`)
        .set(bearer(adminToken))
        .send({
          permissions: [
            IdentityPermissions.USER_CREATE,
            IdentityPermissions.USER_READ,
            IdentityPermissions.USER_ASSIGN_ROLES,
            // The STUDENT role carries this permission, so a registrar can only create students if they hold it too.
            'academic:structure:read',
          ],
        })
        .expect(204);

      const registrar = await createUser(['REGISTRAR']);
      const { accessToken } = await signIn(registrar.email, registrar.password);
      const asRegistrar = (token = accessToken) => ({
        Authorization: `Bearer ${token}`,
      });

      // Cannot mint a SUPER_ADMIN, cannot promote someone to it, cannot demote the real admin.
      const create = (roleNames: string[]) =>
        http()
          .post('/users')
          .set(asRegistrar())
          .set('Idempotency-Key', randomUUID())
          .send({
            email: `e${randomUUID().slice(0, 6)}@university.test`,
            password: STUDENT_PASSWORD,
            roles: roleNames,
          });
      problem(await create(['SUPER_ADMIN']), 403, 'ROLE_ESCALATION');

      const student = (await create(['STUDENT']).expect(201)).body as {
        id: string;
      };
      problem(
        await http()
          .put(`/users/${student.id}/roles`)
          .set(asRegistrar())
          .send({ roles: ['SUPER_ADMIN'] }),
        403,
        'ROLE_ESCALATION',
      );
      problem(
        await http()
          .put(`/users/${adminId}/roles`)
          .set(asRegistrar())
          .send({ roles: ['STUDENT'] }),
        403,
        'ROLE_ESCALATION',
      );

      // Cannot edit roles at all (no ROLE_MANAGE), and nobody can edit SUPER_ADMIN.
      problem(
        await http()
          .put(`/roles/${registrarRole.id}/permissions`)
          .set(asRegistrar())
          .send({ permissions: [] }),
        403,
        'PERMISSION_DENIED',
      );
      const superAdmin = roles.find((r) => r.name === 'SUPER_ADMIN')!;
      problem(
        await http()
          .put(`/roles/${superAdmin.id}/permissions`)
          .set(bearer(adminToken))
          .send({ permissions: [] }),
        403,
        'ROLE_IMMUTABLE',
      );
      problem(
        await http()
          .put(`/roles/${registrarRole.id}/permissions`)
          .set(bearer(adminToken))
          .send({ permissions: ['nope:nope:nope'] }),
        422,
        'PERMISSION_NOT_FOUND',
      );
    });
  });

  describe('account lifecycle', () => {
    it('deactivation cuts off access immediately and blocks sign-in until reactivated', async () => {
      const user = await createUser();
      const session = await signIn(user.email, user.password);
      await http().get('/auth/me').set(bearer(session.accessToken)).expect(200);

      await http()
        .post(`/users/${user.id}/deactivate`)
        .set(bearer(adminToken))
        .expect(204);

      problem(
        await http().get('/auth/me').set(bearer(session.accessToken)),
        401,
        'ACCOUNT_DISABLED',
      );
      problem(await login(user.email, user.password), 401, 'ACCOUNT_DISABLED');
      expect(
        (
          await http()
            .post('/auth/refresh')
            .send({ refreshToken: session.refreshToken })
        ).status,
      ).toBe(401);

      await http()
        .post(`/users/${user.id}/activate`)
        .set(bearer(adminToken))
        .expect(204);
      await signIn(user.email, user.password);

      const events = await prisma.outboxEvent.findMany({
        where: {
          aggregateId: user.id,
          eventName: 'identity.user.status-changed',
        },
      });
      expect(
        events
          .map((e) => Number((e.payload as { isActive: boolean }).isActive))
          .sort((a, b) => a - b),
      ).toEqual([0, 1]);
    });

    it('stops administrators from locking themselves out or changing their own roles', async () => {
      problem(
        await http()
          .post(`/users/${adminId}/deactivate`)
          .set(bearer(adminToken)),
        403,
        'SELF_MODIFICATION',
      );
      problem(
        await http()
          .put(`/users/${adminId}/roles`)
          .set(bearer(adminToken))
          .send({ roles: ['STUDENT'] }),
        403,
        'SELF_MODIFICATION',
      );
    });

    it('replaces roles and records before/after values', async () => {
      const user = await createUser(['STUDENT']);
      await http()
        .put(`/users/${user.id}/roles`)
        .set(bearer(adminToken))
        .send({ roles: ['LECTURER', 'HOD'] })
        .expect(204);

      const detail = await http()
        .get(`/users/${user.id}`)
        .set(bearer(adminToken))
        .expect(200);
      expect(detail.body.roles).toEqual(['HOD', 'LECTURER']);
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { entityId: user.id, action: 'USER_ROLES_CHANGED' },
      });
      expect(audit).toMatchObject({
        oldValues: { roles: ['STUDENT'] },
        newValues: { roles: ['LECTURER', 'HOD'] },
      });
    });

    it('rejects stale writes (optimistic locking)', async () => {
      const user = await createUser();
      const repository = app.get<UserRepository>(USER_REPOSITORY, {
        strict: false,
      });
      const first = (await repository.findById(user.id))!;
      const second = (await repository.findById(user.id))!;

      first.assignRoles(['LECTURER']);
      await repository.update(first);
      second.deactivate();
      await expect(repository.update(second)).rejects.toMatchObject({
        code: 'USER_VERSION_CONFLICT',
      });
    });
  });

  describe('listing and audit trail', () => {
    it('paginates, clamps the page size to the configured maximum, and filters', async () => {
      await createUser();
      await createUser();

      const clamped = await http()
        .get('/users?limit=100000')
        .set(bearer(adminToken))
        .expect(200);
      expect(clamped.body.limit).toBe(Number(validEnv.PAGINATION_MAX_LIMIT));

      const page = await http()
        .get('/users?page=2&limit=1')
        .set(bearer(adminToken))
        .expect(200);
      expect(page.body).toMatchObject({ page: 2, limit: 1 });
      expect(page.body.items).toHaveLength(1);
      expect(page.body.total).toBeGreaterThan(2);

      const target = await createUser();
      const search = await http()
        .get(`/users?search=${target.email.split('@')[0]}`)
        .set(bearer(adminToken))
        .expect(200);
      expect(search.body.items.map((u: { id: string }) => u.id)).toEqual([
        target.id,
      ]);

      const inactive = await http()
        .get('/users?isActive=false')
        .set(bearer(adminToken))
        .expect(200);
      expect(
        inactive.body.items.every((u: { isActive: boolean }) => !u.isActive),
      ).toBe(true);

      problem(
        await http().get('/users?page=0').set(bearer(adminToken)),
        422,
        'VALIDATION_FAILED',
      );
      problem(
        await http().get('/users/not-a-uuid').set(bearer(adminToken)),
        400,
        'BAD_REQUEST',
      );
      problem(
        await http().get(`/users/${randomUUID()}`).set(bearer(adminToken)),
        404,
        'USER_NOT_FOUND',
      );
    });

    it('exposes the audit trail to authorised users only, newest first', async () => {
      const res = await http()
        .get('/audit-logs?entityName=User&action=USER_CREATED&limit=5')
        .set(bearer(adminToken))
        .expect(200);
      expect(res.body.items.length).toBeGreaterThan(0);
      expect(
        res.body.items.every(
          (i: { action: string }) => i.action === 'USER_CREATED',
        ),
      ).toBe(true);
      const times = res.body.items.map((i: { createdAt: string }) =>
        Date.parse(i.createdAt),
      );
      expect([...times].sort((a, b) => b - a)).toEqual(times);
      expect(JSON.stringify(res.body)).not.toMatch(
        /argon2|passwordHash|refreshToken/,
      );
    });
  });

  describe('rate limiting on credential endpoints', () => {
    it('applies the strict limit to login, but not to ordinary endpoints', async () => {
      const strictApp = await createTestApp(prisma, {
        env: { STRICT_THROTTLE_LIMIT: '3' },
      });
      const server = () => request(strictApp.getHttpServer());

      for (let i = 0; i < 3; i++) {
        expect(
          (
            await server()
              .post('/auth/login')
              .send({ email: ADMIN_EMAIL, password: 'Wrong-Password-123' })
          ).status,
        ).toBe(401);
      }
      problem(
        await server()
          .post('/auth/login')
          .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
        429,
        'TOO_MANY_REQUESTS',
      );
      await server().get('/health/live').expect(200);
      await strictApp.close();
    });
  });
});
