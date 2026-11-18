import { configDefaults, defineConfig } from 'vite-plus';

export default defineConfig({
  lint: {
    options: { typeAware: true, typeCheck: true },
    ignorePatterns: [
      'tests/reference-cli/**',
      '**/.agents/skills/**',
      'docs/library-plan/init-plan.md',
      'docs/library-plan/library-plan.md',
      'docs/archive/**',
      'apps/*/env.ts',
      'examples/*/env.ts',
      'tests/adapter-contract/env.ts',
      'tests/adapter-contract/generated/**',
    ],
  },
  fmt: {
    singleQuote: true,
    ignorePatterns: [
      'tests/reference-cli/**',
      '**/.agents/skills/**',
      'docs/library-plan/init-plan.md',
      'docs/library-plan/library-plan.md',
      'docs/archive/**',
      'apps/*/env.ts',
      'examples/*/env.ts',
      'tests/adapter-contract/env.ts',
      'tests/adapter-contract/generated/**',
    ],
  },
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'examples/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'examples/checkout-web/**'],
    environment: 'node',
    passWithNoTests: false,
  },
});
