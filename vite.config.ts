import { defineConfig } from 'vite-plus';

export default defineConfig({
  lint: {
    options: { typeAware: true, typeCheck: true },
    ignorePatterns: [
      'tests/reference-cli/**',
      'docs/library-plan/init-plan.md',
      'docs/library-plan/library-plan.md',
      'docs/archive/**',
      'apps/*/env.ts',
      'tests/adapter-contract/env.ts',
    ],
  },
  fmt: {
    singleQuote: true,
    ignorePatterns: [
      'tests/reference-cli/**',
      'docs/library-plan/init-plan.md',
      'docs/library-plan/library-plan.md',
      'docs/archive/**',
      'apps/*/env.ts',
      'tests/adapter-contract/env.ts',
    ],
  },
  test: {
    include: ['packages/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: false,
  },
});
