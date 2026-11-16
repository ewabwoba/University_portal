import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AUDIT_LOG } from '../../../../shared/application/ports/audit-log.port.js';
import type { AuditLog } from '../../../../shared/application/ports/audit-log.port.js';
import { CLOCK } from '../../../../shared/application/ports/clock.port.js';
import type { Clock } from '../../../../shared/application/ports/clock.port.js';
import { TRANSACTION_MANAGER } from '../../../../shared/application/ports/transaction-manager.port.js';
import type { TransactionManager } from '../../../../shared/application/ports/transaction-manager.port.js';
import {
  resolvePage,
  toPaginated,
} from '../../../../shared/application/pagination.js';
import type { PageQuery } from '../../../../shared/application/pagination.js';
import type { TypedConfigService } from '../../../../config/app-config.js';
import {
  ConflictError,
  NotFoundError,
} from '../../../../shared/domain/domain-error.js';
import type {
  AcademicCalendar,
  SemesterInfo,
} from '../../contracts/academic-calendar.port.js';
import { AcademicYear } from '../../domain/entities/academic-year.entity.js';
import type {
  SemesterInput,
  SemesterState,
} from '../../domain/entities/academic-year.entity.js';
import { AcademicErrorCodes as Codes } from '../../domain/errors/academic-error-codes.js';
import { CALENDAR_REPOSITORY } from '../../domain/repositories/academic.repositories.js';
import type { CalendarRepository } from '../../domain/repositories/academic.repositories.js';
import { EntityAudit } from './audited.js';

const semesterSnapshot = (s: SemesterState) => ({
  sequence: s.sequence,
  name: s.name,
  startDate: s.startDate.toISOString(),
  endDate: s.endDate.toISOString(),
  registrationOpensAt: s.registrationOpensAt.toISOString(),
  registrationClosesAt: s.registrationClosesAt.toISOString(),
  addDropClosesAt: s.addDropClosesAt?.toISOString() ?? null,
});
const yearSnapshot = (y: AcademicYear) => ({
  name: y.name,
  startDate: y.startDate.toISOString(),
  endDate: y.endDate.toISOString(),
});

@Injectable()
export class CalendarService implements AcademicCalendar {
  private readonly yearAudit: EntityAudit;
  private readonly semesterAudit: EntityAudit;

