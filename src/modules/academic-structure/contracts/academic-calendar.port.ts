export const ACADEMIC_CALENDAR = Symbol('ACADEMIC_CALENDAR');

export interface SemesterInfo {
  id: string;
  academicYearId: string;
  academicYearName: string;
  sequence: number;
  name: string;
  startDate: Date;
  endDate: Date;
  registrationOpensAt: Date;
  registrationClosesAt: Date;
  addDropClosesAt: Date | null;
}

/** Calendar facts other modules need (registration windows, "current" semester). */
export interface AcademicCalendar {
  /** Throws NotFoundError (SEMESTER_NOT_FOUND). */
  getSemester(semesterId: string): Promise<SemesterInfo>;
  /** The semester whose dates contain `at` (default now), or null between semesters. */
  findCurrentSemester(at?: Date): Promise<SemesterInfo | null>;
  isRegistrationOpen(semesterId: string, at?: Date): Promise<boolean>;
}
