import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PermissionDefinition } from '../../../../shared/application/permission-definition.js';
import { CLOCK } from '../../../../shared/application/ports/clock.port.js';
import type { Clock } from '../../../../shared/application/ports/clock.port.js';
import type { TypedConfigService } from '../../../../config/app-config.js';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service.js';
import { PASSWORD_HASHER } from '../../application/ports/password-hasher.port.js';
import type { PasswordHasher } from '../../application/ports/password-hasher.port.js';
import { PASSWORD_POLICY } from '../../application/ports/policy.tokens.js';
import {
  SYSTEM_ROLE_DESCRIPTIONS,
  SystemRoles,
} from '../../contracts/system-roles.js';
import type { SystemRole } from '../../contracts/system-roles.js';
import { User } from '../../domain/entities/user.entity.js';
import { USER_REPOSITORY } from '../../domain/repositories/user.repository.js';
import type { UserRepository } from '../../domain/repositories/user.repository.js';
import { PasswordPolicy } from '../../domain/services/password-policy.js';
import { Email } from '../../domain/value-objects/email.vo.js';
import { ROLE_PRESETS } from './role-presets.js';

export interface SeedReport {
  permissions: number;
  rolesCreated: string[];
  superAdminPermissions: number;
  adminCreated: boolean;
}

/** Idempotent: safe to run on every deploy. Code is the source of truth for the permission catalog. */
@Injectable()
export class IdentitySeeder {
  private readonly logger = new Logger(IdentitySeeder.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(PASSWORD_POLICY) private readonly policy: PasswordPolicy,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ConfigService) private readonly config: TypedConfigService,
  ) {}

  async run(catalog: PermissionDefinition[]): Promise<SeedReport> {
    await this.syncPermissions(catalog);
    const rolesCreated = await this.ensureRoles(catalog);
    const superAdminPermissions = await this.syncSuperAdmin();
    const adminCreated = await this.ensureAdminUser();

    const report = {
      permissions: catalog.length,
      rolesCreated,
      superAdminPermissions,
      adminCreated,
    };
    this.logger.log(`Seed complete: ${JSON.stringify(report)}`);
    return report;
  }

  private async syncPermissions(
    catalog: PermissionDefinition[],
  ): Promise<void> {
    for (const permission of catalog) {
      await this.prisma.permission.upsert({
        where: { name: permission.name },
        create: {
          name: permission.name,
          module: permission.module,
          description: permission.description,
        },
        update: {
          module: permission.module,
          description: permission.description,
        },
      });
    }
  }

  private async ensureRoles(
    catalog: PermissionDefinition[],
  ): Promise<string[]> {
    const known = new Set(catalog.map((permission) => permission.name));
    const { reapplyPresets } = this.config.get('seed', { infer: true });
    const created: string[] = [];

    for (const name of Object.values(SystemRoles) as SystemRole[]) {
      const existing = await this.prisma.role.findUnique({ where: { name } });
      const role = existing
        ? await this.prisma.role.update({
            where: { name },
            data: {
              description: SYSTEM_ROLE_DESCRIPTIONS[name],
              isSystem: true,
            },
          })
        : await this.prisma.role.create({
            data: {
              name,
              description: SYSTEM_ROLE_DESCRIPTIONS[name],
              isSystem: true,
            },
          });
      if (!existing) created.push(name);

      // New roles get their preset; existing roles only when explicitly asked, and only ever additively.
      if (existing && !reapplyPresets) continue;
      const preset = (ROLE_PRESETS[name] ?? []).filter((permission) =>
        known.has(permission),
      );
      if (preset.length === 0) continue;
      const rows = await this.prisma.permission.findMany({
        where: { name: { in: preset } },
        select: { id: true },
      });
      await this.prisma.rolePermission.createMany({
        data: rows.map((row) => ({ roleId: role.id, permissionId: row.id })),
        skipDuplicates: true,
      });
    }
    return created;
  }

  private async syncSuperAdmin(): Promise<number> {
    const role = await this.prisma.role.findUniqueOrThrow({
      where: { name: SystemRoles.SUPER_ADMIN },
    });
    const all = await this.prisma.permission.findMany({ select: { id: true } });
    await this.prisma.rolePermission.createMany({
      data: all.map((permission) => ({
        roleId: role.id,
        permissionId: permission.id,
      })),
      skipDuplicates: true,
    });
    return all.length;
  }

  private async ensureAdminUser(): Promise<boolean> {
    const { adminEmail, adminPassword } = this.config.get('seed', {
      infer: true,
    });
    if (!adminEmail || !adminPassword) {
      this.logger.warn(
        'SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set: skipping admin user.',
      );
      return false;
    }

    const email = Email.create(adminEmail);
    if (await this.users.findByEmail(email)) return false;

    this.policy.assertValid(adminPassword, email);
    const user = User.register({
      email,
      passwordHash: await this.hasher.hash(adminPassword),
      roles: [SystemRoles.SUPER_ADMIN],
      now: this.clock.now(),
    });
    await this.users.insert(user);
    return true;
  }
}
