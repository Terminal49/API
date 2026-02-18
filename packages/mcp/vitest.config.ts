import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts', 'tests/**/*.ts'],
      exclude: ['src/resources/*.ts'],
      thresholds: {
        branches: 40,
        functions: 55,
        lines: 57,
        statements: 57,
      },
    },
  },
});
