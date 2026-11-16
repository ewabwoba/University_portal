import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { Observable, catchError, from, mergeMap, of, throwError } from 'rxjs';
import { IDEMPOTENCY_STORE } from '../../application/ports/idempotency-store.port.js';
import type { IdempotencyStore } from '../../application/ports/idempotency-store.port.js';
import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_KEY_PATTERN,
  IDEMPOTENT_REPLAYED_HEADER,
} from '../../constants/http.constants.js';
import {
  ConflictError,
  UnauthenticatedError,
  ValidationError,
} from '../../domain/domain-error.js';
import type { TypedConfigService } from '../../../config/app-config.js';
import type { AuthenticatedRequest } from '../http/request.types.js';

/**
 * Makes a POST safe to retry. The client sends an `Idempotency-Key`; the first request runs
 * and its response body is stored, later identical requests replay that body without running
 * the handler again. Must run AFTER authentication (it is keyed per authenticated principal).
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(
    @Inject(IDEMPOTENCY_STORE) private readonly store: IdempotencyStore,
    @Inject(ConfigService) private readonly config: TypedConfigService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const req = http.getRequest<AuthenticatedRequest>();
    const res = http.getResponse<Response>();

    const principalId = req.user?.id;
    if (!principalId) {
      throw new UnauthenticatedError(
        'Authentication is required for this operation.',
      );
    }

    const key = this.readKey(req);
    const outcome = await this.store.begin({
      principalId,
      key,
      requestHash: this.hashOf(req),
    });

    switch (outcome.kind) {
      case 'replay':
        res.setHeader(IDEMPOTENT_REPLAYED_HEADER, 'true');
        return of(outcome.responseBody);
      case 'in_progress':
        throw new ConflictError(
          'A request with this Idempotency-Key is still being processed.',
          {
            code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
          },
        );
      case 'mismatch':
        throw new ValidationError(
          'This Idempotency-Key was already used with a different request.',
          {
            code: 'IDEMPOTENCY_KEY_REUSED',
          },
        );
      case 'started':
        break;
    }

    return next.handle().pipe(
      mergeMap(async (body: unknown) => {
        try {
          await this.store.complete({ principalId, key, responseBody: body });
        } catch (error) {
          // The operation already succeeded; do not turn that into a client-visible failure.
          this.logger.error(
            'Failed to record idempotent response.',
            error instanceof Error ? error.stack : String(error),
          );
        }
        return body;
      }),
      catchError((error: unknown) =>
        from(this.store.abandon({ principalId, key })).pipe(
          mergeMap(() => throwError(() => error)),
        ),
      ),
    );
  }

  private readKey(req: AuthenticatedRequest): string {
    const raw = req.headers[IDEMPOTENCY_KEY_HEADER];
    const key = Array.isArray(raw) ? raw[0] : raw;
    const { keyMaxLength } = this.config.get('idempotency', { infer: true });

    if (!key) {
      throw new ValidationError(
        `The ${IDEMPOTENCY_KEY_HEADER} header is required.`,
        {
          code: 'IDEMPOTENCY_KEY_REQUIRED',
        },
      );
    }
    if (key.length > keyMaxLength || !IDEMPOTENCY_KEY_PATTERN.test(key)) {
      throw new ValidationError(
        `The ${IDEMPOTENCY_KEY_HEADER} header is malformed.`,
        {
          code: 'IDEMPOTENCY_KEY_INVALID',
          details: { maxLength: keyMaxLength },
        },
      );
    }
    return key;
  }

  private hashOf(req: AuthenticatedRequest): string {
    return createHash('sha256')
      .update(
        `${req.method}\n${req.originalUrl}\n${JSON.stringify(req.body ?? null)}`,
      )
      .digest('hex');
  }
}
