import { Global, Module, RequestMethod } from '@nestjs/common';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { REQUEST_CONTEXT } from './application/ports/request-context.port.js';
import { AlsRequestContext } from './infrastructure/request-context/als-request-context.js';
import { RequestContextMiddleware } from './presentation/middleware/request-context.middleware.js';

/** Composition module: binds the context port and installs the middleware that populates it. */
@Global()
@Module({
  providers: [
    { provide: REQUEST_CONTEXT, useClass: AlsRequestContext },
    RequestContextMiddleware,
  ],
  exports: [REQUEST_CONTEXT],
})
export class RequestContextModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestContextMiddleware)
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
