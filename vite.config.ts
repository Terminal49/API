import { defineConfig } from 'vite-plus';

// Single source of truth for Vite+ formatting and linting. Vite+ resolves
// only this root config in a monorepo; per-package variation belongs in
// `fmt.overrides` / `lint.overrides`, never in workspace-level vite.config.ts
// files (those are silently ignored by `vp fmt` / `vp lint`).
const ignorePatterns = [
  '.agent/**',
  '.agents/**',
  '.claude/**',
  '.codex/**',
  '.continue/**',
  '.cursor/**',
  '.gemini/**',
  '.opencode/**',
  '.pi/**',
  '.roo/**',
  '.windsurf/**',
  'docs/sdk/reference/**',
  'sdks/typescript-sdk/src/generated/**',
  'tools/oxlint/anti-slop/**',
];

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
    arrowParens: 'always',
    bracketSameLine: false,
    bracketSpacing: true,
    ignorePatterns,
  },
  lint: {
    ignorePatterns,
    jsPlugins: [
      { name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' },
      { name: 'anti-slop', specifier: './tools/oxlint/anti-slop/index.ts' },
    ],
    rules: {
      'vite-plus/prefer-vite-plus-imports': 'error',
      // Clean-baseline anti-slop rules: zero findings at adoption time, so
      // new violations fail lint immediately.
      'anti-slop/no-object-parameters': 'error',
      'anti-slop/no-reflect-apply': 'error',
      'anti-slop/no-reflect-get': 'error',
      'anti-slop/no-unknown-type-aliases': 'error',
      'anti-slop/no-widen-then-assert': 'error',
      // Baselined rules: pre-existing findings are reported as warnings for
      // incremental cleanup. Promote each to 'error' once its count hits zero.
      'anti-slop/no-chained-type-assertions': 'warn',
      'anti-slop/no-conditional-empty-object-spread': 'warn',
      'anti-slop/no-known-value-widening': 'warn',
      'anti-slop/no-module-mocking': 'warn',
      'anti-slop/no-runtime-typeof': 'warn',
      'anti-slop/no-shape-in-symbol-names': 'warn',
      'anti-slop/no-unknown-parameters': 'warn',
      'anti-slop/no-unknown-returns': 'warn',
      'anti-slop/no-unsafe-dictionary-type': 'warn',
      'anti-slop/require-safety-comment-for-type-assertion': 'warn',
    },
    // Type-aware linting stays off deliberately: tsc runs separately (root
    // tsconfig + per-package type-check scripts), and tsgolint cannot resolve
    // workspace dependencies such as @terminal49/sdk before they are built.
    options: { typeAware: false, typeCheck: false },
  },
});
