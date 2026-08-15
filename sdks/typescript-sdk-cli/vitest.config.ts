import { defineConfig, configDefaults } from 'vite-plus/test/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: [...configDefaults.exclude, 'dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'bin/**'],
      thresholds: {
        lines: 46,
        branches: 32,
        functions: 37,
        statements: 44,
      },
    },
  },
});
