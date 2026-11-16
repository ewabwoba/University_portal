import { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service.js';

/** The suite TRUNCATEs every table, so it refuses to touch any database not named *_test. */
export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Create a database ending in "_test", run `prisma migrate deploy` against it, and export its URL.',
    );
  }
  const name = new URL(url).pathname.replace(/^\//, '');
  if (!name.endsWith('_test')) {
    throw new Error(
      `Refusing to run against database "${name}": its name must end with "_test".`,
    );
  }
  return url;
}

export function createTestPrisma(): PrismaService {
  process.env.DATABASE_URL = testDatabaseUrl();
  return new PrismaService();
}

/** Empties every application table (discovered from the database, so new models are covered automatically). */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (rows.length === 0) return;
  const tables = rows.map((row) => `"${row.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`,
  );
}
