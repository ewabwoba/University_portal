import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsString,
  MaxLength,
} from 'class-validator';

const PERMISSION_NAME_MAX_LENGTH = 128;
const MAX_PERMISSIONS_PER_ROLE = 500;

export class UpdateRolePermissionsDto {
  @IsArray()
  @ArrayMaxSize(MAX_PERMISSIONS_PER_ROLE)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(PERMISSION_NAME_MAX_LENGTH, { each: true })
  permissions!: string[];
}
