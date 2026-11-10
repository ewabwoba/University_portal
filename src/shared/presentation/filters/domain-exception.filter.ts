import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import {
  ConflictError, DomainError, ForbiddenError,
  NotFoundError, UnauthorizedError, ValidationError,
} from '../../domain/domain-error';

const STATUS_MAP = new Map<Function, number>([
  [NotFoundError, HttpStatus.NOT_FOUND],
  [ConflictError, HttpStatus.CONFLICT],
  [ValidationError, HttpStatus.UNPROCESSABLE_ENTITY],
  [UnauthorizedError, HttpStatus.UNAUTHORIZED],
  [ForbiddenError, HttpStatus.FORBIDDEN],
]);

@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    let status = HttpStatus.BAD_REQUEST;
    for (const [type, code] of STATUS_MAP) {
      if (error instanceof type) { status = code; break; }
    }
    res.status(status).json({
      statusCode: status,
      code: error.code,
      message: error.message,
    });
  }
}