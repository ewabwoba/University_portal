export const CURRICULUM_READER = Symbol('CURRICULUM_READER');

export interface CurriculumPlacement {
  programmeId: string;
  curriculumVersion: number;
  unitId: string;
  unitCode: string;
  studyYear: number;
  recommendedSemester: number;
  isCompulsory: boolean;
  /** Units that must be passed before this one (unit ids, not curriculum-entry ids). */
  prerequisiteUnitIds: string[];
}

export interface CurriculumReader {
  /** The unit's place in that programme's curriculum, or null if it is not part of it. */
  findPlacement(
    programmeId: string,
    curriculumVersion: number,
    unitId: string,
  ): Promise<CurriculumPlacement | null>;
  listPlacements(
    programmeId: string,
    curriculumVersion: number,
  ): Promise<CurriculumPlacement[]>;
}
