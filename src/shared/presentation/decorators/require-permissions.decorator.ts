import { SetMetadata, applyDecorators } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { REQUIRED_PERMISSIONS_KEY } from '../../constants/metadata.constants.js';

/** The caller must hold ALL listed permissions. */
export const RequirePermissions = (
  ...permissions: string[]
): MethodDecorator & ClassDecorator =>
  applyDecorators(
    SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions),
    ApiBearerAuth(),
  );
