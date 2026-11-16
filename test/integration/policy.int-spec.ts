import { randomUUID } from 'node:crypto';
import { POLICY_RESOLVER } from '../../src/modules/policy/contracts/policy-resolver.port.js';
import type { PolicyResolver } from '../../src/modules/policy/contracts/policy-resolver.port.js';
import { PolicyPermissions } from '../../src/modules/policy/contracts/permissions.js';
import { PolicyKeys } from '../../src/modules/policy/contracts/policy-values.js';
import { POLICY_DEFINITIONS } from '../../src/modules/policy/domain/definitions/policy-definitions.js';
import { createTestPrisma } from '../support/database.js';
import { expectProblem, startHarness } from '../support/harness.js';
import type { Harness, TestUser } from '../support/harness.js';

const HOUR = 3_600_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

describe('Policy (real AppModule + PostgreSQL)', () => {
  const prisma = createTestPrisma();
  let h: Harness;
  let drafter: TestUser; // proposes policies but cannot approve them
  let viewer: TestUser; // may only read

  const draft = (
    key: string,
    value: unknown,
    effectiveFrom: string,
    token = drafter.token,
  ) => h.post(`/policies/${key}/versions`, token, { value, effectiveFrom });
  const approve = (id: string, token = h.admin.token) =>
    h.http().post(`/policies/versions/${id}/approve`).set(h.bearer(token));
  const effective = (key: string, at?: string) =>
    h
      .http()
      .get(
        `/policies/${key}/effective${at ? `?at=${encodeURIComponent(at)}` : ''}`,
      )
      .set(h.bearer(h.admin.token));

  beforeAll(async () => {
    h = await startHarness(prisma);
    await h.setRolePermissions('REGISTRAR', [
      PolicyPermissions.READ,
      PolicyPermissions.DRAFT,
    ]);
    await h.setRolePermissions('HOD', [PolicyPermissions.READ]);
    drafter = await h.createUser(['REGISTRAR']);
    viewer = await h.createUser(['HOD']);
  });
  afterAll(() => h.close());

  describe('definitions and validation', () => {
    it('lists every policy with a valid example to start from', async () => {
      const res = await h
        .http()
        .get('/policies/definitions')
        .set(h.bearer(viewer.token))
        .expect(200);
      expect(res.body.map((d: { key: string }) => d.key).sort()).toEqual(
        Object.values(PolicyKeys).sort(),
      );
      expect(
        res.body.find((d: { key: string }) => d.key === 'results.grade_scale')
          .example.grades,
      ).toHaveLength(5);
    });

    it('rejects an inconsistent policy and says exactly what is wrong', async () => {
      const broken = structuredClone(
        POLICY_DEFINITIONS[PolicyKeys.GRADE_SCALE].example,
      );
      broken.grades.find((g) => g.grade === 'B')!.maxMarks = 67; // marks 68-69 fall in no band
      const res = await draft(PolicyKeys.GRADE_SCALE, broken, iso(HOUR));

      expectProblem(res, 422, 'POLICY_VALUE_INVALID');
      expect(res.body.details.issues).toEqual([
        expect.stringContaining('contiguous'),
      ]);
      expect(await prisma.policyVersion.count()).toBe(0);
    });

    it('rejects an unknown policy key and a malformed date', async () => {
      expectProblem(
        await draft('finance.made_up', {}, iso(HOUR)),
        404,
        'POLICY_UNKNOWN',
      );
      expectProblem(
        await draft(PolicyKeys.RETAKE, {}, 'tomorrow-ish'),
        422,
        'VALIDATION_FAILED',
      );
    });

    it('requires an Idempotency-Key to draft', async () => {
      const res = await h
        .http()
        .post(`/policies/${PolicyKeys.RETAKE}/versions`)
        .set(h.bearer(drafter.token))
        .send({
          value: POLICY_DEFINITIONS[PolicyKeys.RETAKE].example,
          effectiveFrom: iso(HOUR),
        });
      expectProblem(res, 422, 'IDEMPOTENCY_KEY_REQUIRED');
    });
  });

  describe('lifecycle', () => {
    const key = PolicyKeys.FEE_CLEARANCE;
    const example = POLICY_DEFINITIONS[key].example;
    let v1: string;

    it('fails closed while nothing is approved', async () => {
      const created = await draft(key, example, iso(-24 * HOUR)).expect(201);
      v1 = created.body.id;
      expect(created.body).toMatchObject({
        version: 1,
        status: 'DRAFT',
        createdBy: drafter.id,
      });

      expectProblem(await effective(key), 422, 'POLICY_NOT_CONFIGURED'); // a draft is not in force
    });

    it('enforces separation of duties, then activates on approval', async () => {
      expectProblem(await approve(v1, drafter.token), 403, 'PERMISSION_DENIED'); // lacks the approve permission
      await h.setRolePermissions('REGISTRAR', [
        PolicyPermissions.READ,
        PolicyPermissions.DRAFT,
        PolicyPermissions.APPROVE,
      ]);
      expectProblem(
        await approve(v1, drafter.token),
        403,
        'POLICY_SELF_APPROVAL',
      ); // has it, but it is their own draft
      await h.setRolePermissions('REGISTRAR', [
        PolicyPermissions.READ,
        PolicyPermissions.DRAFT,
      ]);

      const res = await approve(v1).expect(200);
      expect(res.body).toMatchObject({
        status: 'ACTIVE',
        approvedBy: h.admin.id,
      });

      const now = await effective(key).expect(200);
      expect(now.body).toMatchObject({ key, version: 1, value: example });
    });

    it('records the approval in the audit trail and the outbox, atomically', async () => {
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { entityId: v1, action: 'POLICY_APPROVED' },
      });
      expect(audit.userId).toBe(h.admin.id);
      const event = await prisma.outboxEvent.findFirstOrThrow({
        where: { aggregateId: v1 },
      });
      expect(event).toMatchObject({
        eventName: 'policy.version.approved',
        status: 'PENDING',
      });
      expect(event.payload).toMatchObject({ policyKey: key, version: 1 });
    });

    it('timelines a future change without disturbing what applies today', async () => {
      const changed = {
        registration: { mode: 'FIXED_AMOUNT', amount: 30000 },
        examEligibility: { mode: 'FULL' },
      };
      const startsAt = iso(2 * HOUR);
      const v2 = (await draft(key, changed, startsAt).expect(201)).body;
      expect(v2.version).toBe(2);
      await approve(v2.id).expect(200);

      // v1 now ends exactly where v2 begins; today still resolves to v1.
      const v1Row = await prisma.policyVersion.findUniqueOrThrow({
        where: { id: v1 },
      });
      expect(v1Row.effectiveTo!.toISOString()).toBe(startsAt);
      expect((await effective(key).expect(200)).body.version).toBe(1);
      expect(
        (await effective(key, iso(3 * HOUR)).expect(200)).body,
      ).toMatchObject({ version: 2, value: changed });

      // History stays resolvable: a decision made last week is judged by last week's rules.
      expect((await effective(key, iso(-HOUR)).expect(200)).body.version).toBe(
        1,
      );
      expect((await effective(key, iso(-48 * HOUR))).status).toBe(422); // before any policy existed
    });

    it('refuses to rewrite history or reorder the timeline', async () => {
      const early = (await draft(key, example, iso(HOUR)).expect(201)).body; // earlier than v2 (+2h)
      expectProblem(await approve(early.id), 409, 'POLICY_OUT_OF_ORDER');

      const other = PolicyKeys.RETAKE;
      const base = POLICY_DEFINITIONS[other].example;
      await approve(
        (await draft(other, base, iso(-48 * HOUR)).expect(201)).body.id,
      ).expect(200); // the first version may start in the past
      const retro = (
        await draft(
          other,
          { ...base, maxAttemptsPerUnit: 1 },
          iso(-HOUR),
        ).expect(201)
      ).body;
      expectProblem(await approve(retro.id), 422, 'POLICY_RETROACTIVE');
      expect((await effective(other).expect(200)).body.value).toEqual(base); // unchanged

      const stillDraft = await prisma.policyVersion.findUniqueOrThrow({
        where: { id: retro.id },
      });
      expect(stillDraft.status).toBe('DRAFT'); // the failed approval rolled back completely
    });

    it('lets drafts be discarded but never approved history', async () => {
      const throwaway = (await draft(key, example, iso(10 * HOUR)).expect(201))
        .body.id;
      await h
        .http()
        .delete(`/policies/versions/${throwaway}`)
        .set(h.bearer(drafter.token))
        .expect(204);
      expect(
        await prisma.policyVersion.count({ where: { id: throwaway } }),
      ).toBe(0);

      expectProblem(
        await h
          .http()
          .delete(`/policies/versions/${v1}`)
          .set(h.bearer(drafter.token)),
        422,
        'POLICY_NOT_A_DRAFT',
      );
      expectProblem(
        await h
          .http()
          .delete(`/policies/versions/${randomUUID()}`)
          .set(h.bearer(drafter.token)),
        404,
        'POLICY_VERSION_NOT_FOUND',
      );
    });

    it('lists the full history, newest first', async () => {
      const res = await h
        .http()
        .get(`/policies/${key}/versions`)
        .set(h.bearer(viewer.token))
        .expect(200);
      const versions = res.body.map((v: { version: number }) => v.version);
      expect(versions).toEqual([...versions].sort((a, b) => b - a));
      expect(
        res.body.find((v: { version: number }) => v.version === 1).status,
      ).toBe('ACTIVE');
    });
  });

  describe('concurrency', () => {
    it('numbers simultaneous drafts uniquely, with no gaps or duplicates', async () => {
      const key = PolicyKeys.EXAM_CARD;
      const value = POLICY_DEFINITIONS[key].example;
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          draft(key, value, iso((i + 1) * HOUR)),
        ),
      );

      expect(results.map((r) => r.status)).toEqual(Array(6).fill(201));
      const numbers = results
        .map((r) => r.body.version as number)
        .sort((a, b) => a - b);
      expect(numbers).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('keeps the timeline consistent when approvals race', async () => {
      const key = PolicyKeys.GPA;
      const value = POLICY_DEFINITIONS[key].example;
      const drafts = await Promise.all(
        [1, 2, 3, 4].map((n) => draft(key, value, iso(n * HOUR))),
      );
      const outcomes = await Promise.all(drafts.map((d) => approve(d.body.id)));

      // Whatever order the database serialised them in, the approved ones form one gap-free, overlap-free chain.
      expect(outcomes.some((o) => o.status === 200)).toBe(true);
      expect(outcomes.every((o) => [200, 409].includes(o.status))).toBe(true);
      const approved = await prisma.policyVersion.findMany({
        where: { policyKey: key, status: 'ACTIVE' },
        orderBy: { effectiveFrom: 'asc' },
      });
      approved.forEach((row, i) => {
        const next = approved[i + 1];
        expect(row.effectiveTo?.getTime() ?? null).toBe(
          next ? next.effectiveFrom.getTime() : null,
        );
      });
    });
  });

  describe('access control', () => {
    it('lets read-only users read but not propose', async () => {
      await h
        .http()
        .get('/policies/definitions')
        .set(h.bearer(viewer.token))
        .expect(200);
      expectProblem(
        await draft(
          PolicyKeys.RETAKE,
          POLICY_DEFINITIONS[PolicyKeys.RETAKE].example,
          iso(HOUR),
          viewer.token,
        ),
        403,
        'PERMISSION_DENIED',
      );
    });

    it('hides policies from users with no policy permission', async () => {
      const student = await h.createUser(['STUDENT']);
      expectProblem(
        await h
          .http()
          .get('/policies/definitions')
          .set(h.bearer(student.token)),
        403,
        'PERMISSION_DENIED',
      );
    });
  });

  describe('the public resolver contract', () => {
    it('gives other modules typed, effective-dated access', async () => {
      const resolver = h.app.get<PolicyResolver>(POLICY_RESOLVER, {
        strict: false,
      });
      const scale = POLICY_DEFINITIONS[PolicyKeys.GRADE_SCALE].example;
      await approve(
        (
          await draft(
            PolicyKeys.GRADE_SCALE,
            scale,
            iso(-30 * 24 * HOUR),
          ).expect(201)
        ).body.id,
      ).expect(200);

      const resolved = await resolver.resolve(PolicyKeys.GRADE_SCALE);
      expect(resolved.value.passMark).toBe(40);
      expect(resolved.value.grades.find((g) => g.grade === 'A')?.minMarks).toBe(
        70,
      );

      await expect(
        resolver.resolve(
          PolicyKeys.GRADE_SCALE,
          new Date(Date.now() - 60 * 24 * HOUR),
        ),
      ).rejects.toMatchObject({ code: 'POLICY_NOT_CONFIGURED' });
    });
  });
});
