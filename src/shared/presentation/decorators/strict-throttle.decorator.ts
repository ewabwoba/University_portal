import { SetMetadata } from '@nestjs/common';
import { STRICT_THROTTLE_KEY } from '../../constants/metadata.constants.js';

/** Applies the tighter STRICT_THROTTLE_* limit (credential endpoints). */
export const StrictThrottle = (): MethodDecorator & ClassDecorator =>
  SetMetadata(STRICT_THROTTLE_KEY, true);
