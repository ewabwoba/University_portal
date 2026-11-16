import { PolicyStatus, PolicyVersion } from './policy-version.entity.js';

const NOW = new Date('2026-11-10T10:00:00Z');
const at = (days: number) => new Date(NOW.getTime() + days * 86_400_000);
const draft = (effectiveFrom = at(1)) =>
  PolicyVersion.draft({
    policyKey: 'results.gpa',
    version: 1,
    value: {},
    effectiveFrom,
    createdBy: 'author',
    now: NOW,
  });

describe('PolicyVersion', () => {
  it('starts as a draft that is in force at no time', () => {
    const version = draft(at(-1));
    expect(version.status).toBe(PolicyStatus.DRAFT);
    expect(version.isEffectiveAt(NOW)).toBe(false);
  });

  it('cannot be approved by its author (separation of duties)', () => {
    expect(() => draft().approve('author')).toThrow(
      expect.objectContaining({ code: 'POLICY_SELF_APPROVAL' }),
    );
  });

  it('is approved once, by someone else, raising an event', () => {
    const version = draft();
    version.approve('approver');
    expect(version).toMatchObject({
      status: PolicyStatus.ACTIVE,
      approvedBy: 'approver',
    });
    expect(version.pullEvents().map((e) => e.eventName)).toEqual([
      'policy.version.approved',
    ]);
    expect(() => version.approve('someone-else')).toThrow(
      expect.objectContaining({ code: 'POLICY_NOT_A_DRAFT' }),
    );
  });

  it('is in force from effectiveFrom (inclusive) until effectiveTo (exclusive)', () => {
    const version = draft(at(1));
    version.approve('approver');
    version.supersede(at(5));

    expect(version.isEffectiveAt(at(0))).toBe(false);
    expect(version.isEffectiveAt(at(1))).toBe(true);
    expect(version.isEffectiveAt(new Date(at(5).getTime() - 1))).toBe(true);
    expect(version.isEffectiveAt(at(5))).toBe(false);
  });

  it('rejects an invalid effective date', () => {
    expect(() => draft(new Date('not a date'))).toThrow(
      expect.objectContaining({ code: 'POLICY_EFFECTIVE_DATE_INVALID' }),
    );
  });
});
