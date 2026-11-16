import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AUDIT_LOG } from '../../../../shared/application/ports/audit-log.port.js';
import type { AuditLog } from '../../../../shared/application/ports/audit-log.port.js';
import { TRANSACTION_MANAGER } from '../../../../shared/application/ports/transaction-manager.port.js';
import type { TransactionManager } from '../../../../shared/application/ports/transaction-manager.port.js';
import {
  resolvePage,
  toPaginated,
} from '../../../../shared/application/pagination.js';
import type {
  PageQuery,
  Paginated,
} from '../../../../shared/application/pagination.js';
import type { TypedConfigService } from '../../../../config/app-config.js';
import {
  BusinessRuleViolationError,
  ConflictError,
  NotFoundError,
} from '../../../../shared/domain/domain-error.js';
import {
  Campus,
  Department,
  Faculty,
  Programme,
  Unit,
} from '../../domain/entities/catalog.entities.js';
import type { AwardType } from '../../domain/entities/catalog.entities.js';
import { AcademicErrorCodes as Codes } from '../../domain/errors/academic-error-codes.js';
import {
  CAMPUS_REPOSITORY,
  CURRICULUM_REPOSITORY,
  DEPARTMENT_REPOSITORY,
  FACULTY_REPOSITORY,
  PROGRAMME_REPOSITORY,
  UNIT_REPOSITORY,
} from '../../domain/repositories/academic.repositories.js';
import type {
  CampusRepository,
  CurriculumRepository,
  DepartmentRepository,
  FacultyRepository,
  ProgrammeRepository,
  UnitRepository,
} from '../../domain/repositories/academic.repositories.js';
import { EntityAudit } from './audited.js';

type Row = Record<string, unknown>;

const taken = (what: string, code: string) =>
  new ConflictError(`${what} with code ${code} already exists.`, {
    code: Codes.CODE_TAKEN,
  });

async function paged<T>(
  config: TypedConfigService,
  query: PageQuery,
  fetch: (window: {
    skip: number;
    limit: number;
  }) => Promise<{ items: T[]; total: number }>,
): Promise<Paginated<T>> {
  const page = resolvePage(query, config.get('pagination', { infer: true }));
  const { items, total } = await fetch({ skip: page.skip, limit: page.limit });
  return toPaginated(items, total, page);
}

const requireFound = <T>(value: T | null, message: string, code: string): T => {
  if (!value) throw new NotFoundError(message, { code });
  return value;
};

const requireActiveParent = (
  parent: { isActive: boolean },
  what: string,
): void => {
  if (!parent.isActive) {
    throw new BusinessRuleViolationError(
      `The ${what} is inactive. Reactivate it first.`,
      { code: Codes.PARENT_INACTIVE },
    );
  }
};

const activeChildren = (count: number, what: string): void => {
  if (count > 0) {
    throw new ConflictError(
      `Cannot deactivate: ${count} active ${what} still belong to it.`,
      { code: Codes.HAS_ACTIVE_CHILDREN, details: { count } },
    );
  }
};

@Injectable()
export class CampusService {
  private readonly audit: EntityAudit;
  constructor(
    @Inject(CAMPUS_REPOSITORY) private readonly campuses: CampusRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactions: TransactionManager,
    @Inject(AUDIT_LOG) audit: AuditLog,
    @Inject(ConfigService) private readonly config: TypedConfigService,
  ) {
    this.audit = new EntityAudit(audit, 'Campus');
  }
  private snapshot = (c: Campus): Row => ({
    code: c.code,
    name: c.name,
    location: c.location,
    isActive: c.isActive,
  });

  create(input: {
    code: string;
    name: string;
    location?: string;
  }): Promise<Campus> {
    const campus = Campus.create(input);
    return this.transactions.run(async () => {
      if (await this.campuses.findByCode(campus.code))
        throw taken('A campus', campus.code);
      await this.campuses.insert(campus);
      await this.audit.created(campus.id, this.snapshot(campus));
      return campus;
    });
  }

