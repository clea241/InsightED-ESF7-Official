import { defineConfig } from 'vitest/config';

// Backend integration suite. Needs TEST_DATABASE_URL (a disposable database whose name contains "test") and,
// for the stream tests, TEST_REDIS_URL. Suites that need them are skipped with a visible "skipped" count when unset.
export default defineConfig({
  test: {
    include: ['server/tests/integration/**/*.test.js'],
    environment: 'node',
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 60000
  }
});
