import { Inject, Injectable } from '@nestjs/common';
import type { NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { REQUEST_CONTEXT } from '../../application/ports/request-context.port.js';
import type { RequestContextAccessor } from '../../application/ports/request-context.port.js';
import { correlationIdOf } from '../http/request.types.js';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(
    @Inject(REQUEST_CONTEXT) private readonly context: RequestContextAccessor,
  ) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    this.context.run(
      {
        correlationId: correlationIdOf(req),
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
      () => next(),
    );
  }
}
