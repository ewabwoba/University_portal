import { ValidationError } from '../../../../shared/domain/domain-error.js';
import { PolicyKeys } from '../../contracts/policy-values.js';
import type {
  GradeScalePolicy,
  GpaPolicy,
} from '../../contracts/policy-values.js';
import { POLICY_DEFINITIONS, isPolicyKey } from './policy-definitions.js';

const issuesOf = (
  key: keyof typeof POLICY_DEFINITIONS,
  raw: unknown,
): string[] => {
  try {
    POLICY_DEFINITIONS[key].validate(raw);
    return [];
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    return (error as ValidationError).details!.issues as string[];
  }
};
const clone = <T>(value: T): T => structuredClone(value);

describe('policy definitions', () => {
  it.each(Object.values(PolicyKeys))(
    'the published example for %s is itself valid',
    (key) => {
      expect(issuesOf(key, POLICY_DEFINITIONS[key].example)).toEqual([]);
    },
  );

  it('only knows its own keys', () => {
    expect(isPolicyKey('finance.fee_clearance')).toBe(true);
    expect(isPolicyKey('constructor')).toBe(false);
    expect(isPolicyKey('nope')).toBe(false);
  });

  it('rejects unknown fields, missing fields and wrong types, naming each by path', () => {
    const issues = issuesOf(PolicyKeys.RETAKE, {
      maxAttemptsPerUnit: 'three',
      requiresFee: true,
      bonus: 1,
    });
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('value.bonus: unknown field'),
        expect.stringContaining('value.maxAttemptsPerUnit: must be a number'),
        expect.stringContaining('value.requiresAttendance: is required'),
        expect.stringContaining('value.requiresCoursework: is required'),
      ]),
    );
  });

  describe('fee clearance', () => {
    const base = POLICY_DEFINITIONS[PolicyKeys.FEE_CLEARANCE].example;

    it('accepts all three modes, independently for registration and exams', () => {
      expect(
        issuesOf(PolicyKeys.FEE_CLEARANCE, {
          registration: { mode: 'FIXED_AMOUNT', amount: 25000 },
          examEligibility: { mode: 'PERCENTAGE', percentage: 100 },
        }),
      ).toEqual([]);
      expect(issuesOf(PolicyKeys.FEE_CLEARANCE, base)).toEqual([]);
    });

    it('requires the parameter that belongs to the chosen mode, and rejects stray ones', () => {
      expect(
        issuesOf(PolicyKeys.FEE_CLEARANCE, {
          ...base,
          registration: { mode: 'PERCENTAGE' },
        }),
      ).toEqual(
        expect.arrayContaining([
          expect.stringContaining('registration.percentage: is required'),
        ]),
      );
      expect(
        issuesOf(PolicyKeys.FEE_CLEARANCE, {
          ...base,
          registration: { mode: 'FULL', percentage: 50 },
        }),
      ).toEqual(
        expect.arrayContaining([
          expect.stringContaining('registration.percentage: unknown field'),
        ]),
      );
      expect(
        issuesOf(PolicyKeys.FEE_CLEARANCE, {
          ...base,
          registration: { mode: 'SOMETIMES' },
        }),
      ).toEqual([
        expect.stringContaining(
          'registration.mode: must be one of FULL, PERCENTAGE, FIXED_AMOUNT',
        ),
      ]);
    });

    it('bounds the percentage to 1-100', () => {
      for (const percentage of [0, 101, -5]) {
        expect(
          issuesOf(PolicyKeys.FEE_CLEARANCE, {
            ...base,
            registration: { mode: 'PERCENTAGE', percentage },
          }).length,
        ).toBeGreaterThan(0);
      }
    });
  });

  describe('grade scale', () => {
    const example = (): GradeScalePolicy =>
      clone(POLICY_DEFINITIONS[PolicyKeys.GRADE_SCALE].example);

    it('rejects a gap between bands', () => {
      const scale = example();
      scale.grades.find((g) => g.grade === 'B')!.maxMarks = 67; // marks 68-69 now belong to no grade
      expect(issuesOf(PolicyKeys.GRADE_SCALE, scale)).toEqual([
        expect.stringContaining('contiguous'),
      ]);
    });

    it('rejects overlapping bands', () => {
      const scale = example();
      scale.grades.find((g) => g.grade === 'A')!.minMarks = 65;
      expect(issuesOf(PolicyKeys.GRADE_SCALE, scale)).toEqual([
        expect.stringContaining('contiguous'),
      ]);
    });

    it('requires the scale to span 0..maxMarks', () => {
      const low = example();
      low.grades.find((g) => g.grade === 'E')!.minMarks = 5;
      expect(issuesOf(PolicyKeys.GRADE_SCALE, low)).toEqual(
        expect.arrayContaining([expect.stringContaining('must start at 0')]),
      );

      const high = example();
      high.maxMarks = 110;
      expect(issuesOf(PolicyKeys.GRADE_SCALE, high)).toEqual(
        expect.arrayContaining([
          expect.stringContaining('must end at maxMarks'),
        ]),
      );
    });

    it('requires a pass mark that sits on a band boundary', () => {
      const scale = example();
      scale.passMark = 45;
      expect(issuesOf(PolicyKeys.GRADE_SCALE, scale)).toEqual([
        expect.stringContaining(
          'passMark: must be the lowest mark of a grade band',
        ),
      ]);
    });

    it('rejects duplicate grade names and grade points that fall as marks rise', () => {
      const dup = example();
      dup.grades[1]!.grade = 'A';
      expect(issuesOf(PolicyKeys.GRADE_SCALE, dup)).toEqual(
        expect.arrayContaining([expect.stringContaining('unique')]),
      );

      const inverted = example();
      inverted.grades.find((g) => g.grade === 'A')!.gradePoints = 0.5;
      expect(issuesOf(PolicyKeys.GRADE_SCALE, inverted)).toEqual(
        expect.arrayContaining([expect.stringContaining('fewer grade points')]),
      );
    });

    it('does not care about the order bands are listed in', () => {
      const scale = example();
      scale.grades.reverse();
      expect(issuesOf(PolicyKeys.GRADE_SCALE, scale)).toEqual([]);
    });
  });

  describe('GPA', () => {
    const example = (): GpaPolicy =>
      clone(POLICY_DEFINITIONS[PolicyKeys.GPA].example);

    it('requires classification from highest to lowest and a band at 0, so everyone is classified', () => {
      const unordered = example();
      unordered.classification.reverse();
      expect(issuesOf(PolicyKeys.GPA, unordered)).toEqual(
        expect.arrayContaining([
          expect.stringContaining('highest minGpa to the lowest'),
        ]),
      );

      const noFloor = example();
      noFloor.classification.pop();
      expect(issuesOf(PolicyKeys.GPA, noFloor)).toEqual(
        expect.arrayContaining([expect.stringContaining('must start at 0')]),
      );
    });

    it('rejects a classification threshold above the scale', () => {
      const gpa = example();
      gpa.classification[0]!.minGpa = 4.5;
      expect(issuesOf(PolicyKeys.GPA, gpa)).toEqual(
        expect.arrayContaining([
          expect.stringContaining('exceed maxGradePoints'),
        ]),
      );
    });
  });

  it.each([null, 'text', 42, [], undefined])(
    'rejects a non-object value (%j)',
    (raw) => {
      expect(issuesOf(PolicyKeys.EXAM_CARD, raw)).toEqual([
        'value: must be an object',
      ]);
    },
  );
});
