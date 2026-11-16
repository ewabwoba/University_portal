import { UseInterceptors, applyDecorators } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';
import { IDEMPOTENCY_KEY_HEADER } from '../../constants/http.constants.js';
import { IdempotencyInterceptor } from '../interceptors/idempotency.interceptor.js';

/** Put on state-changing endpoints that must not run twice (payments, registrations). */
export const Idempotent = (): MethodDecorator & ClassDecorator =>
  applyDecorators(
    UseInterceptors(IdempotencyInterceptor),
    ApiHeader({
      name: IDEMPOTENCY_KEY_HEADER,
      required: true,
      description:
        'Unique key for this operation. Retrying with the same key will not repeat it.',
    }),
  );
