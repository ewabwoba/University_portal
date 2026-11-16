import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ConflictError } from '../../../../shared/domain/domain-error.js';
import { PrismaContext } from '../../../../shared/infrastructure/prisma/prisma-context.js';
import { AcademicYear } from '../../domain/entities/academic-year.entity.js';
import { AcademicErrorCodes } from '../../domain/errors/academic-error-codes.js';
import type {
  CalendarRepository,
  Paged,
  PageWindow,
} from '../../domain/repositories/academic.repositories.js';
import { isUniqueViolation } from './prisma-errors.js';

const CALENDAR_LOCK_KEY = 'academic:calendar';
const WITH_SEMESTERS = { semesters: true } satisfies Prisma.AcademicYearInclude;
type YearRow = Prisma.AcademicYearGetPayload<{
  include: typeof WITH_SEMESTERS;
}>;

const toDomain = (row: YearRow): AcademicYear =>
  AcademicYear.restore({
    id: row.id,
    name: row.name,
    startDate: row.startDate,
    endDate: row.endDate,
    semesters: row.semesters.map((s) => ({
      id: s.id,
      sequence: s.sequence,
      name: s.name,
      startDate: s.startDate,
      endDate: s.endDate,
      registrationOpensAt: s.registrationOpensAt,
      registrationClosesAt: s.registrationClosesAt,
      addDropClosesAt: s.addDropClosesAt,
    })),
  });

@Injectable()
export class PrismaCalendarRepository implements CalendarRepository {
  constructor(private readonly context: PrismaContext) {}

  private get db() {
    return this.context.client;
  }

  async lockCalendar() {
    await this.db
      .$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${CALENDAR_LOCK_KEY}))`;
  }

  async findYearById(id: string) {
    const row = await this.db.academicYear.findUnique({
      where: { id },
      include: WITH_SEMESTERS,
    });
    return row ? toDomain(row) : null;
  }

  async findYearByName(name: string) {
    const row = await this.db.academicYear.findUnique({
      where: { name },
      include: WITH_SEMESTERS,
    });
    return row ? toDomain(row) : null;
  }

  async findYearBySemesterId(semesterId: string) {
    const semester = await this.db.semester.findUnique({
      where: { id: semesterId },
      select: { academicYearId: true },
    });
    return semester ? this.findYearById(semester.academicYearId) : null;
  }

  async existsOverlappingYear(start: Date, end: Date, ignoreYearId?: string) {
    const count = await this.db.academicYear.count({
      where: {
        startDate: { lt: end },
        endDate: { gt: start },
        ...(ignoreYearId ? { id: { not: ignoreYearId } } : {}),
      },
    });
    return count > 0;
  }

  async insertYear(year: AcademicYear) {
    try {
      await this.db.academicYear.create({
        data: {
          id: year.id,
          name: year.name,
          startDate: year.startDate,
          endDate: year.endDate,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError(`Academic year ${year.name} already exists.`, {
          code: AcademicErrorCodes.YEAR_OVERLAP,
          cause: error,
        });
      }
      throw error;
    }
  }

  async saveYear(year: AcademicYear) {
    await this.db.academicYear.update({
      where: { id: year.id },
      data: { startDate: year.startDate, endDate: year.endDate },
    });
    try {
      for (const s of year.semesters) {
        const fields = {
          name: s.name,
          startDate: s.startDate,
          endDate: s.endDate,
          registrationOpensAt: s.registrationOpensAt,
          registrationClosesAt: s.registrationClosesAt,
          addDropClosesAt: s.addDropClosesAt,
        };
        await this.db.semester.upsert({
          where: { id: s.id },
          create: {
            id: s.id,
            academicYearId: year.id,
            sequence: s.sequence,
            ...fields,
          },
          update: fields,
        });
      }
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError(
          'That semester already exists in this academic year.',
          { code: AcademicErrorCodes.SEMESTER_EXISTS, cause: error },
        );
      }
      throw error;
    }
  }

  async listYears(page: PageWindow): Promise<Paged<AcademicYear>> {
    const [rows, total] = await Promise.all([
      this.db.academicYear.findMany({
        include: WITH_SEMESTERS,
        orderBy: { startDate: 'desc' },
        skip: page.skip,
        take: page.limit,
      }),
      this.db.academicYear.count(),
    ]);
    return { items: rows.map(toDomain), total };
  }

  async findYearContaining(at: Date) {
    const day = new Date(
      Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()),
    );
    const row = await this.db.academicYear.findFirst({
      where: { startDate: { lte: day }, endDate: { gte: day } },
      include: WITH_SEMESTERS,
    });
    return row ? toDomain(row) : null;
  }
}