  update(
    id: string,
    patch: { name?: string; location?: string | null; isActive?: boolean },
  ): Promise<Campus> {
    return this.transactions.run(async () => {
      const campus = requireFound(
        await this.campuses.findById(id),
        'Campus not found.',
        Codes.CAMPUS_NOT_FOUND,
      );
      const before = this.snapshot(campus);
      if (patch.isActive === false && campus.isActive)
        activeChildren(
          await this.campuses.countActiveFaculties(id),
          'faculties',
        );
      campus.update(patch);
      await this.campuses.update(campus);
      await this.audit.updated(id, before, this.snapshot(campus));
      return campus;
    });
  }

  async get(id: string): Promise<Campus> {
    return requireFound(
      await this.campuses.findById(id),
      'Campus not found.',
      Codes.CAMPUS_NOT_FOUND,
    );
  }
  list(query: PageQuery & { search?: string; isActive?: boolean }) {
    return paged(this.config, query, (w) =>
      this.campuses.list({ search: query.search, isActive: query.isActive }, w),
    );
  }
}

@Injectable()
export class FacultyService {
  private readonly audit: EntityAudit;
  constructor(
    @Inject(FACULTY_REPOSITORY) private readonly faculties: FacultyRepository,
    @Inject(CAMPUS_REPOSITORY) private readonly campuses: CampusRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactions: TransactionManager,
    @Inject(AUDIT_LOG) audit: AuditLog,
    @Inject(ConfigService) private readonly config: TypedConfigService,
  ) {
    this.audit = new EntityAudit(audit, 'Faculty');
  }
  private snapshot = (f: Faculty): Row => ({
    campusId: f.campusId,
    code: f.code,
    name: f.name,
    isActive: f.isActive,
  });

  create(input: {
    campusId: string;
    code: string;
    name: string;
  }): Promise<Faculty> {
    const faculty = Faculty.create(input);
    return this.transactions.run(async () => {
      requireActiveParent(
        requireFound(
          await this.campuses.findById(input.campusId),
          'Campus not found.',
          Codes.CAMPUS_NOT_FOUND,
        ),
        'campus',
      );
      if (await this.faculties.findByCode(input.campusId, faculty.code))
        throw taken('A faculty on this campus', faculty.code);
      await this.faculties.insert(faculty);
      await this.audit.created(faculty.id, this.snapshot(faculty));
      return faculty;
    });
  }

  update(
    id: string,
    patch: { name?: string; isActive?: boolean },
  ): Promise<Faculty> {
    return this.transactions.run(async () => {
      const faculty = requireFound(
        await this.faculties.findById(id),
        'Faculty not found.',
        Codes.FACULTY_NOT_FOUND,
      );
      const before = this.snapshot(faculty);
      if (patch.isActive === false && faculty.isActive)
        activeChildren(
          await this.faculties.countActiveDepartments(id),
          'departments',
        );
      if (patch.isActive === true && !faculty.isActive) {
        requireActiveParent(
          requireFound(
            await this.campuses.findById(faculty.campusId),
            'Campus not found.',
            Codes.CAMPUS_NOT_FOUND,
          ),
          'campus',
        );
      }
      faculty.update(patch);
      await this.faculties.update(faculty);
      await this.audit.updated(id, before, this.snapshot(faculty));
      return faculty;
    });
  }

  async get(id: string): Promise<Faculty> {
    return requireFound(
      await this.faculties.findById(id),
      'Faculty not found.',
      Codes.FACULTY_NOT_FOUND,
    );
  }
  list(
    query: PageQuery & {
      campusId?: string;
      search?: string;
      isActive?: boolean;
    },
  ) {
    return paged(this.config, query, (w) =>
      this.faculties.list(
        {
          campusId: query.campusId,
          search: query.search,
          isActive: query.isActive,
        },
        w,
      ),
    );
  }
}

@Injectable()
export class DepartmentService {
  private readonly audit: EntityAudit;
  constructor(
    @Inject(DEPARTMENT_REPOSITORY)
    private readonly departments: DepartmentRepository,
    @Inject(FACULTY_REPOSITORY) private readonly faculties: FacultyRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactions: TransactionManager,
    @Inject(AUDIT_LOG) audit: AuditLog,
    @Inject(ConfigService) private readonly config: TypedConfigService,
  ) {
    this.audit = new EntityAudit(audit, 'Department');
  }
  private snapshot = (d: Department): Row => ({
    facultyId: d.facultyId,
    code: d.code,
    name: d.name,
    isActive: d.isActive,
  });

