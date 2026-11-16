import { Injectable } from '@nestjs/common';
import { PrismaContext } from '../../../../shared/infrastructure/prisma/prisma-context.js';
import type {
  AccessContext,
  AccessContextReader,
} from '../../application/ports/access-context-reader.port.js';

@Injectable()
export class PrismaAccessContextReader implements AccessContextReader {
  constructor(private readonly context: PrismaContext) {}

  async load(userId: string): Promise<AccessContext | null> {
    const user = await this.context.client.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        isActive: true,
        passwordChangedAt: true,
        roles: {
          select: {
            role: {
              select: {
                name: true,
                permissions: {
                  select: { permission: { select: { name: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      isActive: user.isActive,
      passwordChangedAt: user.passwordChangedAt,
      roles: user.roles.map((link) => link.role.name).sort(),
      permissions: [
        ...new Set(
          user.roles.flatMap((link) =>
            link.role.permissions.map((p) => p.permission.name),
          ),
        ),
      ].sort(),
    };
  }
}
