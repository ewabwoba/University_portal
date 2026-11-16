import { Inject, Injectable } from '@nestjs/common';
import { CLOCK } from '../../../../shared/application/ports/clock.port.js';
import type { Clock } from '../../../../shared/application/ports/clock.port.js';
import { AUDIT_LOG } from '../../../../shared/application/ports/audit-log.port.js';
import type { AuditLog } from '../../../../shared/application/ports/audit-log.port.js';
import { DOMAIN_EVENT_PUBLISHER } from '../../../../shared/application/ports/domain-event-publisher.port.js';
import type { DomainEventPublisher } from '../../../../shared/application/ports/domain-event-publisher.port.js';
import { REQUEST_CONTEXT } from '../../../../shared/application/ports/request-context.port.js';
import type { RequestContextAccessor } from '../../../../shared/application/ports/request-context.port.js';
import { TRANSACTION_MANAGER } from '../../../../shared/application/ports/transaction-manager.port.js';
import type { TransactionManager } from '../../../../shared/application/ports/transaction-manager.port.js';
import { requirePrincipal } from '../../../../shared/application/require-principal.js';
import {
  ConflictError,
  ValidationError,
} from '../../../../shared/domain/domain-error.js';
import { User } from '../../domain/entities/user.entity.js';
import { IdentityErrorCodes } from '../../domain/errors/identity-error-codes.js';
import { ROLE_REPOSITORY } from '../../domain/repositories/role.repository.js';
import type { RoleRepository } from '../../domain/repositories/role.repository.js';
import { USER_REPOSITORY } from '../../domain/repositories/user.repository.js';
import type {
  UserRepository,
  UserSummary,
} from '../../domain/repositories/user.repository.js';
import { PasswordPolicy } from '../../domain/services/password-policy.js';
import { assertCanManageRoles } from '../../domain/services/role-grant-policy.js';
import { Email } from '../../domain/value-objects/email.vo.js';
import { PASSWORD_HASHER } from '../ports/password-hasher.port.js';
import type { PasswordHasher } from '../ports/password-hasher.port.js';
import { PASSWORD_POLICY } from '../ports/policy.tokens.js';

export interface RegisterUserInput {
  email: string;
  password: string;
  phoneNumber?: string;
  roles: string[];
}

@Injectable()
export class RegisterUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(PASSWORD_POLICY) private readonly policy: PasswordPolicy,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactions: TransactionManager,
    @Inject(DOMAIN_EVENT_PUBLISHER)
    private readonly events: DomainEventPublisher,
    @Inject(AUDIT_LOG) private readonly audit: AuditLog,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(REQUEST_CONTEXT)
    private readonly requestContext: RequestContextAccessor,
  ) {}

  async execute(input: RegisterUserInput): Promise<UserSummary> {
    const principal = requirePrincipal(this.requestContext);
    const email = Email.create(input.email);
    this.policy.assertValid(input.password, email);

    const requested = [...new Set(input.roles)];
    const roles = await this.roles.findByNames(requested);
    const known = new Set(roles.map((role) => role.name));
    const missing = requested.filter((name) => !known.has(name));
    if (missing.length > 0) {
      throw new ValidationError('Unknown role(s).', {
        code: IdentityErrorCodes.ROLE_NOT_FOUND,
        details: { roles: missing },
      });
    }
    assertCanManageRoles(principal.permissions, roles);

    const passwordHash = await this.hasher.hash(input.password);

    return this.transactions.run(async () => {
      if (await this.users.findByEmail(email)) {
        throw new ConflictError('A user with this email already exists.', {
          code: IdentityErrorCodes.EMAIL_ALREADY_REGISTERED,
        });
      }

      const user = User.register({
        email,
        passwordHash,
        phoneNumber: input.phoneNumber,
        roles: requested,
        now: this.clock.now(),
      });
      await this.users.insert(user);
      await this.events.publish(user.pullEvents());
      await this.audit.record({
        action: 'USER_CREATED',
        module: 'identity',
        entityName: 'User',
        entityId: user.id,
        newValues: { email: email.value, roles: user.roles },
      });

      return {
        id: user.id,
        email: email.value,
        phoneNumber: user.phoneNumber,
        isActive: user.isActive,
        roles: user.roles,
        lastLoginAt: null,
        createdAt: user.createdAt,
      };
    });
  }
}
