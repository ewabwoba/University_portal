import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import type { Principal } from '../../application/principal.js';
import type {
  RequestContext,
  RequestContextAccessor,
} from '../../application/ports/request-context.port.js';

@Injectable()
export class AlsRequestContext implements RequestContextAccessor {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  get(): Readonly<RequestContext> {
    return this.storage.getStore() ?? {};
  }

  run<T>(context: RequestContext, work: () => T): T {
    return this.storage.run(context, work);
  }

  setPrincipal(principal: Principal): void {
    const store = this.storage.getStore();
    if (store) store.principal = principal;
  }
}
