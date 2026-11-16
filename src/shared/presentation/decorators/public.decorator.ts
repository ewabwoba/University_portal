import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../../constants/metadata.constants.js';

/** Opts a route out of authentication. Use sparingly: login, refresh, health probes, webhooks. */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
