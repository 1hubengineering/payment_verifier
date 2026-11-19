import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    entry: {
      index: 'src/index.ts',
      'providers/index': 'src/providers/index.ts',
      storage: 'src/storage.ts',
      jobs: 'src/jobs.ts',
      input: 'src/input.ts',
      comparison: 'src/comparison-entry.ts',
    },
    format: ['esm'],
    dts: { generator: 'oxc' },
    target: 'node24.22.3',
    sourcemap: true,
    clean: true,
  },
});
