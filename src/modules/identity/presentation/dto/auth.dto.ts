import { IsString, MaxLength, MinLength } from 'class-validator';
import { PASSWORD_MAX_LENGTH } from '../../domain/services/password-policy.js';

const EMAIL_FIELD_MAX_LENGTH = 254;
const REFRESH_TOKEN_MAX_LENGTH = 512;

export class LoginDto {
  @IsString() @MinLength(1) @MaxLength(EMAIL_FIELD_MAX_LENGTH) email!: string;
  @IsString() @MinLength(1) @MaxLength(PASSWORD_MAX_LENGTH) password!: string;
}

export class RefreshTokenDto {
  @IsString()
  @MinLength(1)
  @MaxLength(REFRESH_TOKEN_MAX_LENGTH)
  refreshToken!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(PASSWORD_MAX_LENGTH)
  currentPassword!: string;
  /** Strength is enforced by the password policy, which returns precise violations. */
  @IsString()
  @MinLength(1)
  @MaxLength(PASSWORD_MAX_LENGTH)
  newPassword!: string;
}
