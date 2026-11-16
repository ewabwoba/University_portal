import { defineConfig } from 'vitest/config';

/** Needs a migrated PostgreSQL database named *_test, given by TEST_DATABASE_URL. */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/integration/**/*.int-spec.ts'],
    fileParallelism: false, // the files share one database
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