  create(input: {
    facultyId: string;
    code: string;
    name: string;
  }): Promise<Department> {
    const department = Department.create(input);
    return this.transactions.run(async () => {
      requireActiveParent(
        requireFound(
          await this.faculties.findById(input.facultyId),
          'Faculty not found.',
          Codes.FACULTY_NOT_FOUND,
        ),
        'faculty',
      );
      if (await this.departments.findByCode(input.facultyId, department.code))
        throw taken('A department in this faculty', department.code);
      await this.departments.insert(department);
      await this.audit.created(department.id, this.snapshot(department));
      return department;
    });
  }

  update(
    id: string,
    patch: { name?: string; isActive?: boolean },
  ): Promise<Department> {
    return this.transactions.run(async () => {
      const department = requireFound(
        await this.departments.findById(id),
        'Department not found.',
        Codes.DEPARTMENT_NOT_FOUND,
      );
      const before = this.snapshot(department);
      if (patch.isActive === false && department.isActive)
        activeChildren(
          await this.departments.countActiveProgrammes(id),
          'programmes',
        );
      if (patch.isActive === true && !department.isActive) {
        requireActiveParent(
          requireFound(
            await this.faculties.findById(department.facultyId),
            'Faculty not found.',
            Codes.FACULTY_NOT_FOUND,
          ),
          'faculty',
        );
      }
      department.update(patch);
      await this.departments.update(department);
      await this.audit.updated(id, before, this.snapshot(department));
      return department;
    });
  }

  async get(id: string): Promise<Department> {
    return requireFound(
      await this.departments.findById(id),
      'Department not found.',
      Codes.DEPARTMENT_NOT_FOUND,
    );
  }
  list(
    query: PageQuery & {
      facultyId?: string;
      search?: string;
      isActive?: boolean;
    },
  ) {
    return paged(this.config, query, (w) =>
      this.departments.list(
        {
          facultyId: query.facultyId,
          search: query.search,
          isActive: query.isActive,
        },
        w,
      ),
    );
  }
}

@Injectable()
export class ProgrammeService {
  private readonly audit: EntityAudit;
  constructor(
    @Inject(PROGRAMME_REPOSITORY)
    private readonly programmes: ProgrammeRepository,
    @Inject(DEPARTMENT_REPOSITORY)
    private readonly departments: DepartmentRepository,
    @Inject(CURRICULUM_REPOSITORY)
    private readonly curriculum: CurriculumRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactions: TransactionManager,
    @Inject(AUDIT_LOG) audit: AuditLog,
    @Inject(ConfigService) private readonly config: TypedConfigService,
  ) {
    this.audit = new EntityAudit(audit, 'Programme');
  }
  private snapshot = (p: Programme): Row => ({
    departmentId: p.departmentId,
    code: p.code,
    name: p.name,
    awardType: p.awardType,
    durationYears: p.durationYears,
    currentCurriculumVersion: p.currentCurriculumVersion,
    isActive: p.isActive,
  });

  create(input: {
    departmentId: string;
    code: string;
    name: string;
    awardType: AwardType;
    durationYears: number;
  }): Promise<Programme> {
    const programme = Programme.create(input);
    return this.transactions.run(async () => {
      requireActiveParent(
        requireFound(
          await this.departments.findById(input.departmentId),
          'Department not found.',
          Codes.DEPARTMENT_NOT_FOUND,
        ),
        'department',
      );
      if (await this.programmes.findByCode(programme.code))
        throw taken('A programme', programme.code);
      await this.programmes.insert(programme);
      await this.audit.created(programme.id, this.snapshot(programme));
      return programme;
    });
  }

