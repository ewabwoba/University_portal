import { randomUUID } from 'node:crypto';
import { AggregateRoot } from '../../../../shared/domain/aggregate-root.js';
import { ValidationError } from '../../../../shared/domain/domain-error.js';
import { AcademicErrorCodes } from '../errors/academic-error-codes.js';
import { Code } from '../value-objects/code.vo.js';
import { requireInt, requireName } from '../validation.js';

export const AwardType = {
  CERTIFICATE: 'CERTIFICATE',
  DIPLOMA: 'DIPLOMA',
  BACHELORS: 'BACHELORS',
  POSTGRADUATE_DIPLOMA: 'POSTGRADUATE_DIPLOMA',
  MASTERS: 'MASTERS',
  DOCTORATE: 'DOCTORATE',
} as const;
export type AwardType = (typeof AwardType)[keyof typeof AwardType];

const MAX_PROGRAMME_YEARS = 8;
const MAX_CREDIT_POINTS = 100;
const LOCATION_MAX = 150;

/** Shared lifecycle of the simple reference records: they are deactivated, never deleted. */
abstract class CatalogEntity extends AggregateRoot<string> {
  protected constructor(
    id: string,
    protected _code: Code,
    protected _name: string,
    protected _isActive: boolean,
  ) {
    super(id);
  }
  get code(): string {
    return this._code.value;
  }
  get name(): string {
    return this._name;
  }
  get isActive(): boolean {
    return this._isActive;
  }
  protected applyCommon(patch: { name?: string; isActive?: boolean }): void {
    if (patch.name !== undefined) this._name = requireName(patch.name);
    if (patch.isActive !== undefined) this._isActive = patch.isActive;
  }
}

export class Campus extends CatalogEntity {
  private constructor(
    id: string,
    code: Code,
    name: string,
    isActive: boolean,
    private _location: string | null,
  ) {
    super(id, code, name, isActive);
  }
  static create(input: {
    code: string;
    name: string;
    location?: string | null;
  }): Campus {
    return new Campus(
      randomUUID(),
      Code.create(input.code),
      requireName(input.name),
      true,
      Campus.location(input.location),
    );
  }
  static restore(r: {
    id: string;
    code: string;
    name: string;
    location: string | null;
    isActive: boolean;
  }): Campus {
    return new Campus(
      r.id,
      Code.create(r.code),
      r.name,
      r.isActive,
      r.location,
    );
  }
  private static location(value: string | null | undefined): string | null {
    if (value === undefined || value === null || value.trim() === '')
      return null;
    if (value.trim().length > LOCATION_MAX)
      throw new ValidationError(
        `location must be at most ${LOCATION_MAX} characters.`,
        { code: AcademicErrorCodes.NAME_INVALID },
      );
    return value.trim();
  }
  get location(): string | null {
    return this._location;
  }
  update(patch: {
    name?: string;
    location?: string | null;
    isActive?: boolean;
  }): void {
    this.applyCommon(patch);
    if (patch.location !== undefined)
      this._location = Campus.location(patch.location);
  }
}

export class Faculty extends CatalogEntity {
  private constructor(
    id: string,
    readonly campusId: string,
    code: Code,
    name: string,
    isActive: boolean,
  ) {
    super(id, code, name, isActive);
  }
  static create(input: {
    campusId: string;
    code: string;
    name: string;
  }): Faculty {
    return new Faculty(
      randomUUID(),
      input.campusId,
      Code.create(input.code),
      requireName(input.name),
      true,
    );
  }
  static restore(r: {
    id: string;
    campusId: string;
    code: string;
    name: string;
    isActive: boolean;
  }): Faculty {
    return new Faculty(
      r.id,
      r.campusId,
      Code.create(r.code),
      r.name,
      r.isActive,
    );
  }
  update(patch: { name?: string; isActive?: boolean }): void {
    this.applyCommon(patch);
  }
}

