import { randomUUID } from 'node:crypto';
import { AggregateRoot } from '../../../../shared/domain/aggregate-root.js';
import { requireInt } from '../validation.js';

const MAX_SEMESTER_IN_YEAR = 6;

export interface CurriculumEntryState {
  programmeId: string;
  unitId: string;
  curriculumVersion: number;
  studyYear: number;
  recommendedSemester: number;
  isCompulsory: boolean;
  /** Curriculum-entry ids (same programme and version) that must be passed first. */
  prerequisiteIds: string[];
}

/** One unit's place in one programme's curriculum for one version. */
export class CurriculumEntry extends AggregateRoot<string> {
  private constructor(
    id: string,
    private state: CurriculumEntryState,
  ) {
    super(id);
  }

  static create(
    input: Omit<CurriculumEntryState, 'prerequisiteIds'>,
    programmeDurationYears: number,
  ): CurriculumEntry {
    return new CurriculumEntry(randomUUID(), {
      ...input,
      studyYear: requireInt(
        input.studyYear,
        'studyYear',
        1,
        programmeDurationYears,
      ),
      recommendedSemester: requireInt(
        input.recommendedSemester,
        'recommendedSemester',
        1,
        MAX_SEMESTER_IN_YEAR,
      ),
      prerequisiteIds: [],
    });
  }

  static restore(id: string, state: CurriculumEntryState): CurriculumEntry {
    return new CurriculumEntry(id, {
      ...state,
      prerequisiteIds: [...state.prerequisiteIds],
    });
  }

  get programmeId(): string {
    return this.state.programmeId;
  }
  get unitId(): string {
    return this.state.unitId;
  }
  get curriculumVersion(): number {
    return this.state.curriculumVersion;
  }
  get studyYear(): number {
    return this.state.studyYear;
  }
  get recommendedSemester(): number {
    return this.state.recommendedSemester;
  }
  get isCompulsory(): boolean {
    return this.state.isCompulsory;
  }
  get prerequisiteIds(): string[] {
    return [...this.state.prerequisiteIds];
  }

  reposition(
    patch: {
      studyYear?: number;
      recommendedSemester?: number;
      isCompulsory?: boolean;
    },
    programmeDurationYears: number,
  ): void {
    if (patch.studyYear !== undefined)
      this.state.studyYear = requireInt(
        patch.studyYear,
        'studyYear',
        1,
        programmeDurationYears,
      );
    if (patch.recommendedSemester !== undefined)
      this.state.recommendedSemester = requireInt(
        patch.recommendedSemester,
        'recommendedSemester',
        1,
        MAX_SEMESTER_IN_YEAR,
      );
    if (patch.isCompulsory !== undefined)
      this.state.isCompulsory = patch.isCompulsory;
  }

  setPrerequisites(ids: string[]): void {
    this.state.prerequisiteIds = [...new Set(ids)];
  }
}
