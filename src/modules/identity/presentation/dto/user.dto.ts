import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../../shared/presentation/pagination/pagination-query.dto.js';
import { PASSWORD_MAX_LENGTH } from '../../domain/services/password-policy.js';

const PHONE_PATTERN = /^\+?[0-9]{7,15}$/;
const EMAIL_FIELD_MAX_LENGTH = 254;
const NAME_MAX_LENGTH = 64;
const MAX_ROLES_PER_USER = 20;
const SEARCH_MAX_LENGTH = 100;

export class CreateUserDto {
  @IsString() @MaxLength(EMAIL_FIELD_MAX_LENGTH) email!: string;
  @IsString() @MaxLength(PASSWORD_MAX_LENGTH) password!: string;

  @IsOptional()
  @Matches(PHONE_PATTERN, {
    message: 'phoneNumber must be 7-15 digits, optionally starting with +',
  })
  phoneNumber?: string;

  @IsArray()
  @ArrayMaxSize(MAX_ROLES_PER_USER)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(NAME_MAX_LENGTH, { each: true })
  roles!: string[];
}

export class AssignRolesDto {
  @IsArray()
  @ArrayMaxSize(MAX_ROLES_PER_USER)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(NAME_MAX_LENGTH, { each: true })
  roles!: string[];
}

export class ListUsersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(SEARCH_MAX_LENGTH)
  search?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  isActive?: boolean;
}
