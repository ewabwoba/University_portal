import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import helmet from 'helmet';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service.js';
import { testDatabaseUrl } from './database.js';
import { validEnv } from './valid-env.js';

export const ADMIN_EMAIL = 'admin@university.test';
export const ADMIN_PASSWORD = 'Admin-Password-123';

/** Boots the REAL AppModule (all guards, filters, repositories) against the supplied database. */
export async function createTestApp(
  prisma: PrismaService,
  options: { env?: Record<string, string>; extraModules?: Type[] } = {},
): Promise<INestApplication> {
  Object.assign(
    process.env,
    validEnv,
    {
      DATABASE_URL: testDatabaseUrl(),
      THROTTLE_LIMIT: '100000',
      STRICT_THROTTLE_LIMIT: '100000',
      SEED_ADMIN_EMAIL: ADMIN_EMAIL,
      SEED_ADMIN_PASSWORD: ADMIN_PASSWORD,
    },
    options.env,
  );

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule, ...(options.extraModules ?? [])],
  })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();

  const app = moduleRef.createNestApplication();
  app.use(helmet());
  await app.init();
  return app;
}
