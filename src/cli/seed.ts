import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from '../app.module.js';
import { IdentitySeeder } from '../modules/identity/infrastructure/seed/identity.seeder.js';
import { PERMISSION_CATALOG } from '../seed/permission-catalog.js';

/** `npm run seed` - syncs permissions and system roles, and creates the first admin if configured. */
async function seed(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  try {
    await app.get(IdentitySeeder, { strict: false }).run(PERMISSION_CATALOG);
  } finally {
    await app.close();
  }
}

await seed();
