import { HttpException, HttpStatus } from '@nestjs/common';
import type { FieldError } from './problem-details.js';

export class RequestValidationException extends HttpException {
  constructor(readonly errors: FieldError[]) {
    super('Request validation failed.', HttpStatus.UNPROCESSABLE_ENTITY);
  }
}
