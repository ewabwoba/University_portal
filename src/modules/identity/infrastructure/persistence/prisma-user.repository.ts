import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { REQUEST_CONTEXT } from '../../../../shared/application/ports/request-context.port.js';
import type { RequestContextAccessor } from '../../../../shared/application/ports/request-context.port.js';
import {
  ConcurrencyError,
  ConflictError,
  NotFoundError,
} from '../../../../shared/domain/domain-error.js';
import { PrismaContext } from '../../../../shared/infrastructure/prisma/prisma-context.js';
import { User } from '../../domain/entities/user.entity.js';
import { IdentityErrorCodes } from '../../domain/errors/identity-error-codes.js';
import type {
  UserListFilter,
  UserRepository,
  UserSummary,
} from '../../domain/repositories/user.repository.js';
import { Email } from '../../domain/value-objects/email.vo.js';

const UNIQUE_VIOLATION = 'P2002';
const USER_INCLUDE = {
  roles: { include: { role: { select: { name: true } } } },
} satisfies Prisma.UserInclude;
type UserRow = Prisma.UserGetPayload<{ include: typeof USER_INCLUDE }>;

const toDomain = (row: UserRow): User =>
  User.restore(row.id, {
    email: Email.create(row.email),
    passwordHash: row.passwordHash,
    phoneNumber: row.phoneNumber,
    isActive: row.isActive,
    failedLoginAttempts: row.failedLoginAttempts,
    lockedUntil: row.lockedUntil,
    lastLoginAt: row.lastLoginAt,
    passwordChangedAt: row.passwordChangedAt,
    roles: row.roles.map((link) => link.role.name),
    version: row.version,
    createdAt: row.createdAt,
  });

const toSummary = (row: UserRow): UserSummary => ({
  id: row.id,
  email: row.email,
  phoneNumber: row.phoneNumber,
  isActive: row.isActive,
  roles: row.roles.map((link) => link.role.name).sort(),
  lastLoginAt: row.lastLoginAt,
  createdAt: row.createdAt,
});

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === UNIQUE_VIOLATION;

const emailTaken = (cause: unknown) =>
  new ConflictError('A user with this email already exists.', {
    code: IdentityErrorCodes.EMAIL_ALREADY_REGISTERED,
    cause,
  });

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(
    private readonly context: PrismaContext,
    @Inject(REQUEST_CONTEXT)
    private readonly requestContext: RequestContextAccessor,
  ) {}

  private get db() {
    return this.context.client;
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.db.user.findUnique({
      where: { id },
      include: USER_INCLUDE,
    });
    return row ? toDomain(row) : null;
  }

  async findByEmail(email: Email): Promise<User | null> {
    const row = await this.db.user.findUnique({
      where: { email: email.value },
      include: USER_INCLUDE,
    });
    return row ? toDomain(row) : null;
  }

  async insert(user: User): Promise<void> {
    const roles = await this.resolveRoles(user.roles);
    try {
      await this.db.user.create({
        data: {
          id: user.id,
          email: user.email.value,
          passwordHash: user.passwordHash,
          phoneNumber: user.phoneNumber,
          isActive: user.isActive,
          passwordChangedAt: user.passwordChangedAt,
          version: user.version,
          createdAt: user.createdAt,
          roles: {
            create: roles.map((role) => ({
              roleId: role.id,
              assignedBy: this.actorId(),
            })),
          },
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw emailTaken(error);
      throw error;
    }
  }

  async update(user: User): Promise<void> {
    try {
      const result = await this.db.user.updateMany({
        where: { id: user.id, version: user.version },
        data: {
          email: user.email.value,
          passwordHash: user.passwordHash,
          phoneNumber: user.phoneNumber,
          isActive: user.isActive,
          passwordChangedAt: user.passwordChangedAt,
          version: { increment: 1 },
        },
      });
      if (result.count === 0) {
        throw new ConcurrencyError(
          'The user was modified by someone else. Reload and try again.',
          {
            code: 'USER_VERSION_CONFLICT',
          },
        );
      }
    } catch (error) {
      if (isUniqueViolation(error)) throw emailTaken(error);
      throw error;
    }
    await this.syncRoles(user);
  }

  async incrementFailedLogins(userId: string): Promise<number> {
    const row = await this.db.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: { increment: 1 } },
      select: { failedLoginAttempts: true },
    });
    return row.failedLoginAttempts;
  }

  async lockUntil(userId: string, until: Date): Promise<void> {
    await this.db.user.update({
      where: { id: userId },
      data: { lockedUntil: until },
    });
  }

  async recordSuccessfulLogin(userId: string, now: Date): Promise<void> {
    await this.db.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: now },
    });
  }

  async findSummaryById(id: string): Promise<UserSummary | null> {
    const row = await this.db.user.findUnique({
      where: { id },
      include: USER_INCLUDE,
    });
    return row ? toSummary(row) : null;
  }

  async findSummaries(
    filter: UserListFilter,
    page: { skip: number; limit: number },
  ): Promise<{ items: UserSummary[]; total: number }> {
    const where: Prisma.UserWhereInput = {
      ...(filter.isActive !== undefined ? { isActive: filter.isActive } : {}),
      ...(filter.search
        ? { email: { contains: filter.search, mode: 'insensitive' } }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.user.findMany({
        where,
        include: USER_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: page.skip,
        take: page.limit,
      }),
      this.db.user.count({ where }),
    ]);
    return { items: rows.map(toSummary), total };
  }

  private actorId(): string | undefined {
    return this.requestContext.get().principal?.id;
  }

  private async resolveRoles(
    names: string[],
  ): Promise<{ id: string; name: string }[]> {
    const roles = await this.db.role.findMany({
      where: { name: { in: names } },
      select: { id: true, name: true },
    });
    if (roles.length !== new Set(names).size) {
      const found = new Set(roles.map((role) => role.name));
      throw new NotFoundError('Unknown role(s).', {
        code: IdentityErrorCodes.ROLE_NOT_FOUND,
        details: { roles: names.filter((name) => !found.has(name)) },
      });
    }
    return roles;
  }

  private async syncRoles(user: User): Promise<void> {
    const existing = await this.db.userRole.findMany({
      where: { userId: user.id },
      select: { roleId: true, role: { select: { name: true } } },
    });
    const wanted = new Set(user.roles);
    const current = new Set(existing.map((link) => link.role.name));

    const toRemove = existing
      .filter((link) => !wanted.has(link.role.name))
      .map((link) => link.roleId);
    if (toRemove.length > 0) {
      await this.db.userRole.deleteMany({
        where: { userId: user.id, roleId: { in: toRemove } },
      });
    }

    const toAdd = [...wanted].filter((name) => !current.has(name));
    if (toAdd.length > 0) {
      const roles = await this.resolveRoles(toAdd);
      await this.db.userRole.createMany({
        data: roles.map((role) => ({
          userId: user.id,
          roleId: role.id,
          assignedBy: this.actorId(),
        })),
      });
    }
  }
}
