import { Inject, Injectable } from '@nestjs/common';
import { CLOCK } from '../../../../shared/application/ports/clock.port.js';
import type { Clock } from '../../../../shared/application/ports/clock.port.js';
import { AUDIT_LOG } from '../../../../shared/application/ports/audit-log.port.js';
import type { AuditLog } from '../../../../shared/application/ports/audit-log.port.js';
import { TRANSACTION_MANAGER } from '../../../../shared/application/ports/transaction-manager.port.js';
import type { TransactionManager } from '../../../../shared/application/ports/transaction-manager.port.js';
import { REFRESH_TOKEN_REPOSITORY } from '../../domain/repositories/refresh-token.repository.js';
import type { RefreshTokenRepository } from '../../domain/repositories/refresh-token.repository.js';
import { OPAQUE_TOKEN_SERVICE } from '../ports/opaque-token.service.port.js';
import type { OpaqueTokenService } from '../ports/opaque-token.service.port.js';

/** Idempotent and silent: an unknown or already-revoked token is not an error. */
@Injectable()
export class LogoutUseCase {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: RefreshTokenRepository,
    @Inject(OPAQUE_TOKEN_SERVICE) private readonly opaque: OpaqueTokenService,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactions: TransactionManager,
    @Inject(AUDIT_LOG) private readonly audit: AuditLog,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(rawRefreshToken: string): Promise<void> {
    await this.transactions.run(async () => {
      const stored = await this.refreshTokens.findByHash(
        this.opaque.hash(rawRefreshToken),
      );
      if (!stored) return;

      await this.refreshTokens.revokeFamily(stored.familyId, this.clock.now());
      await this.audit.record({
        action: 'LOGOUT',
        module: 'identity',
        entityName: 'User',
        entityId: stored.userId,
        actorId: stored.userId,
      });
    });
  }
}
