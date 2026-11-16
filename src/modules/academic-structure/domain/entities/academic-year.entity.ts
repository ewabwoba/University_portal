import { randomUUID } from 'node:crypto';
import { AggregateRoot } from '../../../../shared/domain/aggregate-root.js';
import {
  ConflictError,
  ValidationError,
} from '../../../../shared/domain/domain-error.js';
import { AcademicErrorCodes } from '../errors/academic-error-codes.js';
import { requireInt, requireName } from '../validation.js';

const YEAR_NAME_PATTERN = /^(\d{4})\/(\d{4})$/;
const MAX_YEAR_LENGTH_DAYS = 400;
const MAX_SEMESTERS_PER_YEAR = 6;
const MS_PER_DAY = 86_400_000;

export interface SemesterState {
  id: string;
  sequence: number;
  name: string;
  startDate: Date;
  endDate: Date;
  registrationOpensAt: Date;
  registrationClosesAt: Date;
  addDropClosesAt: Date | null;
}

export type SemesterInput = Omit<SemesterState, 'id'>;

const invalid = (message: string) =>
  new ValidationError(message, { code: AcademicErrorCodes.SEMESTER_INVALID });
const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) =>
  aStart < bEnd && bStart < aEnd;

/**
 * An academic year and its semesters. The aggregate owns the calendar rules, so an inconsistent
 * calendar (overlapping semesters, a registration window that closes after the semester ends) cannot exist.
 */
export class AcademicYear extends AggregateRoot<string> {
  private constructor(
    id: string,
    private _name: string,
    private _startDate: Date,
    private _endDate: Date,
    private _semesters: SemesterState[],
  ) {
    super(id);
  }

  static create(input: {
    name: string;
    startDate: Date;
    endDate: Date;
  }): AcademicYear {
    AcademicYear.assertName(input.name);
    AcademicYear.assertDates(input.startDate, input.endDate);
    return new AcademicYear(
      randomUUID(),
      input.name.trim(),
      input.startDate,
      input.endDate,
      [],
    );
  }

  static restore(r: {
    id: string;
    name: string;
    startDate: Date;
    endDate: Date;
    semesters: SemesterState[];
  }): AcademicYear {
    return new AcademicYear(
      r.id,
      r.name,
      r.startDate,
      r.endDate,
      r.semesters.map((s) => ({ ...s })),
    );
  }

  private static assertName(name: string): void {
    const match = YEAR_NAME_PATTERN.exec(name.trim());
    if (!match || Number(match[2]) !== Number(match[1]) + 1) {
      throw new ValidationError(
        'Academic year name must look like 2026/2027 (consecutive years).',
        { code: AcademicErrorCodes.YEAR_INVALID },
      );
    }
  }

  private static assertDates(start: Date, end: Date): void {
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start
    ) {
      throw new ValidationError('The academic year must end after it starts.', {
        code: AcademicErrorCodes.YEAR_INVALID,
      });
    }
    if ((end.getTime() - start.getTime()) / MS_PER_DAY > MAX_YEAR_LENGTH_DAYS) {
      throw new ValidationError(
        `An academic year cannot be longer than ${MAX_YEAR_LENGTH_DAYS} days.`,
        { code: AcademicErrorCodes.YEAR_INVALID },
      );
    }
  }

  get name(): string {
    return this._name;
  }
  get startDate(): Date {
    return this._startDate;
  }
  get endDate(): Date {
    return this._endDate;
  }
  get semesters(): SemesterState[] {
    return this._semesters
      .map((s) => ({ ...s }))
      .sort((a, b) => a.sequence - b.sequence);
  }

  reschedule(startDate: Date, endDate: Date): void {
    AcademicYear.assertDates(startDate, endDate);
    const outside = this._semesters.find(
      (s) => s.startDate < startDate || s.endDate > endDate,
    );
    if (outside)
      throw invalid(
        `Semester ${outside.sequence} would fall outside the academic year.`,
      );
    this._startDate = startDate;
    this._endDate = endDate;
  }

  addSemester(input: SemesterInput): SemesterState {
    requireInt(input.sequence, 'sequence', 1, MAX_SEMESTERS_PER_YEAR);
    if (this._semesters.some((s) => s.sequence === input.sequence)) {
      throw new ConflictError(
        `Semester ${input.sequence} already exists in ${this._name}.`,
        { code: AcademicErrorCodes.SEMESTER_EXISTS },
      );
    }
    const semester: SemesterState = {
      id: randomUUID(),
      ...this.validated(input, undefined),
    };
    this._semesters.push(semester);
    return semester;
  }

  updateSemester(
    semesterId: string,
    patch: Partial<Omit<SemesterInput, 'sequence'>>,
  ): SemesterState {
    const current = this._semesters.find((s) => s.id === semesterId);
    if (!current)
      throw new ConflictError(
        'Semester does not belong to this academic year.',
        { code: AcademicErrorCodes.SEMESTER_NOT_FOUND },
      );
    // A field that is merely absent from the patch (`undefined`) must keep its current value.
    const changes = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    );
    Object.assign(
      current,
      this.validated({ ...current, ...changes }, semesterId),
    );
    return current;
  }

  /** Applies every calendar rule to a would-be semester. `ignoreId` excludes the semester being edited. */
  private validated(
    input: SemesterInput,
    ignoreId: string | undefined,
  ): SemesterInput {
    const {
      startDate,
      endDate,
      registrationOpensAt,
      registrationClosesAt,
      addDropClosesAt,
    } = input;
    const dates = [
      startDate,
      endDate,
      registrationOpensAt,
      registrationClosesAt,
      ...(addDropClosesAt ? [addDropClosesAt] : []),
    ];
    if (dates.some((d) => Number.isNaN(d.getTime())))
      throw invalid('A date is not valid.');
    if (endDate <= startDate)
      throw invalid('The semester must end after it starts.');
    if (startDate < this._startDate || endDate > this._endDate)
      throw invalid(`The semester must fall within ${this._name}.`);
    if (registrationClosesAt <= registrationOpensAt)
      throw invalid('Registration must close after it opens.');
    if (registrationClosesAt > endDate)
      throw invalid(
        'Registration cannot stay open past the end of the semester.',
      );
    if (
      addDropClosesAt &&
      (addDropClosesAt < registrationOpensAt || addDropClosesAt > endDate)
    ) {
      throw invalid(
        'The add/drop deadline must fall between registration opening and the end of the semester.',
      );
    }

    const clash = this._semesters.find(
      (s) =>
        s.id !== ignoreId &&
        overlaps(startDate, endDate, s.startDate, s.endDate),
    );
    if (clash) {
      throw new ConflictError(`The dates overlap semester ${clash.sequence}.`, {
        code: AcademicErrorCodes.SEMESTER_OVERLAP,
        details: { sequence: clash.sequence },
      });
    }
    return {
      sequence: input.sequence,
      name: requireName(input.name, 'Semester name'),
      startDate,
      endDate,
      registrationOpensAt,
      registrationClosesAt,
      addDropClosesAt: addDropClosesAt ?? null,
    };
  }
}
