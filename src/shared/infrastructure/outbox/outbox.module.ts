import { Global, Module } from '@nestjs/common';
import { DOMAIN_EVENT_PUBLISHER } from '../../application/ports/domain-event-publisher.port.js';
import { OutboxDispatcher } from './outbox.dispatcher.js';
import { OutboxEventPublisher } from './outbox-event.publisher.js';

@Global()
@Module({
  providers: [
    OutboxDispatcher,
    { provide: DOMAIN_EVENT_PUBLISHER, useClass: OutboxEventPublisher },
  ],
  exports: [DOMAIN_EVENT_PUBLISHER],
})
export class OutboxModule {}
