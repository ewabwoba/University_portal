import { Injectable } from '@nestjs/common';
import { OfferingStatus as PrismaOfferingStatus, Prisma } from '@prisma/client';
import {
  ConcurrencyError,
  ConflictError,
} from '../../../../shared/domain/domain-error.js';
import { PrismaContext } from '../../../../shared/infrastructure/prisma/prisma-context.js';
import {
  OfferingStatus,
  UnitOffering,
} from '../../domain/entities/unit-offering.entity.js';
import { AcademicErrorCodes } from '../../domain/errors/academic-error-codes.js';
import type {
  OfferingRepository,
  OfferingView,
  Paged,
  PageWindow,
} from '../../domain/repositories/academic.repositories.js';
import { isUniqueViolation } from './prisma-errors.js';

const VIEW_INCLUDE = {
  unit: { select: { code: true, name: true } },
  semester: {
    select: { name: true, academicYear: { select: { name: true } } },
  },
} satisfies Prisma.UnitOfferingInclude;
type ViewRow = Prisma.UnitOfferingGetPayload<{ include: typeof VIEW_INCLUDE }>;

const toView = (row: ViewRow): OfferingView => ({
  id: row.id,
  unitId: row.unitId,
  unitCode: row.unit.code,
  unitName: row.unit.name,
  semesterId: row.semesterId,
  semesterName: row.semester.name,
  academicYearName: row.semester.academicYear.name,
  classGroup: row.classGroup,
  capacity: row.capacity,
  enrolledCount: row.enrolledCount,
  seatsRemaining: row.capacity - row.enrolledCount,
  status: row.status,
});

@Injectable()
export class PrismaOfferingRepository implements OfferingRepository {
  constructor(private readonly context: PrismaContext) {}

  private get db() {
    return this.context.client;
  }

  async findById(id: string) {
    const row = await this.db.unitOffering.findUnique({ where: { id } });
    return row
      ? UnitOffering.restore(row.id, {
          unitId: row.unitId,
          semesterId: row.semesterId,
          classGroup: row.classGroup,
          capacity: row.capacity,
          enrolledCount: row.enrolledCount,
          status: row.status,
        })
      : null;
  }

  async findView(id: string) {
    const row = await this.db.unitOffering.findUnique({
      where: { id },
      include: VIEW_INCLUDE,
    });
    return row ? toView(row) : null;
  }

  async insert(offering: UnitOffering) {
    try {
      await this.db.unitOffering.create({
        data: {
          id: offering.id,
          unitId: offering.unitId,
          semesterId: offering.semesterId,
          classGroup: offering.classGroup,
          capacity: offering.capacity,
          status: offering.status,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError(
          'This unit is already offered in this semester for that class group.',
          { code: AcademicErrorCodes.OFFERING_EXISTS, cause: error },
        );
      }
      throw error;
    }
  }

  async update(offering: UnitOffering) {
    // The guard lives in the WHERE clause so a seat reserved a moment ago cannot be overwritten.
    const cancelling = offering.status === OfferingStatus.CANCELLED;
    const result = await this.db.unitOffering.updateMany({
      where: {
        id: offering.id,
        enrolledCount: cancelling ? 0 : { lte: offering.capacity },
      },
      data: { capacity: offering.capacity, status: offering.status },
    });
    if (result.count === 0) {
      throw new ConcurrencyError(
        'Enrolment changed while you were editing this offering. Reload and try again.',
        { code: 'OFFERING_ENROLMENT_CHANGED' },
      );
    }
  }

  async list(
    filter: { semesterId?: string; unitId?: string; status?: OfferingStatus },
    page: PageWindow,
  ): Promise<Paged<OfferingView>> {
    const where: Prisma.UnitOfferingWhereInput = {
      ...(filter.semesterId ? { semesterId: filter.semesterId } : {}),
      ...(filter.unitId ? { unitId: filter.unitId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.unitOffering.findMany({
        where,
        include: VIEW_INCLUDE,
        skip: page.skip,
        take: page.limit,
        orderBy: [
          { semester: { startDate: 'desc' } },
          { unit: { code: 'asc' } },
          { classGroup: 'asc' },
        ],
      }),
      this.db.unitOffering.count({ where }),
    ]);
    return { items: rows.map(toView), total };
  }

  async tryReserveSeat(id: string) {
    // ONE statement checks and increments, so two simultaneous reservations cannot both take the last seat.
    const taken = await this.db.$executeRaw`
      UPDATE "unit_offerings"
      SET "enrolled_count" = "enrolled_count" + 1, "updated_at" = (now() AT TIME ZONE 'UTC')
      WHERE "id" = ${id}::uuid
        AND "status" = ${PrismaOfferingStatus.OPEN}::"offering_status"
        AND "enrolled_count" < "capacity"`;
    return taken === 1;
  }

  async tryReleaseSeat(id: string) {
    const released = await this.db.$executeRaw`
      UPDATE "unit_offerings"
      SET "enrolled_count" = "enrolled_count" - 1, "updated_at" = (now() AT TIME ZONE 'UTC')
      WHERE "id" = ${id}::uuid AND "enrolled_count" > 0`;
    return released === 1;
  }
}