  constructor(
    @Inject(CALENDAR_REPOSITORY) private readonly calendar: CalendarRepository,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactions: TransactionManager,
    @Inject(AUDIT_LOG) audit: AuditLog,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ConfigService) private readonly config: TypedConfigService,
  ) {
    this.yearAudit = new EntityAudit(audit, 'AcademicYear');
    this.semesterAudit = new EntityAudit(audit, 'Semester');
  }

  private async year(id: string): Promise<AcademicYear> {
    const year = await this.calendar.findYearById(id);
    if (!year)
      throw new NotFoundError('Academic year not found.', {
        code: Codes.YEAR_NOT_FOUND,
      });
    return year;
  }

  private async assertNoYearOverlap(
    year: AcademicYear,
    ignoreId?: string,
  ): Promise<void> {
    if (
      await this.calendar.existsOverlappingYear(
        year.startDate,
        year.endDate,
        ignoreId,
      )
    ) {
      throw new ConflictError('These dates overlap another academic year.', {
        code: Codes.YEAR_OVERLAP,
      });
    }
  }

  createYear(input: {
    name: string;
    startDate: Date;
    endDate: Date;
  }): Promise<AcademicYear> {
    const year = AcademicYear.create(input);
    return this.transactions.run(async () => {
      await this.calendar.lockCalendar();
      if (await this.calendar.findYearByName(year.name)) {
        throw new ConflictError(`Academic year ${year.name} already exists.`, {
          code: Codes.YEAR_OVERLAP,
        });
      }
      await this.assertNoYearOverlap(year);
      await this.calendar.insertYear(year);
      await this.yearAudit.created(year.id, yearSnapshot(year));
      return year;
    });
  }

  updateYear(
    id: string,
    patch: { startDate?: Date; endDate?: Date },
  ): Promise<AcademicYear> {
    return this.transactions.run(async () => {
      await this.calendar.lockCalendar();
      const year = await this.year(id);
      const before = yearSnapshot(year);
      year.reschedule(
        patch.startDate ?? year.startDate,
        patch.endDate ?? year.endDate,
      );
      await this.assertNoYearOverlap(year, id);
      await this.calendar.saveYear(year);
      await this.yearAudit.updated(id, before, yearSnapshot(year));
      return year;
    });
  }

  getYear(id: string): Promise<AcademicYear> {
    return this.year(id);
  }

  async listYears(query: PageQuery) {
    const page = resolvePage(
      query,
      this.config.get('pagination', { infer: true }),
    );
    const { items, total } = await this.calendar.listYears({
      skip: page.skip,
      limit: page.limit,
    });
    return toPaginated(items, total, page);
  }

  addSemester(
    yearId: string,
    input: SemesterInput,
  ): Promise<{ year: AcademicYear; semester: SemesterState }> {
    return this.transactions.run(async () => {
      await this.calendar.lockCalendar();
      const year = await this.year(yearId);
      const semester = year.addSemester(input);
      await this.calendar.saveYear(year);
      await this.semesterAudit.created(semester.id, {
        academicYear: year.name,
        ...semesterSnapshot(semester),
      });
      return { year, semester };
    });
  }

  updateSemester(
    semesterId: string,
    patch: Partial<Omit<SemesterInput, 'sequence'>>,
  ): Promise<{ year: AcademicYear; semester: SemesterState }> {
    return this.transactions.run(async () => {
      await this.calendar.lockCalendar();
      const year = await this.calendar.findYearBySemesterId(semesterId);
      if (!year)
        throw new NotFoundError('Semester not found.', {
          code: Codes.SEMESTER_NOT_FOUND,
        });
      const before = semesterSnapshot(
        year.semesters.find((s) => s.id === semesterId)!,
      );
      const semester = year.updateSemester(semesterId, patch);
      await this.calendar.saveYear(year);
      await this.semesterAudit.updated(
        semesterId,
        before,
        semesterSnapshot(semester),
      );
      return { year, semester };
    });
  }

  // ── AcademicCalendar (public contract) ──
  private toInfo(year: AcademicYear, s: SemesterState): SemesterInfo {
    return {
      id: s.id,
      academicYearId: year.id,
      academicYearName: year.name,
      sequence: s.sequence,
      name: s.name,
      startDate: s.startDate,
      endDate: s.endDate,
      registrationOpensAt: s.registrationOpensAt,
      registrationClosesAt: s.registrationClosesAt,
      addDropClosesAt: s.addDropClosesAt,
    };
  }

  async getSemester(semesterId: string): Promise<SemesterInfo> {
    const year = await this.calendar.findYearBySemesterId(semesterId);
    const semester = year?.semesters.find((s) => s.id === semesterId);
    if (!year || !semester)
      throw new NotFoundError('Semester not found.', {
        code: Codes.SEMESTER_NOT_FOUND,
      });
    return this.toInfo(year, semester);
  }

  async findCurrentSemester(
    at: Date = this.clock.now(),
  ): Promise<SemesterInfo | null> {
    const year = await this.calendar.findYearContaining(at);
    const day = new Date(
      Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()),
    );
    const semester = year?.semesters.find(
      (s) => s.startDate <= day && day <= s.endDate,
    );
    return year && semester ? this.toInfo(year, semester) : null;
  }

  async isRegistrationOpen(
    semesterId: string,
    at: Date = this.clock.now(),
  ): Promise<boolean> {
    const semester = await this.getSemester(semesterId);
    return (
      semester.registrationOpensAt <= at && at < semester.registrationClosesAt
    );
  }
}
