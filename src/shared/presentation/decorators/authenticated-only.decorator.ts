import { SetMetadata, applyDecorators } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { AUTHENTICATED_ONLY_KEY } from '../../constants/metadata.constants.js';

/**
 * Explicitly states "any signed-in user may call this" (e.g. GET /auth/me). Routes are denied
 * unless they declare @Public(), @RequirePermissions() or this, so intent is always visible.
 */
export const AuthenticatedOnly = (): MethodDecorator & ClassDecorator =>
  applyDecorators(SetMetadata(AUTHENTICATED_ONLY_KEY, true), ApiBearerAuth());
