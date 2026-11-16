import { STATUS_CODES } from 'node:http';
import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { DomainError, DomainErrorKind } from '../../domain/domain-error.js';
import {
  BEARER_SCHEME,
  PROBLEM_JSON_CONTENT_TYPE,
  WWW_AUTHENTICATE_HEADER,
} from '../../constants/http.constants.js';
import { correlationIdOf } from '../http/request.types.js';
import type { FieldError, ProblemDetails } from '../http/problem-details.js';
import { RequestValidationException } from '../http/request-validation.exception.js';

const PROBLEM_TYPE_DEFAULT = 'about:blank';
const INTERNAL_ERROR_DETAIL = 'An unexpected error occurred.';
const INTERNAL_ERROR_CODE = 'INTERNAL_ERROR';

const STATUS_BY_KIND: Record<DomainErrorKind, HttpStatus> = {
  [DomainErrorKind.NOT_FOUND]: HttpStatus.NOT_FOUND,
  [DomainErrorKind.CONFLICT]: HttpStatus.CONFLICT,
  [DomainErrorKind.VALIDATION]: HttpStatus.UNPROCESSABLE_ENTITY,
  [DomainErrorKind.UNAUTHENTICATED]: HttpStatus.UNAUTHORIZED,
  [DomainErrorKind.FORBIDDEN]: HttpStatus.FORBIDDEN,
  [DomainErrorKind.BUSINESS_RULE]: HttpStatus.UNPROCESSABLE_ENTITY,
  [DomainErrorKind.CONCURRENCY]: HttpStatus.CONFLICT,
  [DomainErrorKind.UNAVAILABLE]: HttpStatus.SERVICE_UNAVAILABLE,
};

const titleFor = (status: number): string => STATUS_CODES[status] ?? 'Error';
const codeFor = (status: number): string =>
  titleFor(status)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_');

interface Described {
  status: number;
  detail: string;
  code: string;
  errors?: FieldError[];
  details?: Record<string, unknown>;
}

/** Single place where every failure becomes one consistent RFC 9457 response. */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') throw exception;

    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    if (res.headersSent) return;

    const described = this.describe(exception);
    const correlationId = correlationIdOf(req);

    if (described.status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // Log the real cause server-side; the client only ever sees the sanitised message.
      this.logger.error(
        { correlationId, path: req.path, code: described.code },
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ProblemDetails = {
      type: PROBLEM_TYPE_DEFAULT,
      title: titleFor(described.status),
      status: described.status,
      detail: described.detail,
      instance: req.path,
      code: described.code,
      correlationId,
      timestamp: new Date().toISOString(),
      ...(described.errors ? { errors: described.errors } : {}),
      ...(described.details ? { details: described.details } : {}),
    };

    if (described.status === HttpStatus.UNAUTHORIZED) {
      res.setHeader(WWW_AUTHENTICATE_HEADER, BEARER_SCHEME);
    }

    res.status(described.status).type(PROBLEM_JSON_CONTENT_TYPE).json(body);
  }

  private describe(exception: unknown): Described {
    if (exception instanceof DomainError) {
      return {
        status: STATUS_BY_KIND[exception.kind],
        detail: exception.message,
        code: exception.code,
        details: exception.details,
      };
    }

    if (exception instanceof RequestValidationException) {
      return {
        status: exception.getStatus(),
        detail: exception.message,
        code: 'VALIDATION_FAILED',
        errors: exception.errors,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        status,
        detail: this.messageOf(exception),
        code: codeFor(status),
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: INTERNAL_ERROR_DETAIL,
      code: INTERNAL_ERROR_CODE,
    };
  }

  private messageOf(exception: HttpException): string {
    const response = exception.getResponse();
    if (typeof response === 'string') return response;

    const message = (response as { message?: unknown }).message;
    if (Array.isArray(message)) return message.join('; ');
    return typeof message === 'string' ? message : exception.message;
  }
}
