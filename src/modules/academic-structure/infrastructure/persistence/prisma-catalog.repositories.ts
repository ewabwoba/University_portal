import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ConflictError } from '../../../../shared/domain/domain-error.js';
import { PrismaContext } from '../../../../shared/infrastructure/prisma/prisma-context.js';
import {
  Campus,
  Department,
  Faculty,
  Programme,
  Unit,
} from '../../domain/entities/catalog.entities.js';
import { AcademicErrorCodes } from '../../domain/errors/academic-error-codes.js';
import type {
  CampusRepository,
  DepartmentRepository,
  FacultyRepository,
  Paged,
  PageWindow,
  ProgrammeRepository,
  UnitRepository,
} from '../../domain/repositories/academic.repositories.js';
import { isUniqueViolation } from './prisma-errors.js';

const duplicate = (cause: unknown) =>
  new ConflictError('A record with this code already exists.', {
    code: AcademicErrorCodes.CODE_TAKEN,
    cause,
  });

const searchBy = (search: string | undefined) =>
  search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { code: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {};

const ORDER = [{ name: 'asc' as const }, { id: 'asc' as const }];

/**
 * @Injectable() is required even though this base is abstract: it makes TypeScript emit the constructor's
 * parameter types, which the subclasses (that declare no constructor of their own) inherit for DI.
 */
@Injectable()
abstract class PrismaRepository {
  constructor(protected readonly context: PrismaContext) {}
  protected get db() {
    return this.context.client;
  }
  protected async guardedInsert(action: () => Promise<unknown>): Promise<void> {
    try {
      await action();
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicate(error);
      throw error;
    }
  }
}

@Injectable()
export class PrismaCampusRepository
  extends PrismaRepository
  implements CampusRepository
{
  private toDomain = (r: {
    id: string;
    code: string;
    name: string;
    location: string | null;
    isActive: boolean;
  }) => Campus.restore(r);

  async findById(id: string) {
    const row = await this.db.campus.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }
  async findByCode(code: string) {
    const row = await this.db.campus.findUnique({ where: { code } });
    return row ? this.toDomain(row) : null;
  }
  insert(c: Campus) {
    return this.guardedInsert(() =>
      this.db.campus.create({
        data: {
          id: c.id,
          code: c.code,
          name: c.name,
          location: c.location,
          isActive: c.isActive,
        },
      }),
    );
  }
  async update(c: Campus) {
    await this.db.campus.update({
      where: { id: c.id },
      data: { name: c.name, location: c.location, isActive: c.isActive },
    });
  }
  async list(
    filter: { search?: string; isActive?: boolean },
    page: PageWindow,
  ): Promise<Paged<Campus>> {
    const where: Prisma.CampusWhereInput = {
      ...(filter.isActive !== undefined ? { isActive: filter.isActive } : {}),
      ...searchBy(filter.search),
    };
    const [rows, total] = await Promise.all([
      this.db.campus.findMany({
        where,
        orderBy: ORDER,
        skip: page.skip,
        take: page.limit,
      }),
      this.db.campus.count({ where }),
    ]);
    return { items: rows.map(this.toDomain), total };
  }
  countActiveFaculties(campusId: string) {
    return this.db.faculty.count({ where: { campusId, isActive: true } });
  }
}

@Injectable()
export class PrismaFacultyRepository
  extends PrismaRepository
  implements FacultyRepository
{
  private toDomain = (r: {
    id: string;
    campusId: string;
    code: string;
    name: string;
    isActive: boolean;
  }) => Faculty.restore(r);

  async findById(id: string) {
    const row = await this.db.faculty.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }
  async findByCode(campusId: string, code: string) {
    const row = await this.db.faculty.findUnique({
      where: { campusId_code: { campusId, code } },
    });
    return row ? this.toDomain(row) : null;
  }
  insert(f: Faculty) {
    return this.guardedInsert(() =>
      this.db.faculty.create({
        data: {
          id: f.id,
          campusId: f.campusId,
          code: f.code,
          name: f.name,
          isActive: f.isActive,
        },
      }),
    );
  }
  async update(f: Faculty) {
    await this.db.faculty.update({
      where: { id: f.id },
      data: { name: f.name, isActive: f.isActive },
    });
  }
  async list(
    filter: { campusId?: string; search?: string; isActive?: boolean },
    page: PageWindow,
  ): Promise<Paged<Faculty>> {
    const where: Prisma.FacultyWhereInput = {
      ...(filter.campusId ? { campusId: filter.campusId } : {}),
      ...(filter.isActive !== undefined ? { isActive: filter.isActive } : {}),
      ...searchBy(filter.search),
    };
    const [rows, total] = await Promise.all([
      this.db.faculty.findMany({
        where,
        orderBy: ORDER,
        skip: page.skip,
        take: page.limit,
      }),
      this.db.faculty.count({ where }),
    ]);
    return { items: rows.map(this.toDomain), total };
  }
  countActiveDepartments(facultyId: string) {
    return this.db.department.count({ where: { facultyId, isActive: true } });
  }
}

@Injectable()
export class PrismaDepartmentRepository
  extends PrismaRepository
  implements DepartmentRepository
{
  private toDomain = (r: {
    id: string;
    facultyId: string;
    code: string;
    name: string;
    isActive: boolean;
  }) => Department.restore(r);

  async findById(id: string) {
    const row = await this.db.department.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }
  async findByCode(facultyId: string, code: string) {
    const row = await this.db.department.findUnique({
      where: { facultyId_code: { facultyId, code } },
    });
    return row ? this.toDomain(row) : null;
  }
  insert(d: Department) {
    return this.guardedInsert(() =>
      this.db.department.create({
        data: {
          id: d.id,
          facultyId: d.facultyId,
          code: d.code,
          name: d.name,
          isActive: d.isActive,
        },
      }),
    );
  }
  async update(d: Department) {
    await this.db.department.update({
      where: { id: d.id },
      data: { name: d.name, isActive: d.isActive },
    });
  }
  async list(
    filter: { facultyId?: string; search?: string; isActive?: boolean },
    page: PageWindow,
  ): Promise<Paged<Department>> {
    const where: Prisma.DepartmentWhereInput = {
      ...(filter.facultyId ? { facultyId: filter.facultyId } : {}),
      ...(filter.isActive !== undefined ? { isActive: filter.isActive } : {}),
      ...searchBy(filter.search),
    };
    const [rows, total] = await Promise.all([
      this.db.department.findMany({
        where,
        orderBy: ORDER,
        skip: page.skip,
        take: page.limit,
      }),
      this.db.department.count({ where }),
    ]);
    return { items: rows.map(this.toDomain), total };
  }
  countActiveProgrammes(departmentId: string) {
    return this.db.programme.count({ where: { departmentId, isActive: true } });
  }
}

@Injectable()
export class PrismaProgrammeRepository
  extends PrismaRepository
  implements ProgrammeRepository
{
  private toDomain = (r: {
    id: string;
    departmentId: string;
    code: string;
    name: string;
    awardType: Programme['awardType'];
    durationYears: number;
    currentCurriculumVersion: number;
    isActive: boolean;
  }) => Programme.restore(r);

  async findById(id: string) {
    const row = await this.db.programme.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }
  async findByCode(code: string) {
    const row = await this.db.programme.findUnique({ where: { code } });
    return row ? this.toDomain(row) : null;
  }
  insert(p: Programme) {
    return this.guardedInsert(() =>
      this.db.programme.create({
        data: {
          id: p.id,
          departmentId: p.departmentId,
          code: p.code,
          name: p.name,
          awardType: p.awardType,
          durationYears: p.durationYears,
          currentCurriculumVersion: p.currentCurriculumVersion,
          isActive: p.isActive,
        },
      }),
    );
  }
  async update(p: Programme) {
    await this.db.programme.update({
      where: { id: p.id },
      data: {
        name: p.name,
        durationYears: p.durationYears,
        currentCurriculumVersion: p.currentCurriculumVersion,
        isActive: p.isActive,
      },
    });
  }
  async list(
    filter: {
      departmentId?: string;
      awardType?: Programme['awardType'];
      search?: string;
      isActive?: boolean;
    },
    page: PageWindow,
  ): Promise<Paged<Programme>> {
    const where: Prisma.ProgrammeWhereInput = {
      ...(filter.departmentId ? { departmentId: filter.departmentId } : {}),
      ...(filter.awardType ? { awardType: filter.awardType } : {}),
      ...(filter.isActive !== undefined ? { isActive: filter.isActive } : {}),
      ...searchBy(filter.search),
    };
    const [rows, total] = await Promise.all([
      this.db.programme.findMany({
        where,
        orderBy: ORDER,
        skip: page.skip,
        take: page.limit,
      }),
      this.db.programme.count({ where }),
    ]);
    return { items: rows.map(this.toDomain), total };
  }
}

@Injectable()
export class PrismaUnitRepository
  extends PrismaRepository
  implements UnitRepository
{
  private toDomain = (r: {
    id: string;
    code: string;
    name: string;
    creditPoints: number;
    isActive: boolean;
  }) => Unit.restore(r);

  async findById(id: string) {
    const row = await this.db.unit.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }
  async findByCode(code: string) {
    const row = await this.db.unit.findUnique({ where: { code } });
    return row ? this.toDomain(row) : null;
  }
  insert(u: Unit) {
    return this.guardedInsert(() =>
      this.db.unit.create({
        data: {
          id: u.id,
          code: u.code,
          name: u.name,
          creditPoints: u.creditPoints,
          isActive: u.isActive,
        },
      }),
    );
  }
  async update(u: Unit) {
    await this.db.unit.update({
      where: { id: u.id },
      data: {
        name: u.name,
        creditPoints: u.creditPoints,
        isActive: u.isActive,
      },
    });
  }
  async list(
    filter: { search?: string; isActive?: boolean },
    page: PageWindow,
  ): Promise<Paged<Unit>> {
    const where: Prisma.UnitWhereInput = {
      ...(filter.isActive !== undefined ? { isActive: filter.isActive } : {}),
      ...searchBy(filter.search),
    };
    const [rows, total] = await Promise.all([
      this.db.unit.findMany({
        where,
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
        skip: page.skip,
        take: page.limit,
      }),
      this.db.unit.count({ where }),
    ]);
    return { items: rows.map(this.toDomain), total };
  }
}
