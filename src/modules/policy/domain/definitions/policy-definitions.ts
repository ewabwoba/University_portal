import { PolicyKeys } from '../../contracts/policy-values.js';
import type {
  ClearanceRule,
  ExamCardPolicy,
  FeeClearancePolicy,
  FinancialRulesPolicy,
  GpaPolicy,
  GradeBand,
  GradeScalePolicy,
  PolicyKey,
  ResultGovernancePolicy,
  RetakePolicy,
  SupplementaryPolicy,
} from '../../contracts/policy-values.js';
import { definePolicy } from './policy-definition.js';
import type { PolicyDefinition } from './policy-definition.js';
import {
  bool,
  list,
  nullable,
  num,
  oneOf,
  shape,
  text,
  variants,
} from './schema.js';

const MAX_LIST = 50;
const GRADE_NAME_MAX = 10;

const clearanceRule = variants<ClearanceRule>('mode', {
  FULL: shape<{ mode: 'FULL' }>({ mode: oneOf(['FULL'] as const) }),
  PERCENTAGE: shape<{ mode: 'PERCENTAGE'; percentage: number }>({
    mode: oneOf(['PERCENTAGE'] as const),
    percentage: num({ min: 1, max: 100 }),
  }),
  FIXED_AMOUNT: shape<{ mode: 'FIXED_AMOUNT'; amount: number }>({
    mode: oneOf(['FIXED_AMOUNT'] as const),
    amount: num({ min: 0 }),
  }),
});

const feeClearance = definePolicy<typeof PolicyKeys.FEE_CLEARANCE>({
  key: PolicyKeys.FEE_CLEARANCE,
  module: 'finance',
  description:
    'Fee payment required before unit registration and before examination eligibility.',
  example: {
    registration: { mode: 'PERCENTAGE', percentage: 60 },
    examEligibility: { mode: 'FULL' },
  },
  parser: shape<FeeClearancePolicy>({
    registration: clearanceRule,
    examEligibility: clearanceRule,
  }),
});

const financialRules = definePolicy<typeof PolicyKeys.FINANCIAL>({
  key: PolicyKeys.FINANCIAL,
  module: 'finance',
  description:
    'Overpayments, refunds, write-offs and balances carried across semesters.',
  example: {
    overpaymentTreatment: 'CREDIT_NEXT_SEMESTER',
    allowCrossSemesterBalances: true,
    refundRequiresApproval: true,
    writeOffRequiresApproval: true,
  },
  parser: shape<FinancialRulesPolicy>({
    overpaymentTreatment: oneOf([
      'CREDIT_NEXT_SEMESTER',
      'REFUND',
      'HOLD_FOR_REVIEW',
    ] as const),
    allowCrossSemesterBalances: bool(),
    refundRequiresApproval: bool(),
    writeOffRequiresApproval: bool(),
  }),
});

const supplementary = definePolicy<typeof PolicyKeys.SUPPLEMENTARY>({
  key: PolicyKeys.SUPPLEMENTARY,
  module: 'academics',
  description: 'Who qualifies for a supplementary examination, and the terms.',
  example: {
    eligibleGrades: ['E'],
    maxAttemptsPerUnit: 1,
    requiresFee: true,
    carryForwardCoursework: true,
    gradeCap: 'C',
  },
  parser: shape<SupplementaryPolicy>({
    eligibleGrades: list(text(), { min: 1, max: MAX_LIST }),
    maxAttemptsPerUnit: num({ min: 1, max: 10, integer: true }),
    requiresFee: bool(),
    carryForwardCoursework: bool(),
    gradeCap: nullable(text()),
  }),
});

const retake = definePolicy<typeof PolicyKeys.RETAKE>({
  key: PolicyKeys.RETAKE,
  module: 'academics',
  description: 'Terms for retaking a previously failed unit as a new attempt.',
  example: {
    maxAttemptsPerUnit: 3,
    requiresAttendance: true,
    requiresCoursework: true,
    requiresFee: true,
  },
  parser: shape<RetakePolicy>({
    maxAttemptsPerUnit: num({ min: 1, max: 10, integer: true }),
    requiresAttendance: bool(),
    requiresCoursework: bool(),
    requiresFee: bool(),
  }),
});

const gradeBand = shape<GradeBand>({
  grade: (value, path, issues) => {
    const parsed = text()(value, path, issues);
    if (parsed !== undefined && parsed.length > GRADE_NAME_MAX)
      issues.push(`${path}: at most ${GRADE_NAME_MAX} characters`);
    return parsed;
  },
  minMarks: num({ min: 0, integer: true }),
  maxMarks: num({ min: 0, integer: true }),
  gradePoints: num({ min: 0 }),
});

