import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaContext } from '../../../../shared/infrastructure/prisma/prisma-context.js';
import type {
  PermissionView,
  RoleRepository,
  RoleView,
} from '../../domain/repositories/role.repository.js';

const ROLE_INCLUDE = {
  permissions: { include: { permission: { select: { name: true } } } },
} satisfies Prisma.RoleInclude;
type RoleRow = Prisma.RoleGetPayload<{ include: typeof ROLE_INCLUDE }>;

const toView = (row: RoleRow): RoleView => ({
  id: row.id,
  name: row.name,
  description: row.description,
  isSystem: row.isSystem,
  permissions: row.permissions.map((link) => link.permission.name).sort(),
});

@Injectable()
export class PrismaRoleRepository implements RoleRepository {
  constructor(private readonly context: PrismaContext) {}

  private get db() {
    return this.context.client;
  }

  async findAll(): Promise<RoleView[]> {
    const rows = await this.db.role.findMany({
      include: ROLE_INCLUDE,
      orderBy: { name: 'asc' },
    });
    return rows.map(toView);
  }

  async findById(id: string): Promise<RoleView | null> {
    const row = await this.db.role.findUnique({
      where: { id },
      include: ROLE_INCLUDE,
    });
    return row ? toView(row) : null;
  }

  async findByNames(names: string[]): Promise<RoleView[]> {
    const rows = await this.db.role.findMany({
      where: { name: { in: names } },
      include: ROLE_INCLUDE,
    });
    return rows.map(toView);
  }

  async findAllPermissions(): Promise<PermissionView[]> {
    return this.db.permission.findMany({
      select: { id: true, name: true, module: true, description: true },
      orderBy: [{ module: 'asc' }, { name: 'asc' }],
    });
  }

  async replacePermissions(
    roleId: string,
    permissionNames: string[],
  ): Promise<void> {
    const permissions = await this.db.permission.findMany({
      where: { name: { in: permissionNames } },
      select: { id: true },
    });
    await this.db.rolePermission.deleteMany({ where: { roleId } });
    if (permissions.length > 0) {
      await this.db.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId,
          permissionId: permission.id,
        })),
      });
    }
  }
}