export class Department extends CatalogEntity {
  private constructor(
    id: string,
    readonly facultyId: string,
    code: Code,
    name: string,
    isActive: boolean,
  ) {
    super(id, code, name, isActive);
  }
  static create(input: {
    facultyId: string;
    code: string;
    name: string;
  }): Department {
    return new Department(
      randomUUID(),
      input.facultyId,
      Code.create(input.code),
      requireName(input.name),
      true,
    );
  }
  static restore(r: {
    id: string;
    facultyId: string;
    code: string;
    name: string;
    isActive: boolean;
  }): Department {
    return new Department(
      r.id,
      r.facultyId,
      Code.create(r.code),
      r.name,
      r.isActive,
    );
  }
  update(patch: { name?: string; isActive?: boolean }): void {
    this.applyCommon(patch);
  }
}

export class Programme extends CatalogEntity {
  private constructor(
    id: string,
    readonly departmentId: string,
    code: Code,
    name: string,
    isActive: boolean,
    readonly awardType: AwardType,
    private _durationYears: number,
    private _currentCurriculumVersion: number,
  ) {
    super(id, code, name, isActive);
  }
  static create(input: {
    departmentId: string;
    code: string;
    name: string;
    awardType: AwardType;
    durationYears: number;
  }): Programme {
    return new Programme(
      randomUUID(),
      input.departmentId,
      Code.create(input.code),
      requireName(input.name),
      true,
      input.awardType,
      requireInt(input.durationYears, 'durationYears', 1, MAX_PROGRAMME_YEARS),
      1,
    );
  }
  static restore(r: {
    id: string;
    departmentId: string;
    code: string;
    name: string;
    awardType: AwardType;
    durationYears: number;
    currentCurriculumVersion: number;
    isActive: boolean;
  }): Programme {
    return new Programme(
      r.id,
      r.departmentId,
      Code.create(r.code),
      r.name,
      r.isActive,
      r.awardType,
      r.durationYears,
      r.currentCurriculumVersion,
    );
  }
  get durationYears(): number {
    return this._durationYears;
  }
  get currentCurriculumVersion(): number {
    return this._currentCurriculumVersion;
  }
  update(patch: {
    name?: string;
    durationYears?: number;
    isActive?: boolean;
  }): void {
    this.applyCommon(patch);
    if (patch.durationYears !== undefined)
      this._durationYears = requireInt(
        patch.durationYears,
        'durationYears',
        1,
        MAX_PROGRAMME_YEARS,
      );
  }
  /** New admissions follow the new version; students already enrolled keep theirs. Only one step at a time. */
  adoptCurriculumVersion(version: number): void {
    if (version !== this._currentCurriculumVersion + 1) {
      throw new ValidationError(
        `The next curriculum version is ${this._currentCurriculumVersion + 1}.`,
        { code: AcademicErrorCodes.CURRICULUM_VERSION_INVALID },
      );
    }
    this._currentCurriculumVersion = version;
  }
}

export class Unit extends CatalogEntity {
  private constructor(
    id: string,
    code: Code,
    name: string,
    isActive: boolean,
    private _creditPoints: number,
  ) {
    super(id, code, name, isActive);
  }
  static create(input: {
    code: string;
    name: string;
    creditPoints: number;
  }): Unit {
    return new Unit(
      randomUUID(),
      Code.create(input.code),
      requireName(input.name),
      true,
      requireInt(input.creditPoints, 'creditPoints', 1, MAX_CREDIT_POINTS),
    );
  }
  static restore(r: {
    id: string;
    code: string;
    name: string;
    creditPoints: number;
    isActive: boolean;
  }): Unit {
    return new Unit(
      r.id,
      Code.create(r.code),
      r.name,
      r.isActive,
      r.creditPoints,
    );
  }
  get creditPoints(): number {
    return this._creditPoints;
  }
  update(patch: {
    name?: string;
    creditPoints?: number;
    isActive?: boolean;
  }): void {
    this.applyCommon(patch);
    if (patch.creditPoints !== undefined)
      this._creditPoints = requireInt(
        patch.creditPoints,
        'creditPoints',
        1,
        MAX_CREDIT_POINTS,
      );
  }
}
