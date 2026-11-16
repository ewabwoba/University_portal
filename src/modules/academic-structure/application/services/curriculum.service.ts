import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOG } from '../../../../shared/application/ports/audit-log.port.js';
import type { AuditLog } from '../../../../shared/application/ports/audit-log.port.js';
import { TRANSACTION_MANAGER } from '../../../../shared/application/ports/transaction-manager.port.js';
import type { TransactionManager } from '../../../../shared/application/ports/transaction-manager.port.js';
import {
  BusinessRuleViolationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../../shared/domain/domain-error.js';
import type {
  CurriculumPlacement,
  CurriculumReader,
} from '../../contracts/curriculum-reader.port.js';
import { CurriculumEntry } from '../../domain/entities/curriculum-entry.entity.js';
import { AcademicErrorCodes as Codes } from '../../domain/errors/academic-error-codes.js';
import {
  CURRICULUM_REPOSITORY,
  PROGRAMME_REPOSITORY,
  UNIT_REPOSITORY,
} from '../../domain/repositories/academic.repositories.js';
import type {
  CurriculumEntryView,
  CurriculumRepository,
  ProgrammeRepository,
  UnitRepository,
} from '../../domain/repositories/academic.repositories.js';
import {
  findPrerequisiteCycle,
  rotateCycleTo,
} from '../../domain/services/prerequisite-graph.js';
import { EntityAudit } from './audited.js';

@Injectable()
export class CurriculumService implements CurriculumReader {
  private readonly audit: EntityAudit;

  constructor(
    @Inject(CURRICULUM_REPOSITORY)
    private readonly curriculum: CurriculumRepository,
    @Inject(PROGRAMME_REPOSITORY)
    private readonly programmes: ProgrammeRepository,
    @Inject(UNIT_REPOSITORY) private readonly units: UnitRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactions: TransactionManager,
    @Inject(AUDIT_LOG) audit: AuditLog,
  ) {
    this.audit = new EntityAudit(audit, 'CurriculumEntry');
  }

  private async programme(id: string) {
    const programme = await this.programmes.findById(id);
    if (!programme)
      throw new NotFoundError('Programme not found.', {
        code: Codes.PROGRAMME_NOT_FOUND,
      });
    return programme;
  }

  private async entry(id: string): Promise<CurriculumEntry> {
    const entry = await this.curriculum.findById(id);
    if (!entry)
      throw new NotFoundError('Curriculum entry not found.', {
        code: Codes.ENTRY_NOT_FOUND,
      });
    return entry;
  }

  private snapshot = (e: CurriculumEntry) => ({
    programmeId: e.programmeId,
    unitId: e.unitId,
    curriculumVersion: e.curriculumVersion,
    studyYear: e.studyYear,
    recommendedSemester: e.recommendedSemester,
    isCompulsory: e.isCompulsory,
    prerequisiteIds: e.prerequisiteIds,
  });

  addEntry(input: {
    programmeId: string;
    unitId: string;
    studyYear: number;
    recommendedSemester: number;
    isCompulsory?: boolean;
    curriculumVersion?: number;
  }): Promise<CurriculumEntry> {
    return this.transactions.run(async () => {
      const programme = await this.programme(input.programmeId);
      if (!programme.isActive)
        throw new BusinessRuleViolationError('The programme is inactive.', {
          code: Codes.PARENT_INACTIVE,
        });

      // Only the live version or the next one (being prepared) may be edited; older versions are history.
      const version =
        input.curriculumVersion ?? programme.currentCurriculumVersion;
      if (
        version < programme.currentCurriculumVersion ||
        version > programme.currentCurriculumVersion + 1
      ) {
        throw new ValidationError(
          `Only curriculum versions ${programme.currentCurriculumVersion} (current) and ${programme.currentCurriculumVersion + 1} (next) can be edited.`,
          { code: Codes.CURRICULUM_VERSION_INVALID },
        );
      }

      const unit = await this.units.findById(input.unitId);
      if (!unit)
        throw new NotFoundError('Unit not found.', {
          code: Codes.UNIT_NOT_FOUND,
        });
      if (!unit.isActive)
        throw new BusinessRuleViolationError('The unit is inactive.', {
          code: Codes.PARENT_INACTIVE,
        });
      if (await this.curriculum.findByUnit(programme.id, version, unit.id)) {
        throw new ConflictError(
          `${unit.code} is already in version ${version} of this curriculum.`,
          { code: Codes.ENTRY_EXISTS },
        );
      }

      const entry = CurriculumEntry.create(
        {
          programmeId: programme.id,
          unitId: unit.id,
          curriculumVersion: version,
          studyYear: input.studyYear,
          recommendedSemester: input.recommendedSemester,
          isCompulsory: input.isCompulsory ?? true,
        },
        programme.durationYears,
      );
      await this.curriculum.insert(entry);
      await this.audit.created(entry.id, this.snapshot(entry));
      return entry;
    });
  }

  updateEntry(
    id: string,
    patch: {
      studyYear?: number;
      recommendedSemester?: number;
      isCompulsory?: boolean;
    },
  ): Promise<CurriculumEntry> {
    return this.transactions.run(async () => {
      const entry = await this.entry(id);
      const programme = await this.programme(entry.programmeId);
      const before = this.snapshot(entry);
      entry.reposition(patch, programme.durationYears);
      await this.curriculum.update(entry);
      await this.audit.updated(id, before, this.snapshot(entry));
      return entry;
    });
  }

  removeEntry(id: string): Promise<void> {
    return this.transactions.run(async () => {
      const entry = await this.entry(id);
      if (await this.curriculum.isPrerequisiteOfAny(id)) {
        throw new ConflictError(
          'Other units list this one as a prerequisite. Remove those links first.',
          { code: Codes.ENTRY_IS_PREREQUISITE },
        );
      }
      await this.curriculum.delete(id);
      await this.audit.removed(id, this.snapshot(entry));
    });
  }

  /** Replaces the prerequisites of one entry, refusing anything that would create a cycle. */
  setPrerequisites(
    id: string,
    prerequisiteIds: string[],
  ): Promise<CurriculumEntry> {
    return this.transactions.run(async () => {
      const entry = await this.entry(id);
      const wanted = [...new Set(prerequisiteIds)];
      const inVersion = await this.curriculum.findAllInVersion(
        entry.programmeId,
        entry.curriculumVersion,
      );
      const byId = new Map(inVersion.map((e) => [e.id, e]));

      for (const prerequisiteId of wanted) {
        if (prerequisiteId === id) {
          throw new ValidationError('A unit cannot be its own prerequisite.', {
            code: Codes.PREREQUISITE_INVALID,
          });
        }
        if (!byId.has(prerequisiteId)) {
          throw new ValidationError(
            'A prerequisite must be a unit in the same programme and curriculum version.',
            {
              code: Codes.PREREQUISITE_INVALID,
              details: { entryId: prerequisiteId },
            },
          );
        }
      }

      const graph = new Map(
        inVersion.map((e) => [e.id, e.id === id ? wanted : e.prerequisiteIds]),
      );
      const cycle = findPrerequisiteCycle(graph);
      if (cycle) {
        throw new ConflictError(
          'These prerequisites form a loop: no student could ever satisfy them.',
          {
            code: Codes.PREREQUISITE_CYCLE,
            details: {
              unitIds: rotateCycleTo(cycle, id).map(
                (entryId) => byId.get(entryId)!.unitId,
              ),
            },
          },
        );
      }

      const before = this.snapshot(entry);
      entry.setPrerequisites(wanted);
      await this.curriculum.update(entry);
      await this.audit.updated(id, before, this.snapshot(entry));
      return entry;
    });
  }

  async view(
    programmeId: string,
    version?: number,
  ): Promise<{
    programmeId: string;
    curriculumVersion: number;
    entries: CurriculumEntryView[];
  }> {
    const programme = await this.programme(programmeId);
    const curriculumVersion = version ?? programme.currentCurriculumVersion;
    const entries = await this.curriculum.listViews(
      programmeId,
      curriculumVersion,
    );
    return { programmeId, curriculumVersion, entries };
  }

  // ── CurriculumReader (public contract) ──
  private toPlacement(view: CurriculumEntryView): CurriculumPlacement {
    return {
      programmeId: view.programmeId,
      curriculumVersion: view.curriculumVersion,
      unitId: view.unitId,
      unitCode: view.unitCode,
      studyYear: view.studyYear,
      recommendedSemester: view.recommendedSemester,
      isCompulsory: view.isCompulsory,
      prerequisiteUnitIds: view.prerequisiteUnitIds,
    };
  }

  async listPlacements(
    programmeId: string,
    curriculumVersion: number,
  ): Promise<CurriculumPlacement[]> {
    return (
      await this.curriculum.listViews(programmeId, curriculumVersion)
    ).map((v) => this.toPlacement(v));
  }

  async findPlacement(
    programmeId: string,
    curriculumVersion: number,
    unitId: string,
  ): Promise<CurriculumPlacement | null> {
    const view = (
      await this.curriculum.listViews(programmeId, curriculumVersion)
    ).find((v) => v.unitId === unitId);
    return view ? this.toPlacement(view) : null;
  }
}
