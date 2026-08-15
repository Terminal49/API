import { defineConfig } from 'vite-plus';

export default defineConfig({
  fmt: {
    useTabs: false,
    tabWidth: 2,
    printWidth: 80,
    singleQuote: true,
    jsxSingleQuote: false,
    quoteProps: 'as-needed',
    trailingComma: 'all',
    semi: true,
    arrowParens: "always",
    bracketSameLine: false,
    bracketSpacing: true,
    ignorePatterns: [
      'dist/**',
      'node_modules/**',
      'src/generated/**',
      '../../tools/oxlint/anti-slop/**',
    ],
  },
  lint: {
    ignorePatterns: [
      'dist/**',
      'node_modules/**',
      'src/generated/**',
      '../../tools/oxlint/anti-slop/**',
    ],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    jsPlugins: [
      {
        name: 'vite-plus',
        specifier: 'vite-plus/oxlint-plugin',
      },
      {
        name: 'anti-slop',
        specifier: '../../tools/oxlint/anti-slop/index.ts',
      },
    ],
    rules: {
      'vite-plus/prefer-vite-plus-imports': 'error',
      'anti-slop/no-chained-type-assertions': 'warn',
      'anti-slop/no-conditional-empty-object-spread': 'warn',
      'anti-slop/no-known-value-widening': 'warn',
      'anti-slop/no-module-mocking': 'error',
      'anti-slop/no-object-parameters': 'error',
      'anti-slop/no-reflect-apply': 'error',
      'anti-slop/no-reflect-get': 'error',
      'anti-slop/no-runtime-typeof': 'warn',
      'anti-slop/no-shape-in-symbol-names': 'warn',
      'anti-slop/no-unknown-parameters': 'warn',
      'anti-slop/no-unknown-returns': 'warn',
      'anti-slop/no-unknown-type-aliases': 'error',
      'anti-slop/no-unsafe-dictionary-type': 'warn',
      'anti-slop/no-widen-then-assert': 'error',
      'anti-slop/require-safety-comment-for-type-assertion': 'warn',
    },
  },
});