  update(
    id: string,
    patch: {
      name?: string;
      durationYears?: number;
      isActive?: boolean;
      currentCurriculumVersion?: number;
    },
  ): Promise<Programme> {
    return this.transactions.run(async () => {
      const programme = requireFound(
        await this.programmes.findById(id),
        'Programme not found.',
        Codes.PROGRAMME_NOT_FOUND,
      );
      const before = this.snapshot(programme);

      if (patch.durationYears !== undefined) {
        const deepest = await this.curriculum.maxStudyYear(id);
        if (patch.durationYears < deepest) {
          throw new BusinessRuleViolationError(
            `The curriculum already places units in study year ${deepest}.`,
            { code: Codes.VALUE_OUT_OF_RANGE },
          );
        }
      }
      if (patch.currentCurriculumVersion !== undefined) {
        // Switching new admissions to an empty curriculum would leave them with nothing to register for.
        if (
          (await this.curriculum.countInVersion(
            id,
            patch.currentCurriculumVersion,
          )) === 0
        ) {
          throw new BusinessRuleViolationError(
            'Add units to the new curriculum version before adopting it.',
            { code: Codes.CURRICULUM_VERSION_INVALID },
          );
        }
        programme.adoptCurriculumVersion(patch.currentCurriculumVersion);
      }
      if (patch.isActive === true && !programme.isActive) {
        requireActiveParent(
          requireFound(
            await this.departments.findById(programme.departmentId),
            'Department not found.',
            Codes.DEPARTMENT_NOT_FOUND,
          ),
          'department',
        );
      }
      programme.update({
        name: patch.name,
        durationYears: patch.durationYears,
        isActive: patch.isActive,
      });
      await this.programmes.update(programme);
      await this.audit.updated(id, before, this.snapshot(programme));
      return programme;
    });
  }

  async get(id: string): Promise<Programme> {
    return requireFound(
      await this.programmes.findById(id),
      'Programme not found.',
      Codes.PROGRAMME_NOT_FOUND,
    );
  }
  list(
    query: PageQuery & {
      departmentId?: string;
      awardType?: AwardType;
      search?: string;
      isActive?: boolean;
    },
  ) {
    return paged(this.config, query, (w) =>
      this.programmes.list(
        {
          departmentId: query.departmentId,
          awardType: query.awardType,
          search: query.search,
          isActive: query.isActive,
        },
        w,
      ),
    );
  }
}

@Injectable()
export class UnitService {
  private readonly audit: EntityAudit;
  constructor(
    @Inject(UNIT_REPOSITORY) private readonly units: UnitRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactions: TransactionManager,
    @Inject(AUDIT_LOG) audit: AuditLog,
    @Inject(ConfigService) private readonly config: TypedConfigService,
  ) {
    this.audit = new EntityAudit(audit, 'Unit');
  }
  private snapshot = (u: Unit): Row => ({
    code: u.code,
    name: u.name,
    creditPoints: u.creditPoints,
    isActive: u.isActive,
  });

  create(input: {
    code: string;
    name: string;
    creditPoints: number;
  }): Promise<Unit> {
    const unit = Unit.create(input);
    return this.transactions.run(async () => {
      if (await this.units.findByCode(unit.code))
        throw taken('A unit', unit.code);
      await this.units.insert(unit);
      await this.audit.created(unit.id, this.snapshot(unit));
      return unit;
    });
  }

  update(
    id: string,
    patch: { name?: string; creditPoints?: number; isActive?: boolean },
  ): Promise<Unit> {
    return this.transactions.run(async () => {
      const unit = requireFound(
        await this.units.findById(id),
        'Unit not found.',
        Codes.UNIT_NOT_FOUND,
      );
      const before = this.snapshot(unit);
      unit.update(patch);
      await this.units.update(unit);
      await this.audit.updated(id, before, this.snapshot(unit));
      return unit;
    });
  }

  async get(id: string): Promise<Unit> {
    return requireFound(
      await this.units.findById(id),
      'Unit not found.',
      Codes.UNIT_NOT_FOUND,
    );
  }
  list(query: PageQuery & { search?: string; isActive?: boolean }) {
    return paged(this.config, query, (w) =>
      this.units.list({ search: query.search, isActive: query.isActive }, w),
    );
  }
}