const gradeScale = definePolicy<typeof PolicyKeys.GRADE_SCALE>({
  key: PolicyKeys.GRADE_SCALE,
  module: 'results',
  description:
    'Grade boundaries, grade points and the pass mark. Bands must cover every whole mark exactly once.',
  example: {
    maxMarks: 100,
    passMark: 40,
    grades: [
      { grade: 'A', minMarks: 70, maxMarks: 100, gradePoints: 4 },
      { grade: 'B', minMarks: 60, maxMarks: 69, gradePoints: 3 },
      { grade: 'C', minMarks: 50, maxMarks: 59, gradePoints: 2 },
      { grade: 'D', minMarks: 40, maxMarks: 49, gradePoints: 1 },
      { grade: 'E', minMarks: 0, maxMarks: 39, gradePoints: 0 },
    ],
  },
  parser: shape<GradeScalePolicy>({
    maxMarks: num({ min: 1, max: 1000, integer: true }),
    passMark: num({ min: 0, integer: true }),
    grades: list(gradeBand, { min: 2, max: MAX_LIST }),
  }),
  refine(value, issues) {
    const bands = [...value.grades].sort((a, b) => a.minMarks - b.minMarks);

    if (new Set(bands.map((band) => band.grade)).size !== bands.length)
      issues.push('value.grades: grade names must be unique');
    if (value.passMark > value.maxMarks)
      issues.push('value.passMark: cannot exceed maxMarks');
    if (bands[0]!.minMarks !== 0)
      issues.push('value.grades: the lowest band must start at 0');
    if (bands[bands.length - 1]!.maxMarks !== value.maxMarks)
      issues.push('value.grades: the highest band must end at maxMarks');

    bands.forEach((band, i) => {
      if (band.minMarks > band.maxMarks)
        issues.push(`value.grades: ${band.grade} has minMarks above maxMarks`);
      const next = bands[i + 1];
      if (next && next.minMarks !== band.maxMarks + 1) {
        issues.push(
          `value.grades: ${band.grade} and ${next.grade} must be contiguous (no gap or overlap)`,
        );
      }
      if (next && next.gradePoints < band.gradePoints)
        issues.push(
          `value.grades: ${next.grade} must not earn fewer grade points than ${band.grade}`,
        );
    });
    if (!bands.some((band) => band.minMarks === value.passMark)) {
      issues.push('value.passMark: must be the lowest mark of a grade band');
    }
  },
});

const gpa = definePolicy<typeof PolicyKeys.GPA>({
  key: PolicyKeys.GPA,
  module: 'results',
  description:
    'GPA method, treatment of repeated units and degree classification.',
  example: {
    maxGradePoints: 4,
    method: 'CREDIT_WEIGHTED',
    repeatTreatment: 'LATEST',
    supplementaryTreatment: 'CAPPED_AT_PASS',
    classification: [
      { name: 'First Class', minGpa: 3.5 },
      { name: 'Second Class Upper', minGpa: 3 },
      { name: 'Second Class Lower', minGpa: 2 },
      { name: 'Pass', minGpa: 0 },
    ],
  },
  parser: shape<GpaPolicy>({
    maxGradePoints: num({ min: 1, max: 10 }),
    method: oneOf(['CREDIT_WEIGHTED', 'UNWEIGHTED'] as const),
    repeatTreatment: oneOf(['LATEST', 'BEST', 'FIRST', 'AVERAGE'] as const),
    supplementaryTreatment: oneOf([
      'REPLACE',
      'REPLACE_IF_HIGHER',
      'CAPPED_AT_PASS',
    ] as const),
    classification: list(
      shape<{ name: string; minGpa: number }>({
        name: text(),
        minGpa: num({ min: 0 }),
      }),
      { min: 1, max: 12 },
    ),
  }),
  refine(value, issues) {
    const floors = value.classification.map((band) => band.minGpa);
    if (new Set(floors).size !== floors.length)
      issues.push('value.classification: each band needs a different minGpa');
    if (Math.min(...floors) !== 0)
      issues.push(
        'value.classification: the lowest band must start at 0 so every student is classified',
      );
    if (Math.max(...floors) > value.maxGradePoints)
      issues.push('value.classification: minGpa cannot exceed maxGradePoints');
    if (floors.some((floor, i) => i > 0 && floor >= floors[i - 1]!)) {
      issues.push(
        'value.classification: list bands from the highest minGpa to the lowest',
      );
    }
  },
});

const resultGovernance = definePolicy<typeof PolicyKeys.RESULT_GOVERNANCE>({
  key: PolicyKeys.RESULT_GOVERNANCE,
  module: 'results',
  description: 'Moderation, publication and who may approve result amendments.',
  example: {
    requiresModeration: false,
    requiresExamBoardReview: false,
    publicationSeparateFromApproval: true,
    notifyOnPublication: true,
    notifyOnCorrection: true,
    amendmentApproverRoles: [],
  },
  parser: shape<ResultGovernancePolicy>({
    requiresModeration: bool(),
    requiresExamBoardReview: bool(),
    publicationSeparateFromApproval: bool(),
    notifyOnPublication: bool(),
    notifyOnCorrection: bool(),
    amendmentApproverRoles: list(text(), { max: MAX_LIST }),
  }),
});

const examCard = definePolicy<typeof PolicyKeys.EXAM_CARD>({
  key: PolicyKeys.EXAM_CARD,
  module: 'examinations',
  description:
    'When eligibility is checked and whether academic holds block an exam card.',
  example: { revalidation: 'BEFORE_EACH_EXAM', academicHoldBlocksCard: true },
  parser: shape<ExamCardPolicy>({
    revalidation: oneOf(['AT_GENERATION', 'BEFORE_EACH_EXAM'] as const),
    academicHoldBlocksCard: bool(),
  }),
});

/** Every policy the system understands. A key not listed here cannot be created. */
export const POLICY_DEFINITIONS: { [K in PolicyKey]: PolicyDefinition<K> } = {
  [PolicyKeys.FEE_CLEARANCE]: feeClearance,
  [PolicyKeys.FINANCIAL]: financialRules,
  [PolicyKeys.SUPPLEMENTARY]: supplementary,
  [PolicyKeys.RETAKE]: retake,
  [PolicyKeys.GRADE_SCALE]: gradeScale,
  [PolicyKeys.GPA]: gpa,
  [PolicyKeys.RESULT_GOVERNANCE]: resultGovernance,
  [PolicyKeys.EXAM_CARD]: examCard,
};

export const isPolicyKey = (key: string): key is PolicyKey =>
  Object.hasOwn(POLICY_DEFINITIONS, key);
