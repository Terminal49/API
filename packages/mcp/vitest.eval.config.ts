import { defineConfig } from 'vite-plus/test/config';

/**
 * Config for the live tool eval suite (`npm run eval`). Kept separate from the
 * default unit-test run so CI never hits the network: the default `vitest`
 * invocation only matches `*.test.ts`, while this config targets `*.eval.ts`.
 */
export default defineConfig({
  test: {
    include: ['eval/**/*.eval.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // One live backend — run serially to stay friendly to rate limits.
    fileParallelism: false,
    pool: 'forks',
  },
});
