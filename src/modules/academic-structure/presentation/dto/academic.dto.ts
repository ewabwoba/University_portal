import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../../shared/presentation/pagination/pagination-query.dto.js';
import { AwardType } from '../../domain/entities/catalog.entities.js';
import { OfferingStatus } from '../../domain/entities/unit-offering.entity.js';

const CODE_MAX = 20;
const NAME_MAX = 150;
const SEARCH_MAX = 100;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_ONLY_MESSAGE = 'must be a date in YYYY-MM-DD format';

const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;
const AWARDS = Object.values(AwardType);
const STATUSES = Object.values(OfferingStatus);

// ── catalogue ──
export class CreateCampusDto {
  @IsString() @MaxLength(CODE_MAX) code!: string;
  @IsString() @MaxLength(NAME_MAX) name!: string;
  @IsOptional() @IsString() @MaxLength(NAME_MAX) location?: string;
}
export class UpdateCampusDto {
  @IsOptional() @IsString() @MaxLength(NAME_MAX) name?: string;
  @IsOptional() @IsString() @MaxLength(NAME_MAX) location?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateFacultyDto {
  @IsUUID() campusId!: string;
  @IsString() @MaxLength(CODE_MAX) code!: string;
  @IsString() @MaxLength(NAME_MAX) name!: string;
}
export class UpdateNamedDto {
  @IsOptional() @IsString() @MaxLength(NAME_MAX) name?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateDepartmentDto {
  @IsUUID() facultyId!: string;
  @IsString() @MaxLength(CODE_MAX) code!: string;
  @IsString() @MaxLength(NAME_MAX) name!: string;
}

export class CreateProgrammeDto {
  @IsUUID() departmentId!: string;
  @IsString() @MaxLength(CODE_MAX) code!: string;
  @IsString() @MaxLength(NAME_MAX) name!: string;
  @IsIn(AWARDS) awardType!: AwardType;
  @Type(() => Number) @IsInt() durationYears!: number;
}
export class UpdateProgrammeDto {
  @IsOptional() @IsString() @MaxLength(NAME_MAX) name?: string;
  @IsOptional() @Type(() => Number) @IsInt() durationYears?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  /** Switch new admissions to the next curriculum version (current + 1, once it has units). */
  @IsOptional() @Type(() => Number) @IsInt() currentCurriculumVersion?: number;
}

export class CreateUnitDto {
  @IsString() @MaxLength(CODE_MAX) code!: string;
  @IsString() @MaxLength(NAME_MAX) name!: string;
  @Type(() => Number) @IsInt() creditPoints!: number;
}
export class UpdateUnitDto {
  @IsOptional() @IsString() @MaxLength(NAME_MAX) name?: string;
  @IsOptional() @Type(() => Number) @IsInt() creditPoints?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class SearchableQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(SEARCH_MAX)
  search?: string;
  @IsOptional() @Transform(toBoolean) @IsBoolean() isActive?: boolean;
}
export class ListCampusesQueryDto extends SearchableQueryDto {}
export class ListUnitsQueryDto extends SearchableQueryDto {}
export class ListFacultiesQueryDto extends SearchableQueryDto {
  @IsOptional() @IsUUID() campusId?: string;
}
export class ListDepartmentsQueryDto extends SearchableQueryDto {
  @IsOptional() @IsUUID() facultyId?: string;
}
export class ListProgrammesQueryDto extends SearchableQueryDto {
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsIn(AWARDS) awardType?: AwardType;
}

// ── curriculum ──
export class AddCurriculumEntryDto {
  @IsUUID() unitId!: string;
  @Type(() => Number) @IsInt() studyYear!: number;
  @Type(() => Number) @IsInt() recommendedSemester!: number;
  @IsOptional() @IsBoolean() isCompulsory?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) curriculumVersion?: number;
}
export class UpdateCurriculumEntryDto {
  @IsOptional() @Type(() => Number) @IsInt() studyYear?: number;
  @IsOptional() @Type(() => Number) @IsInt() recommendedSemester?: number;
  @IsOptional() @IsBoolean() isCompulsory?: boolean;
}
export class SetPrerequisitesDto {
  /** Curriculum-entry ids (not unit ids) from the same programme and version. */
  @IsArray()
  @ArrayMaxSize(30)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  prerequisiteIds!: string[];
}
export class CurriculumQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) version?: number;
}

// ── calendar ──
export class CreateAcademicYearDto {
  @IsString() @MaxLength(CODE_MAX) name!: string;
  @Matches(DATE_ONLY, { message: `startDate ${DATE_ONLY_MESSAGE}` })
  startDate!: string;
  @Matches(DATE_ONLY, { message: `endDate ${DATE_ONLY_MESSAGE}` })
  endDate!: string;
}
export class UpdateAcademicYearDto {
  @IsOptional()
  @Matches(DATE_ONLY, { message: `startDate ${DATE_ONLY_MESSAGE}` })
  startDate?: string;
  @IsOptional()
  @Matches(DATE_ONLY, { message: `endDate ${DATE_ONLY_MESSAGE}` })
  endDate?: string;
}
export class CreateSemesterDto {
  @Type(() => Number) @IsInt() @Max(6) sequence!: number;
  @IsString() @MaxLength(NAME_MAX) name!: string;
  @Matches(DATE_ONLY, { message: `startDate ${DATE_ONLY_MESSAGE}` })
  startDate!: string;
  @Matches(DATE_ONLY, { message: `endDate ${DATE_ONLY_MESSAGE}` })
  endDate!: string;
  /** ISO 8601 date-time, e.g. 2026-08-17T06:00:00Z */
  @IsString() @MaxLength(40) registrationOpensAt!: string;
  @IsString() @MaxLength(40) registrationClosesAt!: string;
  @IsOptional() @IsString() @MaxLength(40) addDropClosesAt?: string;
}
export class UpdateSemesterDto {
  @IsOptional() @IsString() @MaxLength(NAME_MAX) name?: string;
  @IsOptional()
  @Matches(DATE_ONLY, { message: `startDate ${DATE_ONLY_MESSAGE}` })
  startDate?: string;
  @IsOptional()
  @Matches(DATE_ONLY, { message: `endDate ${DATE_ONLY_MESSAGE}` })
  endDate?: string;
  @IsOptional() @IsString() @MaxLength(40) registrationOpensAt?: string;
  @IsOptional() @IsString() @MaxLength(40) registrationClosesAt?: string;
  @IsOptional() @IsString() @MaxLength(40) addDropClosesAt?: string;
}

// ── offerings ──
export class CreateOfferingDto {
  @IsUUID() unitId!: string;
  @IsUUID() semesterId!: string;
  @IsOptional() @IsString() @MaxLength(10) classGroup?: string;
  @Type(() => Number) @IsInt() capacity!: number;
}
export class UpdateOfferingDto {
  @IsOptional() @Type(() => Number) @IsInt() capacity?: number;
  @IsOptional() @IsIn(STATUSES) status?: OfferingStatus;
}
export class ListOfferingsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsUUID() semesterId?: string;
  @IsOptional() @IsUUID() unitId?: string;
  @IsOptional() @IsIn(STATUSES) status?: OfferingStatus;
}
