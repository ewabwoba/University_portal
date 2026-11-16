/**
 * The typed shape of every configurable university policy (BRD section 13). Other modules read
 * policies through POLICY_RESOLVER and get exactly these types; nothing here is hardcoded in code paths.
 */
export const PolicyKeys = {
  FEE_CLEARANCE: 'finance.fee_clearance',
  FINANCIAL: 'finance.financial_rules',
  SUPPLEMENTARY: 'academics.supplementary',
  RETAKE: 'academics.retake',
  GRADE_SCALE: 'results.grade_scale',
  GPA: 'results.gpa',
  RESULT_GOVERNANCE: 'results.governance',
  EXAM_CARD: 'examinations.exam_card',
} as const;
export type PolicyKey = (typeof PolicyKeys)[keyof typeof PolicyKeys];

export type ClearanceRule =
  | { mode: 'FULL' }
  | { mode: 'PERCENTAGE'; percentage: number }
  | { mode: 'FIXED_AMOUNT'; amount: number };

export interface FeeClearancePolicy {
  /** Threshold required before a student may register for units. */
  registration: ClearanceRule;
  /** Threshold required for examination eligibility (may differ from registration). */
  examEligibility: ClearanceRule;
}

export interface FinancialRulesPolicy {
  overpaymentTreatment: 'CREDIT_NEXT_SEMESTER' | 'REFUND' | 'HOLD_FOR_REVIEW';
  allowCrossSemesterBalances: boolean;
  refundRequiresApproval: boolean;
  writeOffRequiresApproval: boolean;
}

export interface SupplementaryPolicy {
  /** Grades that qualify a prior attempt for a supplementary examination. */
  eligibleGrades: string[];
  maxAttemptsPerUnit: number;
  requiresFee: boolean;
  carryForwardCoursework: boolean;
  /** Highest grade a supplementary result can earn, or null for no cap. */
  gradeCap: string | null;
}

export interface RetakePolicy {
  maxAttemptsPerUnit: number;
  requiresAttendance: boolean;
  requiresCoursework: boolean;
  requiresFee: boolean;
}

export interface GradeBand {
  grade: string;
  minMarks: number;
  maxMarks: number;
  gradePoints: number;
}

export interface GradeScalePolicy {
  /** Marks are whole numbers from 0 to maxMarks, so bands must be contiguous integers. */
  maxMarks: number;
  passMark: number;
  grades: GradeBand[];
}

export interface GpaPolicy {
  maxGradePoints: number;
  method: 'CREDIT_WEIGHTED' | 'UNWEIGHTED';
  /** Which attempt counts when a unit has been taken more than once. */
  repeatTreatment: 'LATEST' | 'BEST' | 'FIRST' | 'AVERAGE';
  supplementaryTreatment: 'REPLACE' | 'REPLACE_IF_HIGHER' | 'CAPPED_AT_PASS';
  /** Degree classification, highest band first. The lowest band must start at 0. */
  classification: { name: string; minGpa: number }[];
}

export interface ResultGovernancePolicy {
  requiresModeration: boolean;
  requiresExamBoardReview: boolean;
  publicationSeparateFromApproval: boolean;
  notifyOnPublication: boolean;
  notifyOnCorrection: boolean;
  /** Roles allowed to approve amendments in addition to SUPER_ADMIN (delegation when unavailable). */
  amendmentApproverRoles: string[];
}

export interface ExamCardPolicy {
  revalidation: 'AT_GENERATION' | 'BEFORE_EACH_EXAM';
  academicHoldBlocksCard: boolean;
}

export interface PolicyValueMap {
  [PolicyKeys.FEE_CLEARANCE]: FeeClearancePolicy;
  [PolicyKeys.FINANCIAL]: FinancialRulesPolicy;
  [PolicyKeys.SUPPLEMENTARY]: SupplementaryPolicy;
  [PolicyKeys.RETAKE]: RetakePolicy;
  [PolicyKeys.GRADE_SCALE]: GradeScalePolicy;
  [PolicyKeys.GPA]: GpaPolicy;
  [PolicyKeys.RESULT_GOVERNANCE]: ResultGovernancePolicy;
  [PolicyKeys.EXAM_CARD]: ExamCardPolicy;
}
