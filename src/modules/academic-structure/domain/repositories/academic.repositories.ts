import type { AcademicYear } from '../entities/academic-year.entity.js';
import type {
  AwardType,
  Campus,
  Department,
  Faculty,
  Programme,
  Unit,
} from '../entities/catalog.entities.js';
import type { CurriculumEntry } from '../entities/curriculum-entry.entity.js';
import type {
  OfferingStatus,
  UnitOffering,
} from '../entities/unit-offering.entity.js';

export const CAMPUS_REPOSITORY = Symbol('CAMPUS_REPOSITORY');
export const FACULTY_REPOSITORY = Symbol('FACULTY_REPOSITORY');
export const DEPARTMENT_REPOSITORY = Symbol('DEPARTMENT_REPOSITORY');
export const PROGRAMME_REPOSITORY = Symbol('PROGRAMME_REPOSITORY');
export const UNIT_REPOSITORY = Symbol('UNIT_REPOSITORY');
export const CURRICULUM_REPOSITORY = Symbol('CURRICULUM_REPOSITORY');
export const CALENDAR_REPOSITORY = Symbol('CALENDAR_REPOSITORY');
export const OFFERING_REPOSITORY = Symbol('OFFERING_REPOSITORY');

export interface PageWindow {
  skip: number;
  limit: number;
}
export interface Paged<T> {
  items: T[];
  total: number;
}

/**
 * Write methods must run inside TransactionManager.run(). `insert` raises ConflictError (CODE_ALREADY_EXISTS)
 * on a duplicate, even under a race, because the database unique index is the final authority.
 */
export interface CampusRepository {
  findById(id: string): Promise<Campus | null>;
  findByCode(code: string): Promise<Campus | null>;
  insert(campus: Campus): Promise<void>;
  update(campus: Campus): Promise<void>;
  list(
    filter: { search?: string; isActive?: boolean },
    page: PageWindow,
  ): Promise<Paged<Campus>>;
  countActiveFaculties(campusId: string): Promise<number>;
}

export interface FacultyRepository {
  findById(id: string): Promise<Faculty | null>;
  findByCode(campusId: string, code: string): Promise<Faculty | null>;
  insert(faculty: Faculty): Promise<void>;
  update(faculty: Faculty): Promise<void>;
  list(
    filter: { campusId?: string; search?: string; isActive?: boolean },
    page: PageWindow,
  ): Promise<Paged<Faculty>>;
  countActiveDepartments(facultyId: string): Promise<number>;
}

export interface DepartmentRepository {
  findById(id: string): Promise<Department | null>;
  findByCode(facultyId: string, code: string): Promise<Department | null>;
  insert(department: Department): Promise<void>;
  update(department: Department): Promise<void>;
  list(
    filter: { facultyId?: string; search?: string; isActive?: boolean },
    page: PageWindow,
  ): Promise<Paged<Department>>;
  countActiveProgrammes(departmentId: string): Promise<number>;
}

export interface ProgrammeRepository {
  findById(id: string): Promise<Programme | null>;
  findByCode(code: string): Promise<Programme | null>;
  insert(programme: Programme): Promise<void>;
  update(programme: Programme): Promise<void>;
  list(
    filter: {
      departmentId?: string;
      awardType?: AwardType;
      search?: string;
      isActive?: boolean;
    },
    page: PageWindow,
  ): Promise<Paged<Programme>>;
}

export interface UnitRepository {
  findById(id: string): Promise<Unit | null>;
  findByCode(code: string): Promise<Unit | null>;
  insert(unit: Unit): Promise<void>;
  update(unit: Unit): Promise<void>;
  list(
    filter: { search?: string; isActive?: boolean },
    page: PageWindow,
  ): Promise<Paged<Unit>>;
}

export interface CurriculumEntryView {
  id: string;
  programmeId: string;
  curriculumVersion: number;
  unitId: string;
  unitCode: string;
  unitName: string;
  creditPoints: number;
  studyYear: number;
  recommendedSemester: number;
  isCompulsory: boolean;
  prerequisiteIds: string[];
  prerequisiteUnitIds: string[];
}

export interface CurriculumRepository {
  findById(id: string): Promise<CurriculumEntry | null>;
  findByUnit(
    programmeId: string,
    curriculumVersion: number,
    unitId: string,
  ): Promise<CurriculumEntry | null>;
  /** Every entry of one programme version, with prerequisites. */
  findAllInVersion(
    programmeId: string,
    curriculumVersion: number,
  ): Promise<CurriculumEntry[]>;
  listViews(
    programmeId: string,
    curriculumVersion: number,
  ): Promise<CurriculumEntryView[]>;
  insert(entry: CurriculumEntry): Promise<void>;
  /** Persists position changes and the prerequisite set. */
  update(entry: CurriculumEntry): Promise<void>;
  delete(id: string): Promise<void>;
  isPrerequisiteOfAny(entryId: string): Promise<boolean>;
  countInVersion(
    programmeId: string,
    curriculumVersion: number,
  ): Promise<number>;
  maxStudyYear(programmeId: string): Promise<number>;
}

export interface SemesterRecord {
  semesterId: string;
  year: AcademicYear;
}

export interface CalendarRepository {
  /** Serialises calendar edits (they are rare) so overlap checks cannot race. */
  lockCalendar(): Promise<void>;
  findYearById(id: string): Promise<AcademicYear | null>;
  findYearByName(name: string): Promise<AcademicYear | null>;
  findYearBySemesterId(semesterId: string): Promise<AcademicYear | null>;
  existsOverlappingYear(
    start: Date,
    end: Date,
    ignoreYearId?: string,
  ): Promise<boolean>;
  insertYear(year: AcademicYear): Promise<void>;
  /** Persists the year's dates and upserts all its semesters. */
  saveYear(year: AcademicYear): Promise<void>;
  listYears(page: PageWindow): Promise<Paged<AcademicYear>>;
  findYearContaining(at: Date): Promise<AcademicYear | null>;
}

export interface OfferingView {
  id: string;
  unitId: string;
  unitCode: string;
  unitName: string;
  semesterId: string;
  semesterName: string;
  academicYearName: string;
  classGroup: string;
  capacity: number;
  enrolledCount: number;
  seatsRemaining: number;
  status: OfferingStatus;
}

export interface OfferingRepository {
  findById(id: string): Promise<UnitOffering | null>;
  findView(id: string): Promise<OfferingView | null>;
  insert(offering: UnitOffering): Promise<void>;
  /**
   * Persists capacity and status. Guarded in SQL so a concurrent seat reservation cannot slip past:
   * raises ConcurrencyError if enrolment changed underneath the edit.
   */
  update(offering: UnitOffering): Promise<void>;
  list(
    filter: { semesterId?: string; unitId?: string; status?: OfferingStatus },
    page: PageWindow,
  ): Promise<Paged<OfferingView>>;
  /** One atomic statement: true only if the offering was OPEN with a free seat. */
  tryReserveSeat(id: string): Promise<boolean>;
  tryReleaseSeat(id: string): Promise<boolean>;
}
