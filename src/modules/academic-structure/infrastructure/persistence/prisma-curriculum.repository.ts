import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ConflictError } from '../../../../shared/domain/domain-error.js';
import { PrismaContext } from '../../../../shared/infrastructure/prisma/prisma-context.js';
import { CurriculumEntry } from '../../domain/entities/curriculum-entry.entity.js';
import { AcademicErrorCodes } from '../../domain/errors/academic-error-codes.js';
import type {
  CurriculumEntryView,
  CurriculumRepository,
} from '../../domain/repositories/academic.repositories.js';
import { isUniqueViolation } from './prisma-errors.js';

const WITH_PREREQUISITES = {
  prerequisites: { select: { prerequisiteId: true } },
} satisfies Prisma.ProgrammeUnitInclude;
type EntryRow = Prisma.ProgrammeUnitGetPayload<{
  include: typeof WITH_PREREQUISITES;
}>;

const toDomain = (row: EntryRow): CurriculumEntry =>
  CurriculumEntry.restore(row.id, {
    programmeId: row.programmeId,
    unitId: row.unitId,
    curriculumVersion: row.curriculumVersion,
    studyYear: row.studyYear,
    recommendedSemester: row.recommendedSemester,
    isCompulsory: row.isCompulsory,
    prerequisiteIds: row.prerequisites.map((p) => p.prerequisiteId),
  });

@Injectable()
export class PrismaCurriculumRepository implements CurriculumRepository {
  constructor(private readonly context: PrismaContext) {}

  private get db() {
    return this.context.client;
  }

  async findById(id: string) {
    const row = await this.db.programmeUnit.findUnique({
      where: { id },
      include: WITH_PREREQUISITES,
    });
    return row ? toDomain(row) : null;
  }

  async findByUnit(
    programmeId: string,
    curriculumVersion: number,
    unitId: string,
  ) {
    const row = await this.db.programmeUnit.findUnique({
      where: {
        programmeId_unitId_curriculumVersion: {
          programmeId,
          unitId,
          curriculumVersion,
        },
      },
      include: WITH_PREREQUISITES,
    });
    return row ? toDomain(row) : null;
  }

  async findAllInVersion(programmeId: string, curriculumVersion: number) {
    const rows = await this.db.programmeUnit.findMany({
      where: { programmeId, curriculumVersion },
      include: WITH_PREREQUISITES,
    });
    return rows.map(toDomain);
  }

  async listViews(
    programmeId: string,
    curriculumVersion: number,
  ): Promise<CurriculumEntryView[]> {
    const rows = await this.db.programmeUnit.findMany({
      where: { programmeId, curriculumVersion },
      include: {
        unit: { select: { code: true, name: true, creditPoints: true } },
        prerequisites: {
          select: {
            prerequisiteId: true,
            required: { select: { unitId: true } },
          },
        },
      },
      orderBy: [
        { studyYear: 'asc' },
        { recommendedSemester: 'asc' },
        { unit: { code: 'asc' } },
      ],
    });
    return rows.map((row) => ({
      id: row.id,
      programmeId: row.programmeId,
      curriculumVersion: row.curriculumVersion,
      unitId: row.unitId,
      unitCode: row.unit.code,
      unitName: row.unit.name,
      creditPoints: row.unit.creditPoints,
      studyYear: row.studyYear,
      recommendedSemester: row.recommendedSemester,
      isCompulsory: row.isCompulsory,
      prerequisiteIds: row.prerequisites.map((p) => p.prerequisiteId),
      prerequisiteUnitIds: row.prerequisites.map((p) => p.required.unitId),
    }));
  }

  async insert(entry: CurriculumEntry) {
    try {
      await this.db.programmeUnit.create({
        data: {
          id: entry.id,
          programmeId: entry.programmeId,
          unitId: entry.unitId,
          curriculumVersion: entry.curriculumVersion,
          studyYear: entry.studyYear,
          recommendedSemester: entry.recommendedSemester,
          isCompulsory: entry.isCompulsory,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError(
          'That unit is already in this curriculum version.',
          { code: AcademicErrorCodes.ENTRY_EXISTS, cause: error },
        );
      }
      throw error;
    }
  }

  async update(entry: CurriculumEntry) {
    await this.db.programmeUnit.update({
      where: { id: entry.id },
      data: {
        studyYear: entry.studyYear,
        recommendedSemester: entry.recommendedSemester,
        isCompulsory: entry.isCompulsory,
      },
    });
    await this.db.programmeUnitPrerequisite.deleteMany({
      where: { programmeUnitId: entry.id },
    });
    if (entry.prerequisiteIds.length > 0) {
      await this.db.programmeUnitPrerequisite.createMany({
        data: entry.prerequisiteIds.map((prerequisiteId) => ({
          programmeUnitId: entry.id,
          prerequisiteId,
        })),
      });
    }
  }

  async delete(id: string) {
    await this.db.programmeUnit.delete({ where: { id } });
  }

  async isPrerequisiteOfAny(entryId: string) {
    return (
      (await this.db.programmeUnitPrerequisite.count({
        where: { prerequisiteId: entryId },
      })) > 0
    );
  }

  countInVersion(programmeId: string, curriculumVersion: number) {
    return this.db.programmeUnit.count({
      where: { programmeId, curriculumVersion },
    });
  }

  async maxStudyYear(programmeId: string) {
    const result = await this.db.programmeUnit.aggregate({
      where: { programmeId },
      _max: { studyYear: true },
    });
    return result._max.studyYear ?? 0;
  }
}
